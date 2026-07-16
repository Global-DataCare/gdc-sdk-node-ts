// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import { randomBytes } from 'node:crypto';
import type { JWK } from 'gdc-common-utils-ts/models/jwk';
import type { ActorKind } from 'gdc-common-utils-ts/models/actor-session';
import type { WalletExecutionContext } from 'gdc-sdk-core-ts';
import { NodeManagedWallet } from './node-managed-wallet.js';
import { NodeHttpClient } from './node-runtime-client.js';
import type { RouteContext } from './individual-onboarding.js';
import type { SecureDidcommTransportAdapter } from 'gdc-sdk-core-ts';
import {
  ProfilePinRejectedError,
  openServerProfileSecret,
  protectServerProfileSecret,
  type PinProtectedProfileSecret,
  type ProfileProtectionOptions,
  type ServerProfileSealer,
} from './server-profile-protection.js';

export type { ServerProfileSealer } from './server-profile-protection.js';

export type ServerActorMode = 'self' | 'controller' | 'member';

/** Durable public metadata plus PIN-and-host protected private material. */
export type ServerProfileRecord = Readonly<{
  profileId: string;
  ownerId: string;
  actorKind: ActorKind;
  actorMode: ServerActorMode;
  actorDid: string;
  profileDid: string;
  providerDid: string;
  routeContext: RouteContext;
  allowedSubjectDids: string[];
  clientId: string;
  deviceDid: string;
  publicJwks: Record<string, unknown>[];
  protectedWalletSeed: PinProtectedProfileSecret;
  protectedVpToken: PinProtectedProfileSecret;
  failedUnlocks: number;
  lockedUntil?: string;
  createdAt: string;
  updatedAt: string;
}>;

export type ServerProfileSessionRecord = Readonly<{
  sessionId: string;
  ownerId: string;
  profileId: string;
  subjectDid: string;
  scopes: string[];
  sealedUnlockedWalletSeed: string;
  sealedAccessToken: string;
  expiresAt: string;
}>;

/** Persistence port; implementations must isolate environment and tenant data. */
export type ServerProfileStore = Readonly<{
  listProfiles(ownerId: string): Promise<ServerProfileRecord[]>;
  getProfile(profileId: string): Promise<ServerProfileRecord | undefined>;
  putProfile(profile: ServerProfileRecord): Promise<void>;
  getSession(sessionId: string): Promise<ServerProfileSessionRecord | undefined>;
  putSession(session: ServerProfileSessionRecord): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
}>;

export type ServerProfileEnrollmentInput = Readonly<{
  ownerId: string;
  profileId: string;
  actorKind: ActorKind;
  actorMode: ServerActorMode;
  actorDid: string;
  profileDid: string;
  providerDid: string;
  routeContext: RouteContext;
  allowedSubjectDids: string[];
  pin: string;
  idToken: string;
  activationCode: string;
  vpToken: string;
}>;

/** One explicit unlock request; scopes and subject remain session-bound. */
export type ServerProfileUnlockInput = Readonly<{
  ownerId: string;
  profileId: string;
  subjectDid: string;
  scopes: string[];
  pin: string;
  idToken: string;
}>;

/** Material available only during an authenticated, unexpired server session. */
export type ResolvedServerProfileSession = Readonly<{
  sessionId: string;
  profile: ServerProfileRecord;
  subjectDid: string;
  scopes: string[];
  accessToken: string;
  secureTransportAdapter: SecureDidcommTransportAdapter;
}>;

export type ServerProfileSessionManagerOptions = Readonly<{
  store: ServerProfileStore;
  sealer: ServerProfileSealer;
  gatewayBaseUrl: string;
  recipientDid: string;
  resolveRecipientJwk: (recipientDid: string) => Promise<JWK>;
  fetchImpl?: typeof fetch;
  sessionTtlSeconds?: number;
  maxFailedUnlocks?: number;
  lockSeconds?: number;
  profileProtection?: ProfileProtectionOptions;
  now?: () => Date;
}>;

/**
 * Coordinates device registration, two-factor profile protection and SMART sessions.
 *
 * Persisted seeds require both the PIN-derived key and the host KEK. After a
 * successful unlock, a short-lived host-sealed seed is copied into the server
 * session so subsequent requests do not need to resend the PIN. Expiring or
 * locking the session removes that temporary bypass.
 */
export class ServerProfileSessionManager {
  public constructor(private readonly options: ServerProfileSessionManagerOptions) {}

  public async enroll(input: ServerProfileEnrollmentInput): Promise<ServerProfileRecord> {
    requireEnrollment(input);
    const seed = randomBytes(32).toString('base64url');
    const wallet = await this.createWallet(input.profileId, seed);
    const context = walletContext(input.profileId);
    const publicKeys = await wallet.getPublicJwks(context, {});
    const client = this.createClient(input.routeContext, input.idToken);
    const activation = await client.activateProfileDeviceWithActivationRequest({
      ...input.routeContext,
      activationCode: input.activationCode,
      idToken: input.idToken,
      dcrPayload: {
        application_type: 'web',
        actor_did: input.actorDid,
        profile_did: input.profileDid,
        jwks: { keys: publicKeys.map((entry) => entry.publicJwk) },
      },
    });
    const dcrBody = terminalBody(activation.dcr.poll.body);
    const clientId = findText(dcrBody, ['client_id', 'clientId']);
    if (!clientId) throw new Error('GW DCR did not return client_id.');
    const deviceDid = findText(dcrBody, ['device_did', 'deviceDid', 'did']) || clientId;
    const now = this.now();
    const record: ServerProfileRecord = {
      profileId: input.profileId,
      ownerId: input.ownerId,
      actorKind: input.actorKind,
      actorMode: input.actorMode,
      actorDid: input.actorDid,
      profileDid: input.profileDid,
      providerDid: input.providerDid,
      routeContext: input.routeContext,
      allowedSubjectDids: unique(input.allowedSubjectDids),
      clientId,
      deviceDid,
      publicJwks: publicKeys.map((entry) => entry.publicJwk as Record<string, unknown>),
      protectedWalletSeed: await protectServerProfileSecret(seed, input.pin, `${input.profileId}:wallet-seed`, this.options.sealer, this.options.profileProtection),
      protectedVpToken: await protectServerProfileSecret(input.vpToken, input.pin, `${input.profileId}:vp-token`, this.options.sealer, this.options.profileProtection),
      failedUnlocks: 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    await this.options.store.putProfile(record);
    return record;
  }

  public listProfiles(ownerId: string): Promise<ServerProfileRecord[]> {
    return this.options.store.listProfiles(ownerId);
  }

  public async unlock(input: ServerProfileUnlockInput): Promise<ResolvedServerProfileSession> {
    const profile = await this.requireOwnedProfile(input.ownerId, input.profileId);
    this.requireSubject(profile, input.subjectDid);
    const now = this.now();
    if (profile.lockedUntil && new Date(profile.lockedUntil) > now) {
      throw new Error('Profile is temporarily locked after failed PIN attempts.');
    }
    let seed: string;
    let vpToken: string;
    try {
      seed = await openServerProfileSecret(profile.protectedWalletSeed, input.pin, `${profile.profileId}:wallet-seed`, this.options.sealer);
      vpToken = await openServerProfileSecret(profile.protectedVpToken, input.pin, `${profile.profileId}:vp-token`, this.options.sealer);
    } catch (reason) {
      if (!(reason instanceof ProfilePinRejectedError)) throw reason;
      const failures = profile.failedUnlocks + 1;
      const max = this.options.maxFailedUnlocks ?? 5;
      const lockedUntil = failures >= max
        ? new Date(now.getTime() + (this.options.lockSeconds ?? 300) * 1000).toISOString()
        : undefined;
      await this.options.store.putProfile({ ...profile, failedUnlocks: failures, lockedUntil, updatedAt: now.toISOString() });
      throw new Error('Profile PIN rejected.');
    }
    const wallet = await this.createWallet(profile.profileId, seed);
    const assertion = await buildWalletClientAssertion(wallet, profile, this.options.gatewayBaseUrl, now);
    const token = await this.createClient(profile.routeContext, input.idToken).requestSmartToken({
      ...profile.routeContext,
      actorDid: profile.actorDid,
      subjectDid: input.subjectDid,
      clientId: profile.clientId,
      issuer: profile.clientId,
      audience: this.options.gatewayBaseUrl,
      idToken: input.idToken,
      vpToken,
      clientAssertion: assertion,
      clientAssertionType: 'private_key_jwt',
      smartTokenKind: 'openid-smart',
      scopes: unique(input.scopes),
      tokenCacheKey: `profile:${profile.profileId}:${input.subjectDid}:${unique(input.scopes).join(',')}`,
    });
    if (token.status !== 'fetched' || !token.accessToken) throw new Error('SMART token exchange failed.');
    const sessionId = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + (this.options.sessionTtlSeconds ?? 300) * 1000);
    await this.options.store.putProfile({ ...profile, failedUnlocks: 0, lockedUntil: undefined, updatedAt: now.toISOString() });
    await this.options.store.putSession({
      sessionId,
      ownerId: input.ownerId,
      profileId: profile.profileId,
      subjectDid: input.subjectDid,
      scopes: unique(input.scopes),
      sealedUnlockedWalletSeed: await this.options.sealer.seal(seed, `${sessionId}:unlocked-wallet-seed`),
      sealedAccessToken: await this.options.sealer.seal(token.accessToken, `${sessionId}:access-token`),
      expiresAt: expiresAt.toISOString(),
    });
    return this.resolveSession(input.ownerId, sessionId);
  }

  public async resolveSession(ownerId: string, sessionId: string): Promise<ResolvedServerProfileSession> {
    const session = await this.options.store.getSession(sessionId);
    if (!session || session.ownerId !== ownerId) throw new Error('Profile session not found.');
    if (new Date(session.expiresAt) <= this.now()) {
      await this.options.store.deleteSession(sessionId);
      throw new Error('Profile session expired.');
    }
    const profile = await this.requireOwnedProfile(ownerId, session.profileId);
    const seed = await this.options.sealer.unseal(session.sealedUnlockedWalletSeed, `${sessionId}:unlocked-wallet-seed`);
    const wallet = await this.createWallet(profile.profileId, seed);
    const context = walletContext(profile.profileId);
    return {
      sessionId,
      profile,
      subjectDid: session.subjectDid,
      scopes: session.scopes,
      accessToken: await this.options.sealer.unseal(session.sealedAccessToken, `${sessionId}:access-token`),
      secureTransportAdapter: {
        pack: (message) => wallet.packForRecipientWithContext!(message, this.options.recipientDid, { context }),
        unpack: async (jwe) => (await wallet.unpackWithContext!(jwe, { context })).content,
      },
    };
  }

  public async lock(ownerId: string, sessionId: string): Promise<void> {
    const session = await this.options.store.getSession(sessionId);
    if (session?.ownerId === ownerId) await this.options.store.deleteSession(sessionId);
  }

  private createClient(ctx: RouteContext, bearerToken: string): NodeHttpClient {
    return new NodeHttpClient({
      baseUrl: this.options.gatewayBaseUrl,
      ctx,
      bearerToken,
      fetchImpl: this.options.fetchImpl,
    });
  }

  private async createWallet(profileId: string, seed: string): Promise<NodeManagedWallet> {
    const wallet = new NodeManagedWallet({ resolveRecipientJwk: this.options.resolveRecipientJwk });
    const context = walletContext(profileId);
    await wallet.provisionManagedKeys(context, {
      ownerScope: 'profile',
      purposes: ['actor-signing'],
      mode: 'deterministic',
      seedMaterial: seed,
    });
    await wallet.provisionManagedKeys(context, {
      ownerScope: 'runtime',
      purposes: ['openid-id-token-signing', 'vp-token-signing', 'comm-signing', 'comm-encryption'],
      mode: 'deterministic',
      seedMaterial: seed,
    });
    return wallet;
  }

  private async requireOwnedProfile(ownerId: string, profileId: string): Promise<ServerProfileRecord> {
    const profile = await this.options.store.getProfile(profileId);
    if (!profile || profile.ownerId !== ownerId) throw new Error('Profile not found.');
    return profile;
  }

  private requireSubject(profile: ServerProfileRecord, subjectDid: string): void {
    if (!profile.allowedSubjectDids.includes(subjectDid)) throw new Error('Subject is not linked to this profile.');
  }

  private now(): Date { return this.options.now?.() || new Date(); }
}

async function buildWalletClientAssertion(
  wallet: NodeManagedWallet,
  profile: ServerProfileRecord,
  audience: string,
  now: Date,
): Promise<string> {
  const seconds = Math.floor(now.getTime() / 1000);
  return wallet.signCompactJws!(walletContext(profile.profileId), {
    header: { alg: 'ES384', typ: 'JWT' },
    claims: {
      iss: profile.clientId,
      sub: profile.clientId,
      aud: audience,
      iat: seconds,
      exp: seconds + 300,
      jti: randomBytes(16).toString('base64url'),
    },
    key: { ownerScope: 'runtime', purpose: 'openid-id-token-signing' },
  });
}

function walletContext(profileId: string): WalletExecutionContext {
  return {
    profile: { profileId },
    runtime: { runtimeId: `${profileId}:server-runtime`, runtimeType: 'backend-service' },
  };
}

function requireEnrollment(input: ServerProfileEnrollmentInput): void {
  for (const [name, value] of Object.entries({
    ownerId: input.ownerId,
    profileId: input.profileId,
    actorDid: input.actorDid,
    profileDid: input.profileDid,
    providerDid: input.providerDid,
    activationCode: input.activationCode,
    vpToken: input.vpToken,
  })) if (!String(value || '').trim()) throw new Error(`Profile enrollment requires ${name}.`);
  if (!input.allowedSubjectDids.length) throw new Error('Profile enrollment requires an allowed subject.');
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))].sort();
}

function terminalBody(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'body' in value) {
    return (value as Record<string, unknown>).body || value;
  }
  return value;
}

function findText(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    for (const item of value) { const found = findText(item, keys); if (found) return found; }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const found = String(record[key] || '').trim();
    if (found) return found;
  }
  for (const child of Object.values(record)) {
    const found = findText(child, keys);
    if (found) return found;
  }
  return undefined;
}

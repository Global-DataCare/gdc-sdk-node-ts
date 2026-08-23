// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import { randomBytes } from 'node:crypto';
import type { JWK } from 'gdc-common-utils-ts/models/jwk';
import { IdentityDcrMetadataFields, IdentityDeviceInfoFields } from 'gdc-common-utils-ts/constants/identity-auth';
import type { ActorKind } from 'gdc-common-utils-ts/models/actor-session';
import { ActorKinds } from 'gdc-common-utils-ts/constants/actor-session';
import type { LegalOrganizationVerificationTransactionInput } from 'gdc-common-utils-ts/utils/legal-organization-verification-transaction';
import {
  TransportProfiles,
  type ConfidentialStorageProfile,
  type PollOptions,
  type SubmitAndPollResult,
  type WalletExecutionContext,
} from 'gdc-sdk-core-ts';
import { NodeManagedWallet } from './node-managed-wallet.js';
import { NodeHttpClient } from './node-runtime-client.js';
import type { RouteContext } from './individual-onboarding.js';
import type { HostRouteContext } from './host-onboarding.js';
import { buildIdentityOpenIdSmartTokenPath } from './runtime-paths.js';
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
  /** Stable key-derivation identity. Defaults to profileId for legacy records. */
  walletKeyDerivationId?: string;
  ownerId: string;
  actorKind: ActorKind;
  actorMode: ServerActorMode;
  actorDid: string;
  profileDid: string;
  providerDid: string;
  routeContext: RouteContext;
  allowedSubjectDids: string[];
  clientId: string;
  /** Stable non-secret id of the browser/app installation registered by DCR. */
  clientInstanceId?: string;
  deviceDid: string;
  publicJwks: Record<string, unknown>[];
  /** Public recipient key for local confidential storage; not a DCR communication key. */
  storagePublicJwk?: Record<string, unknown>;
  /** Server-owned policy; browser input is never authoritative for this value. */
  confidentialStorageProfile?: ConfidentialStorageProfile;
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
  /** Explicit per-installation id. Older callers fall back to the first DCR key id. */
  clientInstanceId?: string;
  vpToken: string;
  /** Registered web redirect URIs included in the OpenID DCR metadata. */
  dcrRedirectUris?: string[];
  /** Human-readable DCR client name. */
  dcrClientName?: string;
  /**
   * Optional server-only recovery seed. It must be 32 bytes encoded as
   * base64url and must never be accepted from an untrusted browser payload.
   */
  walletSeed?: string;
  /** Stable identity used to reproduce the same keys independently of profile storage IDs. */
  walletKeyDerivationId?: string;
}>;

export type ServerProfileEnrollmentPublicKey = Readonly<{
  ownerScope: string;
  purpose: string;
  use: string;
  alg: string;
  kid: string;
  publicJwk: Record<string, unknown>;
}>;

/** Server-only existing-tenant reissue performed with deterministic bootstrap keys. */
export type ServerProfileOrganizationIssueInput = Readonly<{
  walletSeed: string;
  walletKeyDerivationId: string;
  bearerToken: string;
  providerDid: string;
  routeContext: RouteContext;
  hostContext: HostRouteContext;
  verificationInput: LegalOrganizationVerificationTransactionInput;
  pollOptions?: PollOptions;
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
  /** Storage adapter available only while the PIN-unlocked session is alive. */
  confidentialStorageAdapter: Readonly<{
    protect(document: Readonly<{ id?: string; content: unknown }>): Promise<unknown>;
    unprotect(document: Readonly<{ id?: string; jwe: string }>): Promise<unknown>;
  }>;
}>;

export type ServerProfileSessionManagerOptions = Readonly<{
  store: ServerProfileStore;
  sealer: ServerProfileSealer;
  gatewayBaseUrl: string;
  resolveRecipientJwk: (recipientDid: string) => Promise<JWK>;
  fetchImpl?: typeof fetch;
  sessionTtlSeconds?: number;
  maxFailedUnlocks?: number;
  lockSeconds?: number;
  profileProtection?: ProfileProtectionOptions;
  /** Product/tenant policy applied to enrollment and upgraded on next PIN unlock. */
  requiredConfidentialStorageProfile?: ConfidentialStorageProfile;
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
    const seed = input.walletSeed || randomBytes(32).toString('base64url');
    if (input.walletSeed) requireBase64UrlSeed32(input.walletSeed);
    const walletKeyDerivationId = normalizedWalletKeyDerivationId(input.walletKeyDerivationId, input.profileId);
    const wallet = await this.createWallet(walletKeyDerivationId, seed);
    const context = walletContext(walletKeyDerivationId);
    const publicKeys = await wallet.getPublicJwks(context, {});
    const clientInstanceId = String(input.clientInstanceId
      || publicKeys.find((entry) => entry.purpose !== 'document-at-rest')?.kid
      || '').trim();
    if (!clientInstanceId) throw new Error('Server profile enrollment requires clientInstanceId or a DCR public key id.');
    const storagePublicJwk = publicKeys.find((entry) => entry.purpose === 'document-at-rest')?.publicJwk;
    if (!storagePublicJwk) throw new Error('Server profile enrollment requires a document-at-rest ML-KEM key.');
    const client = this.createClient(input.routeContext, input.idToken);
    const activation = await client.activateProfileDeviceWithActivationRequest({
      ...input.routeContext,
      activationCode: input.activationCode,
      idToken: input.idToken,
      dcrPayload: {
        [IdentityDcrMetadataFields.ExtendedDeviceInfo]: {
          [IdentityDeviceInfoFields.DeviceId]: clientInstanceId,
        },
        application_type: 'web',
        ...(input.dcrRedirectUris?.length ? { redirect_uris: unique(input.dcrRedirectUris) } : {}),
        ...(input.dcrClientName ? { client_name: input.dcrClientName } : {}),
        actor_did: input.actorDid,
        profile_did: input.profileDid,
        jwks: { keys: publicKeys.filter((entry) => entry.purpose !== 'document-at-rest').map((entry) => entry.publicJwk) },
      },
    });
    const dcrBody = terminalBody(activation.dcr.poll.body);
    const clientId = findText(dcrBody, ['client_id', 'clientId']);
    if (!clientId) throw new Error('GW DCR did not return client_id.');
    const deviceDid = findText(dcrBody, ['device_did', 'deviceDid', 'did']) || clientId;
    const now = this.now();
    const record: ServerProfileRecord = {
      profileId: input.profileId,
      walletKeyDerivationId,
      ownerId: input.ownerId,
      actorKind: input.actorKind,
      actorMode: input.actorMode,
      actorDid: input.actorDid,
      profileDid: input.profileDid,
      providerDid: input.providerDid,
      routeContext: input.routeContext,
      allowedSubjectDids: unique(input.allowedSubjectDids),
      clientId,
      clientInstanceId,
      deviceDid,
      publicJwks: publicKeys.filter((entry) => entry.purpose !== 'document-at-rest').map((entry) => entry.publicJwk as Record<string, unknown>),
      storagePublicJwk: storagePublicJwk as Record<string, unknown>,
      confidentialStorageProfile: this.options.requiredConfidentialStorageProfile ?? 'confidential-basic-v1',
      protectedWalletSeed: await protectServerProfileSecret(seed, input.pin, `${input.profileId}:wallet-seed`, this.options.sealer, this.options.profileProtection),
      protectedVpToken: await protectServerProfileSecret(input.vpToken, input.pin, `${input.profileId}:vp-token`, this.options.sealer, this.options.profileProtection),
      failedUnlocks: 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    await this.options.store.putProfile(record);
    return record;
  }

  /**
   * Derives only the public enrollment descriptors for a server-governed
   * recovery seed. This is intended for pre-DCR controller binding requests;
   * no private material or seed is returned.
   */
  public async prepareEnrollmentPublicKeys(input: Readonly<{
    walletSeed: string;
    walletKeyDerivationId: string;
  }>): Promise<ServerProfileEnrollmentPublicKey[]> {
    requireBase64UrlSeed32(input.walletSeed);
    const walletKeyDerivationId = normalizedWalletKeyDerivationId(input.walletKeyDerivationId, '');
    if (!walletKeyDerivationId) throw new Error('prepareEnrollmentPublicKeys requires walletKeyDerivationId.');
    const wallet = await this.createWallet(walletKeyDerivationId, input.walletSeed);
    const descriptors = await wallet.getPublicJwks(walletContext(walletKeyDerivationId), {});
    return descriptors.map((entry) => ({
      ownerScope: entry.ownerScope,
      purpose: entry.purpose,
      use: entry.use,
      alg: entry.alg,
      kid: entry.kid,
      publicJwk: entry.publicJwk as Record<string, unknown>,
    }));
  }

  /**
   * Reissues an existing organization controller activation through protected
   * DIDComm transport before a durable profile exists. The deterministic seed
   * remains server-only and the caller receives only the normal GW response.
   */
  public async submitLegalOrganizationCredentialReissuanceWithBootstrapWallet(
    input: ServerProfileOrganizationIssueInput,
  ): Promise<SubmitAndPollResult> {
    requireBase64UrlSeed32(input.walletSeed);
    const walletKeyDerivationId = normalizedWalletKeyDerivationId(input.walletKeyDerivationId, '');
    if (!walletKeyDerivationId) {
      throw new Error('submitLegalOrganizationCredentialReissuanceWithBootstrapWallet requires walletKeyDerivationId.');
    }
    const wallet = await this.createWallet(walletKeyDerivationId, input.walletSeed);
    const context = walletContext(walletKeyDerivationId);
    const client = new NodeHttpClient({
      baseUrl: this.options.gatewayBaseUrl,
      ctx: input.routeContext,
      bearerToken: input.bearerToken,
      fetchImpl: this.options.fetchImpl,
      transportProfile: TransportProfiles.DidcommEncryptedForm,
      secureTransportAdapter: {
        pack: (message) => wallet.packForRecipientWithContext!(message, input.providerDid, { context }),
        unpack: async (jwe) => (await wallet.unpackWithContext!(jwe, { context })).content,
      },
    });
    return client.submitLegalOrganizationCredentialReissuance(
      input.hostContext,
      input.verificationInput,
      input.pollOptions,
    );
  }

  /** @deprecated Use `submitLegalOrganizationCredentialReissuanceWithBootstrapWallet`. */
  public async submitLegalOrganizationIssueWithBootstrapWallet(
    input: ServerProfileOrganizationIssueInput,
  ): Promise<SubmitAndPollResult> {
    return this.submitLegalOrganizationCredentialReissuanceWithBootstrapWallet(input);
  }

  public listProfiles(ownerId: string): Promise<ServerProfileRecord[]> {
    return this.options.store.listProfiles(ownerId);
  }

  public async unlock(input: ServerProfileUnlockInput): Promise<ResolvedServerProfileSession> {
    let profile = await this.requireOwnedProfile(input.ownerId, input.profileId);
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
    profile = await this.ensureRequiredStorageProfile(profile, seed);
    const walletKeyDerivationId = profile.walletKeyDerivationId || profile.profileId;
    const wallet = await this.createWallet(walletKeyDerivationId, seed);
    const smartTokenEndpoint = [
      this.options.gatewayBaseUrl.replace(/\/+$/, ''),
      buildIdentityOpenIdSmartTokenPath(profile.routeContext),
    ].join('');
    const assertion = await buildWalletClientAssertion(wallet, profile, smartTokenEndpoint, now);
    const token = await this.createClient(profile.routeContext, input.idToken).requestSmartToken({
      ...profile.routeContext,
      actorDid: profile.actorDid,
      subjectDid: input.subjectDid,
      clientId: profile.clientId,
      issuer: profile.clientId,
      audience: smartTokenEndpoint,
      idToken: input.idToken,
      vpToken,
      clientAssertion: assertion,
      clientAssertionType: 'private_key_jwt',
      smartTokenKind: 'openid-smart',
      acrValues: profileSmartAcrValues(profile.actorKind),
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
    const walletKeyDerivationId = profile.walletKeyDerivationId || profile.profileId;
    const wallet = await this.createWallet(walletKeyDerivationId, seed);
    const context = walletContext(walletKeyDerivationId);
    return {
      sessionId,
      profile,
      subjectDid: session.subjectDid,
      scopes: session.scopes,
      accessToken: await this.options.sealer.unseal(session.sealedAccessToken, `${sessionId}:access-token`),
      secureTransportAdapter: {
        pack: (message) => wallet.packForRecipientWithContext!(
          bindTransportIssuer(message, profile.actorDid),
          profile.providerDid,
          { context },
        ),
        unpack: async (jwe) => (await wallet.unpackWithContext!(jwe, { context })).content,
      },
      confidentialStorageAdapter: {
        protect: (document) => wallet.protectManagedConfidentialData!(document, context),
        unprotect: (document) => wallet.unprotectManagedConfidentialData!(document, context),
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

  private async createWallet(walletKeyDerivationId: string, seed: string): Promise<NodeManagedWallet> {
    const wallet = new NodeManagedWallet({ resolveRecipientJwk: this.options.resolveRecipientJwk });
    const context = walletContext(walletKeyDerivationId);
    await wallet.provisionManagedKeys(context, {
      ownerScope: 'profile',
      purposes: ['actor-signing', 'document-at-rest'],
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

  /**
   * Upgrade legacy profiles deterministically after successful PIN unlock.
   * The protected seed already owns the storage pair, so migration neither
   * exports a private key nor calls KMS/GW. Only its public JWK and policy label
   * are added to the durable profile record.
   */
  private async ensureRequiredStorageProfile(profile: ServerProfileRecord, seed: string): Promise<ServerProfileRecord> {
    const required = this.options.requiredConfidentialStorageProfile ?? profile.confidentialStorageProfile ?? 'confidential-basic-v1';
    if (required !== 'confidential-pqc-v1') return profile;
    const walletKeyDerivationId = profile.walletKeyDerivationId || profile.profileId;
    const wallet = await this.createWallet(walletKeyDerivationId, seed);
    const storageKeys = await wallet.getPublicJwks(walletContext(walletKeyDerivationId), {
      ownerScope: 'profile', purpose: 'document-at-rest', alg: 'ML-KEM-768',
    });
    const storagePublicJwk = storageKeys[0]?.publicJwk as Record<string, unknown> | undefined;
    if (!storagePublicJwk) throw new Error('Required ML-KEM storage key could not be provisioned.');
    const hasKey = profile.storagePublicJwk?.kid === storagePublicJwk.kid;
    if (profile.confidentialStorageProfile === required && hasKey) return profile;
    const upgraded: ServerProfileRecord = {
      ...profile,
      confidentialStorageProfile: required,
      storagePublicJwk,
      updatedAt: this.now().toISOString(),
    };
    await this.options.store.putProfile(upgraded);
    return upgraded;
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

/**
 * Binds every direct resource action and async poll to the actor stored in the
 * server profile. The caller may author the business body and thread id, but
 * cannot replace the issuer used by GW for JWS/DID controller verification.
 */
function bindTransportIssuer(message: Record<string, unknown>, actorDid: string): Record<string, unknown> {
  return { ...message, iss: actorDid };
}

/** Keeps the OpenID proof class aligned with the durable actor profile. */
function profileSmartAcrValues(actorKind: ActorKind): string {
  return actorKind === ActorKinds.IndividualController
    || actorKind === ActorKinds.IndividualMember
    ? 'urn:antifraud:acr:openid4vp:individual'
    : 'urn:antifraud:acr:openid4vp:employee';
}

async function buildWalletClientAssertion(
  wallet: NodeManagedWallet,
  profile: ServerProfileRecord,
  audience: string,
  now: Date,
): Promise<string> {
  const seconds = Math.floor(now.getTime() / 1000);
  return wallet.signCompactJws!(walletContext(profile.walletKeyDerivationId || profile.profileId), {
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

function walletContext(walletKeyDerivationId: string): WalletExecutionContext {
  return {
    profile: { profileId: walletKeyDerivationId },
    runtime: { runtimeId: `${walletKeyDerivationId}:server-runtime`, runtimeType: 'backend-service' },
  };
}

function normalizedWalletKeyDerivationId(value: string | undefined, profileId: string): string {
  return String(value || profileId).trim();
}

function requireBase64UrlSeed32(seed: string): void {
  if (!/^[A-Za-z0-9_-]{43}$/.test(seed) || Buffer.from(seed, 'base64url').byteLength !== 32) {
    throw new Error('Profile enrollment walletSeed must be a 32-byte base64url value.');
  }
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

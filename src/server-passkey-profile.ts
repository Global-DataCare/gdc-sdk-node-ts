// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import { createHash } from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type { ServerProfileSealer } from './server-profile-session.js';

const DEFAULT_CEREMONY_TTL_MS = 5 * 60 * 1000;
const DEFAULT_ACCESS_TTL_MS = 15 * 60 * 1000;

export type ServerPasskeyCredential = Readonly<{
  credentialId: string;
  publicKey: string;
  counter: number;
  transports?: readonly string[];
  ownerId: string;
  loginIdentifier: string;
  profileId: string;
  sealedWalletSeed: string;
  sealedVpToken?: string;
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
}>;

export type ServerPasskeyCeremony = Readonly<{
  kind: 'registration' | 'authentication';
  challenge: string;
  ownerId: string;
  loginIdentifier: string;
  profileId: string;
  expiresAt: string;
}>;

export type ServerPasskeyAccessGrant = Readonly<{
  ownerId: string;
  loginIdentifier: string;
  profileId: string;
  credentialKey: string;
  expiresAt: string;
  createdAt: string;
}>;

export interface ServerPasskeyStore {
  listCredentials(loginIdentifier: string, profileId?: string): Promise<ServerPasskeyCredential[]>;
  getCredential(credentialKey: string): Promise<ServerPasskeyCredential | undefined>;
  getCeremony(ceremonyId: string): Promise<ServerPasskeyCeremony | undefined>;
  putCeremony(ceremonyId: string, ceremony: ServerPasskeyCeremony): Promise<void>;
  completeRegistration(
    ceremonyId: string,
    credentialKey: string,
    credential: ServerPasskeyCredential,
  ): Promise<void>;
  completeAuthentication(
    ceremonyId: string,
    credentialKey: string,
    counter: number,
    accessKey: string,
    access: ServerPasskeyAccessGrant,
  ): Promise<void>;
  consumeAccess(accessKey: string): Promise<ServerPasskeyAccessGrant | undefined>;
}

export interface ServerPasskeyCeremonyAdapter {
  credentialId(response: unknown): string;
  registrationOptions(input: Readonly<{
    ownerId: string;
    loginIdentifier: string;
    profileId: string;
    existing: readonly ServerPasskeyCredential[];
  }>): Promise<Readonly<{ challenge: string; options: unknown }>>;
  verifyRegistration(input: Readonly<{
    response: unknown;
    expectedChallenge: string;
  }>): Promise<Readonly<{
    credentialId: string;
    publicKey: string;
    counter: number;
    transports?: readonly string[];
    deviceType: string;
    backedUp: boolean;
  }>>;
  authenticationOptions(input: Readonly<{
    loginIdentifier: string;
    profileId: string;
    credentials: readonly ServerPasskeyCredential[];
  }>): Promise<Readonly<{ challenge: string; options: unknown }>>;
  verifyAuthentication(input: Readonly<{
    response: unknown;
    expectedChallenge: string;
    credential: ServerPasskeyCredential;
  }>): Promise<Readonly<{ newCounter: number }>>;
}

export type ServerPasskeyProfileSecrets = Readonly<{
  walletSeed: string;
  vpToken?: string;
}>;

export type ServerPasskeyProfileServiceOptions = Readonly<{
  store: ServerPasskeyStore;
  sealer: ServerProfileSealer;
  profiles: Readonly<{
    assertBinding(input: Readonly<{ ownerId: string; loginIdentifier: string; profileId: string }>): Promise<void>;
    openWithPin(input: Readonly<{
      ownerId: string;
      loginIdentifier: string;
      profileId: string;
      pin: string;
    }>): Promise<ServerPasskeyProfileSecrets>;
  }>;
  ceremonies: ServerPasskeyCeremonyAdapter;
  issueLoginToken(loginIdentifier: string): Promise<string>;
  now?: () => Date;
  randomId?: () => string;
  randomToken?: () => string;
  ceremonyTtlMs?: number;
  accessTtlMs?: number;
}>;

/**
 * Server-only passkey ceremony and profile-secret binding.
 *
 * WebAuthn cryptography and durable transactions are injected so portals can
 * use their existing provider adapters while the security state machine stays
 * identical. Wallet seeds are returned only after consuming a short-lived,
 * one-time server grant and are never present in ceremony responses.
 */
export class ServerPasskeyProfileService {
  public constructor(private readonly options: ServerPasskeyProfileServiceOptions) {}

  public async hasCredential(loginIdentifier: string, profileId: string): Promise<boolean> {
    return (await this.options.store.listCredentials(normalizeLoginIdentifier(loginIdentifier), profileId)).length > 0;
  }

  public async beginRegistration(input: Readonly<{ ownerId: string; loginIdentifier: string; profileId: string }>) {
    const loginIdentifier = normalizeLoginIdentifier(input.loginIdentifier);
    await this.options.profiles.assertBinding({ ...input, loginIdentifier });
    const existing = await this.options.store.listCredentials(loginIdentifier, input.profileId);
    const generated = await this.options.ceremonies.registrationOptions({ ...input, loginIdentifier, existing });
    const ceremonyId = this.randomId();
    await this.options.store.putCeremony(ceremonyId, {
      kind: 'registration',
      challenge: generated.challenge,
      ownerId: input.ownerId,
      loginIdentifier,
      profileId: input.profileId,
      expiresAt: this.expiresAt(this.options.ceremonyTtlMs ?? DEFAULT_CEREMONY_TTL_MS),
    });
    return { ceremonyId, options: generated.options };
  }

  public async completeRegistration(input: Readonly<{
    ceremonyId: string;
    ownerId: string;
    loginIdentifier: string;
    pin: string;
    response: unknown;
  }>): Promise<Readonly<{ credentialId: string }>> {
    const ceremony = await this.options.store.getCeremony(input.ceremonyId);
    const loginIdentifier = normalizeLoginIdentifier(input.loginIdentifier);
    requireCeremony(ceremony, 'registration', this.now(), { ownerId: input.ownerId, loginIdentifier });
    await this.options.profiles.assertBinding({ ownerId: input.ownerId, loginIdentifier, profileId: ceremony.profileId });
    const verified = await this.options.ceremonies.verifyRegistration({
      response: input.response,
      expectedChallenge: ceremony.challenge,
    });
    const secrets = await this.options.profiles.openWithPin({
      ownerId: input.ownerId,
      loginIdentifier,
      profileId: ceremony.profileId,
      pin: input.pin,
    });
    const credentialKey = digest(verified.credentialId);
    const credential: ServerPasskeyCredential = {
      credentialId: verified.credentialId,
      publicKey: verified.publicKey,
      counter: verified.counter,
      ...(verified.transports?.length ? { transports: verified.transports } : {}),
      ownerId: input.ownerId,
      loginIdentifier,
      profileId: ceremony.profileId,
      sealedWalletSeed: await this.options.sealer.seal(
        secrets.walletSeed,
        `${verified.credentialId}:passkey-wallet-seed`,
      ),
      ...(secrets.vpToken ? {
        sealedVpToken: await this.options.sealer.seal(
          secrets.vpToken,
          `${verified.credentialId}:passkey-vp-token`,
        ),
      } : {}),
      deviceType: verified.deviceType,
      backedUp: verified.backedUp,
      createdAt: this.now().toISOString(),
    };
    await this.options.store.completeRegistration(input.ceremonyId, credentialKey, credential);
    return { credentialId: verified.credentialId };
  }

  public async beginAuthentication(input: Readonly<{ loginIdentifier: string; profileId?: string }>) {
    const loginIdentifier = normalizeLoginIdentifier(input.loginIdentifier);
    const credentials = await this.options.store.listCredentials(loginIdentifier, input.profileId);
    if (!credentials.length) throw new Error('passkey_not_registered');
    const profileIds = new Set(credentials.map(credential => credential.profileId));
    if (profileIds.size !== 1) throw new Error('passkey_profile_selection_required');
    const first = credentials[0]!;
    const generated = await this.options.ceremonies.authenticationOptions({
      loginIdentifier,
      profileId: first.profileId,
      credentials,
    });
    const ceremonyId = this.randomId();
    await this.options.store.putCeremony(ceremonyId, {
      kind: 'authentication',
      challenge: generated.challenge,
      ownerId: first.ownerId,
      loginIdentifier,
      profileId: first.profileId,
      expiresAt: this.expiresAt(this.options.ceremonyTtlMs ?? DEFAULT_CEREMONY_TTL_MS),
    });
    return { ceremonyId, options: generated.options };
  }

  public async completeAuthentication(input: Readonly<{ ceremonyId: string; response: unknown }>): Promise<Readonly<{
    loginToken: string;
    profileId: string;
    profileAccessToken: string;
  }>> {
    const ceremony = await this.options.store.getCeremony(input.ceremonyId);
    requireCeremony(ceremony, 'authentication', this.now());
    const credentialId = this.options.ceremonies.credentialId(input.response);
    const credentialKey = digest(credentialId);
    const credential = await this.options.store.getCredential(credentialKey);
    if (!credential || credential.ownerId !== ceremony.ownerId || credential.loginIdentifier !== ceremony.loginIdentifier
      || credential.profileId !== ceremony.profileId) throw new Error('passkey_ceremony_invalid');
    await this.options.profiles.assertBinding({
      ownerId: credential.ownerId,
      loginIdentifier: credential.loginIdentifier,
      profileId: credential.profileId,
    });
    const verified = await this.options.ceremonies.verifyAuthentication({
      response: input.response,
      expectedChallenge: ceremony.challenge,
      credential,
    });
    const profileAccessToken = this.randomToken();
    await this.options.store.completeAuthentication(
      input.ceremonyId,
      credentialKey,
      verified.newCounter,
      digest(profileAccessToken),
      {
        ownerId: credential.ownerId,
        loginIdentifier: credential.loginIdentifier,
        profileId: credential.profileId,
        credentialKey,
        expiresAt: this.expiresAt(this.options.accessTtlMs ?? DEFAULT_ACCESS_TTL_MS),
        createdAt: this.now().toISOString(),
      },
    );
    return {
      loginToken: await this.options.issueLoginToken(credential.loginIdentifier),
      profileId: credential.profileId,
      profileAccessToken,
    };
  }

  public async consumeProfileAccess(input: Readonly<{
    accessToken: string;
    ownerId: string;
    profileId: string;
    loginIdentifier?: string;
  }>): Promise<ServerPasskeyProfileSecrets> {
    if (!input.accessToken) throw new Error('passkey_profile_access_required');
    const access = await this.options.store.consumeAccess(digest(input.accessToken));
    const loginIdentifier = input.loginIdentifier ? normalizeLoginIdentifier(input.loginIdentifier) : undefined;
    if (!access || access.ownerId !== input.ownerId || access.profileId !== input.profileId
      || (loginIdentifier && access.loginIdentifier !== loginIdentifier) || new Date(access.expiresAt) <= this.now()) {
      throw new Error('passkey_profile_access_invalid');
    }
    const credential = await this.options.store.getCredential(access.credentialKey);
    if (!credential || credential.ownerId !== input.ownerId || credential.profileId !== input.profileId
      || (loginIdentifier && credential.loginIdentifier !== loginIdentifier)) throw new Error('passkey_profile_access_invalid');
    const walletSeed = await this.options.sealer.unseal(
      credential.sealedWalletSeed,
      `${credential.credentialId}:passkey-wallet-seed`,
    );
    const vpToken = credential.sealedVpToken
      ? await this.options.sealer.unseal(
        credential.sealedVpToken,
        `${credential.credentialId}:passkey-vp-token`,
      )
      : undefined;
    return { walletSeed, ...(vpToken ? { vpToken } : {}) };
  }

  private now(): Date { return this.options.now?.() ?? new Date(); }
  private randomId(): string { return this.options.randomId?.() ?? crypto.randomUUID(); }
  private randomToken(): string {
    return this.options.randomToken?.() ?? Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  }
  private expiresAt(milliseconds: number): string { return new Date(this.now().getTime() + milliseconds).toISOString(); }
}

function normalizeLoginIdentifier(value: string): string {
  const loginIdentifier = String(value || '').trim().toLowerCase();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginIdentifier);
  const isTelephone = /^\+[1-9]\d{7,14}$/.test(loginIdentifier);
  if (!isEmail && !isTelephone) throw new Error('invalid_login_identifier');
  return loginIdentifier;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function requireCeremony(
  ceremony: ServerPasskeyCeremony | undefined,
  kind: ServerPasskeyCeremony['kind'],
  now: Date,
  identity?: Readonly<{ ownerId: string; loginIdentifier: string }>,
): asserts ceremony is ServerPasskeyCeremony {
  if (!ceremony || ceremony.kind !== kind || new Date(ceremony.expiresAt) <= now
    || (identity && (ceremony.ownerId !== identity.ownerId || ceremony.loginIdentifier !== identity.loginIdentifier))) {
    throw new Error('passkey_ceremony_invalid');
  }
}

/** Canonical SimpleWebAuthn adapter used by every Node portal BFF. */
export function createSimpleWebAuthnCeremonyAdapter(input: Readonly<{
  rpName: string;
  rpId: string;
  origins: readonly string[];
}>): ServerPasskeyCeremonyAdapter {
  const rpName = String(input.rpName || '').trim();
  const rpId = String(input.rpId || '').trim();
  const origins = input.origins.map(value => String(value || '').trim()).filter(Boolean);
  if (!rpName || !rpId || !origins.length || origins.some(origin => !origin.startsWith('https://'))) {
    throw new Error('passkey_relying_party_not_configured');
  }
  return {
    credentialId(response) { return String((response as { id?: unknown })?.id || ''); },
    async registrationOptions({ ownerId, loginIdentifier, existing }) {
      const options = await generateRegistrationOptions({
        rpName,
        rpID: rpId,
        userName: loginIdentifier,
        userDisplayName: loginIdentifier,
        userID: new TextEncoder().encode(ownerId),
        attestationType: 'none',
        excludeCredentials: existing.map(credential => ({
          id: credential.credentialId,
          transports: credential.transports as AuthenticatorTransportFuture[] | undefined,
        })),
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        preferredAuthenticatorType: 'localDevice',
      });
      return { challenge: options.challenge, options };
    },
    async verifyRegistration({ response, expectedChallenge }) {
      const verification = await verifyRegistrationResponse({
        response: response as RegistrationResponseJSON,
        expectedChallenge,
        expectedOrigin: [...origins],
        expectedRPID: rpId,
        requireUserVerification: true,
      });
      if (!verification.verified || !verification.registrationInfo) {
        throw new Error('passkey_registration_failed');
      }
      const credential = verification.registrationInfo.credential;
      return {
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString('base64url'),
        counter: credential.counter,
        transports: (response as RegistrationResponseJSON).response.transports,
        deviceType: verification.registrationInfo.credentialDeviceType,
        backedUp: verification.registrationInfo.credentialBackedUp,
      };
    },
    async authenticationOptions({ credentials }) {
      const options = await generateAuthenticationOptions({
        rpID: rpId,
        allowCredentials: credentials.map(credential => ({
          id: credential.credentialId,
          transports: credential.transports as AuthenticatorTransportFuture[] | undefined,
        })),
        userVerification: 'required',
      });
      return { challenge: options.challenge, options };
    },
    async verifyAuthentication({ response, expectedChallenge, credential }) {
      const verification = await verifyAuthenticationResponse({
        response: response as AuthenticationResponseJSON,
        expectedChallenge,
        expectedOrigin: [...origins],
        expectedRPID: rpId,
        credential: {
          id: credential.credentialId,
          publicKey: Uint8Array.from(Buffer.from(credential.publicKey, 'base64url')),
          counter: credential.counter,
          transports: credential.transports as AuthenticatorTransportFuture[] | undefined,
        },
        requireUserVerification: true,
      });
      if (!verification.verified) throw new Error('passkey_authentication_failed');
      return { newCounter: verification.authenticationInfo.newCounter };
    },
  };
}

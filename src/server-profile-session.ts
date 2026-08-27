// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import { randomBytes } from 'node:crypto';
import type { JWK } from 'gdc-common-utils-ts/models/jwk';
import type { ActorKind } from 'gdc-common-utils-ts/models/actor-session';
import { ActorKinds } from 'gdc-common-utils-ts/constants/actor-session';
import type { LegalOrganizationVerificationTransactionInput } from 'gdc-common-utils-ts/utils/legal-organization-verification-transaction';
import {
  readLegalOrganizationVerificationCredentialPairFromResponseBody,
  readServiceControllerCredentialFromResponseBody,
} from 'gdc-common-utils-ts/utils/legal-organization-verification-result';
import {
  addLegalRepresentativeCredential,
  addOrganizationCredential,
  addServiceControllerCredential,
  createVP,
} from 'gdc-common-utils-ts/utils/vp-token';
import {
  TransportProfiles,
  type AppInfo,
  type ConfidentialStorageProfile,
  type PollOptions,
  type SubmitAndPollResult,
  type WalletExecutionContext,
} from 'gdc-sdk-core-ts';
import { NodeManagedWallet } from './node-managed-wallet.js';
import { NodeHttpClient } from './node-runtime-client.js';
import { OrganizationControllerSdk } from './orchestration/organization-controller-sdk.js';
import { ProfessionalSdk } from './orchestration/professional-sdk.js';
import { DigitalTwinSdk } from './orchestration/digital-twin-sdk.js';
import type { SmartTokenExchangeResult } from './smart-token.js';
import type { DigitalTwinSearchInput, DigitalTwinSearchResult } from './digital-twin.js';
import type { RouteContext } from './individual-onboarding.js';
import type { HostRouteContext } from './host-onboarding.js';
import { buildIdentityOpenIdSmartTokenPath } from './runtime-paths.js';
import { createProfileDeviceActivationRequest } from './device-activation.js';
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
  /** Present only when this actor kind requires an independent signed role/relationship VP. */
  protectedVpToken?: PinProtectedProfileSecret;
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
  sealedUnlockedVpToken?: string;
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
  /** Required by key rotation so no session can retain the superseded seed. */
  deleteSessionsForProfile?(profileId: string): Promise<void>;
}>;

export type ServerEmployeeProfileOtpRotationInput = Readonly<{
  ownerId: string;
  profileId: string;
  idToken: string;
  newPin: string;
  redirectUris: string[];
  clientName: string;
}>;

export type ServerEmployeeProfileOtpRotationResult = ServerProfileRecord;

export type ServerProfilePinReplacementInput = Readonly<{
  ownerId: string;
  profileId: string;
  /** Server-authorized seed obtained from a passkey, active wallet session or recovery envelope. */
  authorizedWalletSeed: string;
  /** Required when the durable profile still carries a separately protected legacy VP. */
  authorizedVpToken?: string;
  newPin: string;
}>;

export type ServerProfileEnrollmentInput = Readonly<{
  /** Stable confidential id of the authenticated portal account that owns and lists this profile. */
  ownerId: string;
  /** Stable local id of this wallet/profile record. This is not the DCR `client_id`. */
  profileId: string;
  /** SDK capability family being enrolled, for example an organization controller or employee. */
  actorKind: ActorKind;
  /** Authorization semantics already granted to the profile; never take this from an untrusted UI field. */
  actorMode: ServerActorMode;
  /** Exact role/controller DID used by the actor proof, including the VP issuer when a VP is supplied. */
  actorDid: string;
  /** DID represented by the managed wallet. It may equal `actorDid`, as in a controller enrollment. */
  profileDid: string;
  /** Organization/provider DID whose configured route and policies this profile will use. */
  providerDid: string;
  /** Server-owned tenant, jurisdiction and sector routing context. */
  routeContext: RouteContext;
  /** Server-derived subject authorization boundary; never accept arbitrary browser-selected DIDs here. */
  allowedSubjectDids: string[];
  /**
   * Unlock secret for the locally protected wallet seed. It is neither sent
   * to GW nor persisted by the SDK. The integrating product decides whether
   * it is user-entered or a separately stored, high-entropy per-profile BFF
   * secret; it must never be logged or reused as one shared deployment PIN.
   */
  pin: string;
  /**
   * Signed OIDC `id_token` used by GW to bind the activation code to an
   * authenticated account/email. Its issuer, audience, signature `kid` and
   * public JWKS must be trusted by GW. A controller VP cannot replace it.
   */
  idToken: string;
  /** One-time code returned by the completed organization flow or employee `License/_issue`. */
  activationCode: string;
  /**
   * Optional explicit installation identity. Normally omit it so the SDK
   * derives the identity from the wallet key it creates for this profile.
   */
  clientInstanceId?: string;
  /**
   * Signed actor/controller VP protected for later SMART operations. Required
   * for organization/professional/member actors. Individual-controller
   * profiles omit it: their account `id_token`, DCR device binding and
   * provider-side relationship policy are evaluated independently.
   */
  vpToken?: string;
  /**
   * High-level employee/professional proof source. When supplied, the SDK
   * builds and signs the VP with the managed DCR wallet after registration;
   * callers do not compose JWT/JWK material.
   */
  professionalProof?: Readonly<{
    role: string;
    email?: string;
    sameAs?: string | readonly string[];
    telephone?: string;
    credentialMaterial?: string;
  }>;
  /** Redirect URIs owned by this portal/app installation. */
  redirectUris?: string[];
  /** Human-readable portal/app name. */
  clientName?: string;
  /** @deprecated Use `redirectUris`; OpenID metadata is authored internally. */
  dcrRedirectUris?: string[];
  /** @deprecated Use `clientName`; OpenID metadata is authored internally. */
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

export type ServerOrganizationControllerVpInput = Readonly<{
  /** Same protected seed that committed the controller public key to ICA. */
  walletSeed: string;
  /** Stable application-owned derivation id reused after every restart. */
  walletKeyDerivationId: string;
  /** Terminal ICA/GW verification body containing the issued organization, representative and controller VCs. */
  verificationResponseBody: unknown;
  /** Exact organization tenant identifier represented by the controller proof. */
  tenantId: string;
  /** Exact audience required by the receiving GW/host policy. */
  audience: string;
  /** Optional stable sameAs selector when the response contains several controller credentials. */
  controllerSameAs?: string;
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

/**
 * Server-only authorization material used to reopen one registered controller.
 *
 * A product may let this manager open the PIN-protected seed directly, or may
 * pass the same seed after its own passkey/session policy has authorized and
 * unsealed it. `authorizedWalletSeed` must never cross a browser/API boundary.
 */
export type ServerOrganizationControllerOpenInput = Readonly<{
  ownerId: string;
  profileId: string;
  /** Fresh signed OIDC id_token used as the HTTP bearer for this operation. */
  idToken: string;
  /** User-entered or product-managed profile PIN; mutually exclusive with authorizedWalletSeed. */
  pin?: string;
  /** Already-authorized server-only 32-byte base64url seed; mutually exclusive with pin. */
  authorizedWalletSeed?: string;
}>;

/** High-level controller facade plus its immutable durable profile metadata. */
export type OpenedServerOrganizationController = Readonly<{
  profile: ServerProfileRecord;
  sdk: OrganizationControllerSdk;
}>;

/** Server-owned role evidence used to sign a fresh professional VP. */
export type ServerProfessionalProofInput = Readonly<{
  role: string;
  email?: string;
  sameAs?: string | readonly string[];
  telephone?: string;
  credentialMaterial?: string;
}>;

/** Reopens one enrolled employee/professional profile behind the BFF boundary. */
export type ServerProfessionalOpenInput = Readonly<{
  ownerId: string;
  profileId: string;
  /** Fresh signed OIDC id_token proving the authenticated account/email. */
  idToken: string;
  /** Role evidence signed by the managed DCR wallet, independently of idToken. */
  professionalProof: ServerProfessionalProofInput;
  /** Manager-owned PIN path; mutually exclusive with authorizedWalletSeed. */
  pin?: string;
  /** Server-only seed already authorized by a product passkey/session policy. */
  authorizedWalletSeed?: string;
}>;

/** Business authorization requested from SMART; OpenID/JWT fields stay SDK-owned. */
export type ServerProfessionalSmartTokenInput = Readonly<{
  subjectDid?: string;
  purpose?: string;
  scopes: string[];
  acrValues?: string;
  requestBodyClaims?: Record<string, unknown>;
  tokenCacheKey?: string;
  timeoutSeconds?: number;
  intervalSeconds?: number;
}>;

/** Role-scoped professional facades with managed SMART proof methods. */
export type OpenedServerProfessional = Readonly<{
  profile: ServerProfileRecord;
  sdk: ProfessionalSdk;
  digitalTwin: DigitalTwinSdk;
  requestSmartToken(input: ServerProfessionalSmartTokenInput): Promise<SmartTokenExchangeResult>;
  requestDigitalTwinSmartToken(input: ServerProfessionalSmartTokenInput): Promise<SmartTokenExchangeResult>;
  searchDigitalTwins(input: Omit<DigitalTwinSearchInput, 'accessToken'>): Promise<DigitalTwinSearchResult>;
}>;

export type ServerProfileSessionManagerOptions = Readonly<{
  store: ServerProfileStore;
  sealer: ServerProfileSealer;
  gatewayBaseUrl: string;
  resolveRecipientJwk: (recipientDid: string) => Promise<JWK>;
  /** Stable identity of the portal/application, shared by all of its user wallets. */
  appInfo?: AppInfo;
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
    const idToken = String(input.idToken || '').trim();
    if (!idToken) throw new Error('Profile enrollment requires a signed OIDC idToken for account/email binding.');
    const client = this.createClient(input.routeContext, idToken);
    const redirectUris = input.redirectUris || input.dcrRedirectUris || [];
    const clientName = String(input.clientName || input.dcrClientName || '').trim();
    const activationRequest = createProfileDeviceActivationRequest({
      activationCode: input.activationCode,
      idToken,
      ...input.routeContext,
    })
      .setClientInstanceId(clientInstanceId)
      .setClientName(clientName)
      .setApplicationType('web')
      .setRedirectUris(redirectUris)
      .setPublicJwks(publicKeys.filter((entry) => entry.purpose !== 'document-at-rest').map((entry) => entry.publicJwk))
      .setActorDid(input.actorDid)
      .setProfileDid(input.profileDid)
      .build();
    const activation = await client.activateProfileDeviceWithActivationRequest(activationRequest);
    const dcrBody = terminalBody(activation.dcr.poll.body);
    const clientId = findText(dcrBody, ['client_id', 'clientId']);
    if (!clientId) throw new Error('GW DCR did not return client_id.');
    const deviceDid = findText(dcrBody, ['device_did', 'deviceDid', 'did']) || clientId;
    const now = this.now();
    const managedVpToken = input.vpToken || (input.professionalProof
      ? await buildManagedProfessionalVp(wallet, context, {
        clientId,
        actorDid: input.actorDid,
        profileDid: input.profileDid,
        ...input.professionalProof,
      })
      : undefined);
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
      ...(managedVpToken ? {
        protectedVpToken: await protectServerProfileSecret(managedVpToken, input.pin, `${input.profileId}:vp-token`, this.options.sealer, this.options.profileProtection),
      } : {}),
      failedUnlocks: 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    await this.options.store.putProfile(record);
    return record;
  }

  /**
   * Rotates an employee wallet after a fresh OTP-authenticated GW recovery.
   * The old PIN and seed are never opened: DCR replaces the installation with
   * newly generated keys, all old BFF sessions are removed, and the new wallet
   * is opened once with the new PIN.
   */
  public async rotateEmployeeProfileWithOtp(
    input: ServerEmployeeProfileOtpRotationInput,
  ): Promise<ServerEmployeeProfileOtpRotationResult> {
    const previous = await this.requireOwnedProfile(input.ownerId, input.profileId);
    if (previous.actorKind !== ActorKinds.OrganizationEmployee || previous.actorMode !== 'member') {
      throw new Error('OTP wallet rotation is restricted to organization employee profiles.');
    }
    const clientInstanceId = String(previous.clientInstanceId || '').trim();
    if (!clientInstanceId) throw new Error('Employee profile has no registered installation id.');
    if (!this.options.store.deleteSessionsForProfile) {
      throw new Error('Employee wallet rotation requires profile-session invalidation support.');
    }
    const client = this.createClient(previous.routeContext, input.idToken);
    const replacement = await client.recoverEmployeeDeviceWithOtp({
      ...previous.routeContext,
      idToken: input.idToken,
      clientInstanceId,
    });
    const profile = await this.enroll({
      ownerId: previous.ownerId,
      profileId: previous.profileId,
      actorKind: previous.actorKind,
      actorMode: previous.actorMode,
      actorDid: previous.actorDid,
      profileDid: previous.profileDid,
      providerDid: previous.providerDid,
      routeContext: previous.routeContext,
      allowedSubjectDids: previous.allowedSubjectDids,
      pin: input.newPin,
      idToken: input.idToken,
      activationCode: replacement.activationCode,
      clientInstanceId,
      redirectUris: input.redirectUris,
      clientName: input.clientName,
      professionalProof: {
        role: replacement.employeeRole,
        sameAs: replacement.employeeActorIdentifier,
      },
    });
    await this.options.store.deleteSessionsForProfile(profile.profileId);
    return profile;
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
   * Builds and signs the canonical controller VP directly from ICA-issued
   * credentials. The caller never assembles a VP/JWS or exports a private key.
   *
   * This proof is independent from the signed OIDC id_token: the VP proves
   * organization/controller authority, while id_token proves control of the
   * verified login identifier used by Token/_exchange and DCR.
   */
  public async buildOrganizationControllerVpFromIcaProof(
    input: ServerOrganizationControllerVpInput,
  ): Promise<string> {
    requireBase64UrlSeed32(input.walletSeed);
    const walletKeyDerivationId = normalizedWalletKeyDerivationId(input.walletKeyDerivationId, '');
    if (!walletKeyDerivationId) {
      throw new Error('buildOrganizationControllerVpFromIcaProof requires walletKeyDerivationId.');
    }
    const tenantId = String(input.tenantId || '').trim();
    const audience = String(input.audience || '').trim();
    if (!tenantId) throw new Error('buildOrganizationControllerVpFromIcaProof requires tenantId.');
    if (!audience) throw new Error('buildOrganizationControllerVpFromIcaProof requires audience.');

    const { organizationCredential, legalRepresentativeCredential } =
      readLegalOrganizationVerificationCredentialPairFromResponseBody(input.verificationResponseBody);
    const controllerCredential = readServiceControllerCredentialFromResponseBody(
      input.verificationResponseBody,
      input.controllerSameAs,
    );
    if (!controllerCredential) {
      throw new Error('ICA verification response does not contain a ServiceControllerCredential.');
    }

    const wallet = await this.createWallet(walletKeyDerivationId, input.walletSeed);
    const context = walletContext(walletKeyDerivationId);
    const [actorSigningKey] = await wallet.getPublicJwks(context, {
      ownerScope: 'profile',
      purpose: 'actor-signing',
    });
    if (!actorSigningKey) throw new Error('Controller actor-signing key is not available.');

    const vp = createVP({
      iss: actorSigningKey.kid,
      sub: tenantId,
      aud: audience,
      vp: { holder: actorSigningKey.kid, verifiableCredential: [] },
    });
    addOrganizationCredential(vp, organizationCredential);
    addLegalRepresentativeCredential(vp, legalRepresentativeCredential);
    addServiceControllerCredential(vp, controllerCredential);
    return wallet.signCompactJws!(context, {
      header: {
        typ: 'JWT',
        jwk: actorSigningKey.publicJwk,
      },
      claims: vp as unknown as Record<string, unknown>,
      key: { ownerScope: 'profile', purpose: 'actor-signing' },
    });
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
      appInfo: this.options.appInfo,
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

  /**
   * Rewraps the exact registered wallet under a new PIN after a separate
   * server-authorized recovery factor has released its secrets. No GW call or
   * DCR occurs because proof-of-possession and every public key remain intact.
   */
  public async replaceProfilePinFromAuthorizedSecrets(
    input: ServerProfilePinReplacementInput,
  ): Promise<ServerProfileRecord> {
    const profile = await this.requireOwnedProfile(input.ownerId, input.profileId);
    const seed = String(input.authorizedWalletSeed || '').trim();
    requireBase64UrlSeed32(seed);
    if (!this.options.store.deleteSessionsForProfile) {
      throw new Error('Profile PIN replacement requires profile-session invalidation support.');
    }
    if (profile.protectedVpToken && !String(input.authorizedVpToken || '').trim()) {
      throw new Error('Profile PIN replacement requires the authorized VP token.');
    }
    const walletKeyDerivationId = normalizedWalletKeyDerivationId(
      profile.walletKeyDerivationId,
      profile.profileId,
    );
    const wallet = await this.createWallet(walletKeyDerivationId, seed);
    await requireRegisteredProfileKeys(wallet, walletContext(walletKeyDerivationId), profile);
    const updated: ServerProfileRecord = {
      ...profile,
      protectedWalletSeed: await protectServerProfileSecret(
        seed,
        input.newPin,
        `${profile.profileId}:wallet-seed`,
        this.options.sealer,
        this.options.profileProtection,
      ),
      ...(profile.protectedVpToken ? {
        protectedVpToken: await protectServerProfileSecret(
          String(input.authorizedVpToken),
          input.newPin,
          `${profile.profileId}:vp-token`,
          this.options.sealer,
          this.options.profileProtection,
        ),
      } : {}),
      failedUnlocks: 0,
      lockedUntil: undefined,
      updatedAt: this.now().toISOString(),
    };
    await this.options.store.putProfile(updated);
    await this.options.store.deleteSessionsForProfile(profile.profileId);
    return updated;
  }

  public async unlock(input: ServerProfileUnlockInput): Promise<ResolvedServerProfileSession> {
    let profile = await this.requireOwnedProfile(input.ownerId, input.profileId);
    this.requireSubject(profile, input.subjectDid);
    const now = this.now();
    if (profile.lockedUntil && new Date(profile.lockedUntil) > now) {
      throw new Error('Profile is temporarily locked after failed PIN attempts.');
    }
    let seed: string;
    let vpToken: string | undefined;
    try {
      seed = await openServerProfileSecret(profile.protectedWalletSeed, input.pin, `${profile.profileId}:wallet-seed`, this.options.sealer);
      vpToken = profile.protectedVpToken
        ? await openServerProfileSecret(profile.protectedVpToken, input.pin, `${profile.profileId}:vp-token`, this.options.sealer)
        : undefined;
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
      vpTokenFallback: vpToken ? undefined : 'omit',
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
      ...(vpToken ? {
        sealedUnlockedVpToken: await this.options.sealer.seal(vpToken, `${sessionId}:unlocked-vp-token`),
      } : {}),
      sealedAccessToken: await this.options.sealer.seal(token.accessToken, `${sessionId}:access-token`),
      expiresAt: expiresAt.toISOString(),
    });
    return this.resolveSession(input.ownerId, sessionId);
  }

  /**
   * Renews the short SMART bearer while retaining the already-open server
   * wallet session. The caller must supply a fresh authenticated account
   * token; neither the PIN nor wallet keys return to the browser.
   */
  public async refreshSession(ownerId: string, sessionId: string, idToken: string): Promise<ResolvedServerProfileSession> {
    const session = await this.options.store.getSession(sessionId);
    if (!session || session.ownerId !== ownerId) throw new Error('Profile session not found.');
    if (new Date(session.expiresAt) <= this.now()) {
      await this.options.store.deleteSession(sessionId);
      throw new Error('Profile session expired.');
    }
    const normalizedIdToken = String(idToken || '').trim();
    if (!normalizedIdToken) throw new Error('Profile session refresh requires idToken.');
    const profile = await this.requireOwnedProfile(ownerId, session.profileId);
    this.requireSubject(profile, session.subjectDid);
    const seed = await this.options.sealer.unseal(
      session.sealedUnlockedWalletSeed,
      `${sessionId}:unlocked-wallet-seed`,
    );
    const vpToken = session.sealedUnlockedVpToken
      ? await this.options.sealer.unseal(session.sealedUnlockedVpToken, `${sessionId}:unlocked-vp-token`)
      : undefined;
    const walletKeyDerivationId = profile.walletKeyDerivationId || profile.profileId;
    const wallet = await this.createWallet(walletKeyDerivationId, seed);
    const now = this.now();
    const smartTokenEndpoint = [
      this.options.gatewayBaseUrl.replace(/\/+$/, ''),
      buildIdentityOpenIdSmartTokenPath(profile.routeContext),
    ].join('');
    const assertion = await buildWalletClientAssertion(wallet, profile, smartTokenEndpoint, now);
    const token = await this.createClient(profile.routeContext, normalizedIdToken).requestSmartToken({
      ...profile.routeContext,
      actorDid: profile.actorDid,
      subjectDid: session.subjectDid,
      clientId: profile.clientId,
      issuer: profile.clientId,
      audience: smartTokenEndpoint,
      idToken: normalizedIdToken,
      vpToken,
      vpTokenFallback: vpToken ? undefined : 'omit',
      clientAssertion: assertion,
      clientAssertionType: 'private_key_jwt',
      smartTokenKind: 'openid-smart',
      acrValues: profileSmartAcrValues(profile.actorKind),
      scopes: unique(session.scopes),
      tokenCacheKey: `profile-refresh:${sessionId}:${now.getTime()}`,
    });
    if (token.status !== 'fetched' || !token.accessToken) throw new Error('SMART token refresh failed.');
    await this.options.store.putSession({
      ...session,
      sealedAccessToken: await this.options.sealer.seal(token.accessToken, `${sessionId}:access-token`),
    });
    return this.resolveSession(ownerId, sessionId);
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
          bindTransportActor(message, profile.actorDid, profile.clientId),
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

  /**
   * Opens the high-level organization-controller API without exposing wallet,
   * DIDComm, DCR or HTTP-client plumbing to the integrating BFF.
   *
   * The durable profile remains authoritative for actor DID, provider DID,
   * route and DCR client id. The reconstructed keys must match the public keys
   * registered for that profile before any gateway request can be sent.
   */
  public async openOrganizationController(
    input: ServerOrganizationControllerOpenInput,
  ): Promise<OpenedServerOrganizationController> {
    const profile = await this.requireOwnedProfile(input.ownerId, input.profileId);
    if (profile.actorKind !== ActorKinds.OrganizationController || profile.actorMode !== 'controller') {
      throw new Error('Profile is not an organization controller.');
    }
    const idToken = String(input.idToken || '').trim();
    if (!idToken) throw new Error('Opening an organization controller requires a signed OIDC idToken.');
    const hasPin = Boolean(String(input.pin || '').trim());
    const hasAuthorizedSeed = Boolean(String(input.authorizedWalletSeed || '').trim());
    if (hasPin === hasAuthorizedSeed) {
      throw new Error('Opening an organization controller requires exactly one of pin or authorizedWalletSeed.');
    }
    const seed = hasAuthorizedSeed
      ? String(input.authorizedWalletSeed)
      : await openServerProfileSecret(
        profile.protectedWalletSeed,
        String(input.pin),
        `${profile.profileId}:wallet-seed`,
        this.options.sealer,
      );
    requireBase64UrlSeed32(seed);
    const walletKeyDerivationId = normalizedWalletKeyDerivationId(
      profile.walletKeyDerivationId,
      profile.profileId,
    );
    const wallet = await this.createWallet(walletKeyDerivationId, seed);
    const context = walletContext(walletKeyDerivationId);
    await requireRegisteredProfileKeys(wallet, context, profile);
    const secureTransportAdapter: SecureDidcommTransportAdapter = {
      pack: (message) => wallet.packForRecipientWithContext!(
        bindOrganizationControllerTransport(message, profile),
        profile.providerDid,
        { context },
      ),
      unpack: async (jwe) => (await wallet.unpackWithContext!(jwe, { context })).content,
    };
    const client = new NodeHttpClient({
      baseUrl: this.options.gatewayBaseUrl,
      ctx: profile.routeContext,
      bearerToken: idToken,
      fetchImpl: this.options.fetchImpl,
      appInfo: this.options.appInfo,
      transportProfile: TransportProfiles.DidcommEncryptedForm,
      secureTransportAdapter,
    });
    return { profile, sdk: new OrganizationControllerSdk(client) };
  }

  /**
   * Opens one registered organization employee/professional without exposing
   * wallet reconstruction, private_key_jwt, VP or transport plumbing.
   *
   * The product authorizes the PIN/passkey/session and supplies business role
   * evidence. The SDK revalidates the registered key set, signs a fresh role
   * VP independently from the OIDC account proof, derives the SMART endpoint
   * from the durable profile route and owns the client assertion.
   */
  public async openProfessional(input: ServerProfessionalOpenInput): Promise<OpenedServerProfessional> {
    const profile = await this.requireOwnedProfile(input.ownerId, input.profileId);
    const isProfessional = profile.actorKind === ActorKinds.OrganizationEmployee
      || profile.actorKind === ActorKinds.Professional;
    if (!isProfessional || profile.actorMode !== 'member') {
      throw new Error('Profile is not an organization employee or professional.');
    }
    const idToken = String(input.idToken || '').trim();
    const role = String(input.professionalProof?.role || '').trim();
    if (!idToken) throw new Error('Opening a professional requires a signed OIDC idToken.');
    if (!role) throw new Error('Opening a professional requires role proof.');
    const hasPin = Boolean(String(input.pin || '').trim());
    const hasAuthorizedSeed = Boolean(String(input.authorizedWalletSeed || '').trim());
    if (hasPin === hasAuthorizedSeed) {
      throw new Error('Opening a professional requires exactly one of pin or authorizedWalletSeed.');
    }
    const seed = hasAuthorizedSeed
      ? String(input.authorizedWalletSeed)
      : await openServerProfileSecret(
        profile.protectedWalletSeed,
        String(input.pin),
        `${profile.profileId}:wallet-seed`,
        this.options.sealer,
      );
    requireBase64UrlSeed32(seed);
    const walletKeyDerivationId = normalizedWalletKeyDerivationId(
      profile.walletKeyDerivationId,
      profile.profileId,
    );
    const wallet = await this.createWallet(walletKeyDerivationId, seed);
    const context = walletContext(walletKeyDerivationId);
    await requireRegisteredProfileKeys(wallet, context, profile);
    const secureTransportAdapter: SecureDidcommTransportAdapter = {
      pack: (message) => wallet.packForRecipientWithContext!(
        bindOrganizationControllerTransport(message, profile),
        profile.providerDid,
        { context },
      ),
      unpack: async (jwe) => (await wallet.unpackWithContext!(jwe, { context })).content,
    };
    const operationalClient = new NodeHttpClient({
      baseUrl: this.options.gatewayBaseUrl,
      ctx: profile.routeContext,
      bearerToken: idToken,
      fetchImpl: this.options.fetchImpl,
      appInfo: this.options.appInfo,
      transportProfile: TransportProfiles.DidcommEncryptedForm,
      secureTransportAdapter,
    });
    // SMART/OpenID uses its own JSON/form protocol and must not be wrapped in
    // the encrypted resource transport selected for later business actions.
    const sdk = new ProfessionalSdk(this.createClient(profile.routeContext, idToken));
    const digitalTwin = new DigitalTwinSdk(operationalClient, profile.actorDid);
    let digitalTwinAccessToken: string | undefined;
    const request = async (smart: ServerProfessionalSmartTokenInput): Promise<SmartTokenExchangeResult> => {
      if (!smart.scopes?.length) throw new Error('Professional SMART request requires scopes.');
      const now = this.now();
      const audience = [
        this.options.gatewayBaseUrl.replace(/\/+$/, ''),
        buildIdentityOpenIdSmartTokenPath(profile.routeContext),
      ].join('');
      const clientAssertion = await buildWalletClientAssertion(wallet, profile, audience, now);
      const vpToken = await buildManagedProfessionalVp(wallet, context, {
        clientId: profile.clientId,
        actorDid: profile.actorDid,
        profileDid: profile.profileDid,
        ...input.professionalProof,
        role,
      });
      return sdk.requestSmartToken({
        ...profile.routeContext,
        actorDid: profile.actorDid,
        subjectDid: String(smart.subjectDid || '').trim() || undefined,
        clientId: profile.clientId,
        issuer: profile.clientId,
        audience,
        idToken,
        vpToken,
        vpTokenFallback: 'omit',
        clientAssertion,
        clientAssertionType: 'private_key_jwt',
        smartTokenKind: 'openid-smart',
        acrValues: smart.acrValues || profileSmartAcrValues(profile.actorKind),
        purpose: smart.purpose,
        scopes: unique(smart.scopes),
        requestBodyClaims: smart.requestBodyClaims,
        tokenCacheKey: smart.tokenCacheKey,
        timeoutSeconds: smart.timeoutSeconds,
        intervalSeconds: smart.intervalSeconds,
      });
    };
    return {
      profile,
      sdk,
      digitalTwin,
      requestSmartToken: request,
      requestDigitalTwinSmartToken: async (smart) => {
        const result = await request(smart);
        if (result.accessToken) digitalTwinAccessToken = result.accessToken;
        return result;
      },
      searchDigitalTwins: (search) => {
        if (!digitalTwinAccessToken) throw new Error('Digital twin SMART token has not been granted.');
        return digitalTwin.search(profile.routeContext, { ...search, accessToken: digitalTwinAccessToken });
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
      appInfo: this.options.appInfo,
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
 * Binds every direct resource action and async poll to the actor and DCR client
 * stored in the server profile. The caller may author the business body and
 * thread id, but cannot replace either verification identity.
 */
function bindTransportActor(
  message: Record<string, unknown>,
  actorDid: string,
  clientId: string,
): Record<string, unknown> {
  return { ...message, iss: actorDid, client_id: clientId };
}

/** Binds the encrypted request to the immutable controller registration. */
function bindOrganizationControllerTransport(
  message: Record<string, unknown>,
  profile: ServerProfileRecord,
): Record<string, unknown> {
  return {
    ...message,
    iss: profile.actorDid,
    aud: profile.providerDid,
    client_id: profile.clientId,
  };
}

/** Refuses a wrong or rotated seed before it can produce network traffic. */
async function requireRegisteredProfileKeys(
  wallet: NodeManagedWallet,
  context: WalletExecutionContext,
  profile: ServerProfileRecord,
): Promise<void> {
  const derived = await wallet.getPublicJwks(context, {});
  const derivedKids = new Set(derived.map((entry) => String(entry.kid || '').trim()).filter(Boolean));
  const registeredKids = profile.publicJwks
    .map((jwk) => String(jwk.kid || '').trim())
    .filter(Boolean);
  if (!registeredKids.length || registeredKids.some((kid) => !derivedKids.has(kid))) {
    throw new Error('Authorized wallet seed does not match registered profile keys.');
  }
  if (profile.clientInstanceId && !derivedKids.has(profile.clientInstanceId)) {
    throw new Error('Authorized wallet seed does not match the registered client instance.');
  }
}

/** Keeps the OpenID proof class aligned with the durable actor profile. */
function profileSmartAcrValues(actorKind: ActorKind): string {
  return actorKind === ActorKinds.IndividualController
    || actorKind === ActorKinds.IndividualMember
    ? 'urn:antifraud:acr:openid4vp:individual'
    : 'urn:antifraud:acr:openid4vp:employee';
}

/** Creates the role VP after DCR has returned the wallet's actual client_id. */
async function buildManagedProfessionalVp(
  wallet: NodeManagedWallet,
  context: WalletExecutionContext,
  input: Readonly<{
    clientId: string;
    actorDid: string;
    profileDid: string;
    role: string;
    email?: string;
    sameAs?: string | readonly string[];
    telephone?: string;
    credentialMaterial?: string;
  }>,
): Promise<string> {
  return wallet.signProfessionalIdentityVp(context, input);
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
    idToken: input.idToken,
  })) if (!String(value || '').trim()) throw new Error(`Profile enrollment requires ${name}.`);
  if (input.actorKind !== ActorKinds.IndividualController
    && !String(input.vpToken || '').trim()
    && !input.professionalProof) {
    throw new Error('Profile enrollment requires vpToken for this actor kind.');
  }
  if (input.professionalProof && !String(input.professionalProof.role || '').trim()) {
    throw new Error('Profile enrollment professionalProof requires role.');
  }
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

// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import { createHash, createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from 'crypto';
import { CryptographyService } from 'gdc-common-utils-ts/CryptographyService';
import type { ICryptoHelper } from 'gdc-common-utils-ts/interfaces/ICryptoHelper';
import type {
  IWallet,
  WalletAlgorithm,
  WalletCompactJweRequest,
  WalletCompactJwsRequest,
  WalletDetachedJwsRequest,
  WalletExecutionContext,
  WalletKeyDescriptor,
  WalletKeyOwnerScope,
  WalletKeyPurpose,
  WalletKeySelection,
  WalletPackOptions,
  WalletProvisionRequest,
  WalletUnpackOptions,
} from 'gdc-sdk-core-ts';
import type { ClassicPublicJwk, MlkemPrivateJwk, MldsaAlg, PublicJwk } from 'gdc-common-utils-ts/interfaces/Cryptography.types';
import type { JWK, JwkSet } from 'gdc-common-utils-ts/models/jwk';
import { Content } from 'gdc-common-utils-ts/utils/content';
import { createJwtSigner, type JWKLikePrivateMaterial } from 'gdc-common-utils-ts/utils/jwt-signer';
import { buildJwtCompact, prepareJwtForSignature } from 'gdc-common-utils-ts/utils/jwt';
import { NodeCryptoHelper } from './node-crypto-helper.js';

type StoredManagedKey = {
  descriptor: WalletKeyDescriptor;
  privateMaterial: JWKLikePrivateMaterial | Uint8Array;
};

type StoredOwnerState = {
  keys: StoredManagedKey[];
  storageKey?: Uint8Array;
};

export type NodeManagedWalletPolicy = {
  defaults: Partial<Record<WalletKeyPurpose, WalletAlgorithm>>;
};

export type NodeManagedWalletOptions = {
  cryptoHelper?: ICryptoHelper;
  cryptography?: CryptographyService;
  resolveRecipientJwk?: (recipientDid: string) => Promise<JWK>;
  policy?: Partial<NodeManagedWalletPolicy>;
};

const DEFAULT_POLICY: NodeManagedWalletPolicy = {
  defaults: {
    'actor-signing': 'ES384',
    'openid-id-token-signing': 'ES384',
    'vp-token-signing': 'ES384',
    'vc-signing': 'ES384',
    'comm-signing': 'ML-DSA-44',
    'comm-encryption': 'ML-KEM-768',
  },
};

/**
 * Node-focused managed wallet implementation for BFF, portal, and backend flows.
 *
 * This adapter keeps actor/profile keys separate from runtime/channel keys and
 * exposes one shared `IWallet` contract suitable for:
 * - user/domain signing
 * - OpenID/JWT signing
 * - DIDComm-style transport wrapping
 * - confidential document protection
 */
export class NodeManagedWallet implements IWallet {
  private readonly cryptoHelper: ICryptoHelper;
  private readonly cryptography: CryptographyService;
  private readonly resolveRecipientJwk?: (recipientDid: string) => Promise<JWK>;
  private readonly policy: NodeManagedWalletPolicy;
  private readonly owners = new Map<string, StoredOwnerState>();

  /**
   * Creates one managed wallet backed by `CryptographyService` and Node crypto.
   */
  public constructor(options: NodeManagedWalletOptions = {}) {
    this.cryptoHelper = options.cryptoHelper ?? new NodeCryptoHelper();
    this.cryptography = options.cryptography ?? new CryptographyService(this.cryptoHelper);
    this.resolveRecipientJwk = options.resolveRecipientJwk;
    this.policy = {
      defaults: {
        ...DEFAULT_POLICY.defaults,
        ...(options.policy?.defaults ?? {}),
      },
    };
  }

  /**
   * Legacy provisioning shape kept for app compatibility.
   *
   * It provisions one profile-owned signing key, one runtime communication
   * signing key, and one runtime communication encryption key while returning
   * the signing/encryption public keys expected by older app-facing flows.
   */
  public async provisionKeys(entityId: string): Promise<JwkSet> {
    const profileContext: WalletExecutionContext = {
      profile: {
        profileId: entityId,
      },
      runtime: {
        runtimeId: `${entityId}:runtime`,
        runtimeType: 'web-app',
      },
    };
    await this.provisionManagedKeys!(profileContext, {
      ownerScope: 'profile',
      purposes: ['actor-signing'],
      seedMaterial: entityId,
      mode: 'deterministic',
    });
    const runtimeKeySet = await this.provisionManagedKeys!(profileContext, {
      ownerScope: 'runtime',
      purposes: ['comm-signing', 'comm-encryption'],
      seedMaterial: `${entityId}:runtime`,
      mode: 'deterministic',
    });
    const signingKey = await this.getPublicJwks(profileContext, {
      ownerScope: 'profile',
      purpose: 'actor-signing',
    });
    const encryptionKey = runtimeKeySet.keys.find((key) => key.use === 'enc');
    return {
      keys: [
        signingKey[0]?.publicJwk ?? runtimeKeySet.keys[0]!,
        encryptionKey ?? runtimeKeySet.keys[0]!,
      ],
    };
  }

  /**
   * Rich provisioning shape for actor/profile keys and runtime/channel keys.
   */
  public async provisionManagedKeys(context: WalletExecutionContext, request: WalletProvisionRequest): Promise<JwkSet> {
    const ownerState = this.getOrCreateOwnerState(context, request.ownerScope);
    const ownerId = this.resolveOwnerId(context, request.ownerScope);
    const created: JWK[] = [];

    for (const purpose of request.purposes) {
      const existing = ownerState.keys.find((entry) => entry.descriptor.purpose === purpose);
      if (existing) {
        created.push(existing.descriptor.publicJwk);
        continue;
      }

      const descriptor = await this.createManagedKey(context, request.ownerScope, purpose, request, ownerId);
      ownerState.keys.push(descriptor);
      created.push(descriptor.descriptor.publicJwk);
    }

    if (!ownerState.storageKey) {
      ownerState.storageKey = await this.createStorageKey(request, ownerId);
    }

    return { keys: created };
  }

  /**
   * Returns the currently available public JWKs for the selected context and filter.
   */
  public async getPublicJwks(context?: WalletExecutionContext, filter?: WalletKeySelection): Promise<WalletKeyDescriptor[]> {
    if (!context && !filter?.keyId) return [];
    if (filter?.keyId) {
      for (const ownerState of this.owners.values()) {
        const match = ownerState.keys.find((entry) => entry.descriptor.kid === filter.keyId);
        if (match && this.matchesSelection(match.descriptor, filter)) {
          return [match.descriptor];
        }
      }
      return [];
    }

    const descriptors: WalletKeyDescriptor[] = [];
    for (const scope of this.inferRelevantScopes(context, filter)) {
      const ownerState = this.tryGetOwnerState(context!, scope);
      for (const entry of ownerState?.keys ?? []) {
        if (this.matchesSelection(entry.descriptor, filter)) {
          descriptors.push(entry.descriptor);
        }
      }
    }
    return descriptors;
  }

  /**
   * Computes a digest of a string using the configured runtime helper.
   */
  public async digest(data: string, algorithm: string): Promise<string> {
    return this.cryptoHelper.digestString(data, algorithm);
  }

  /**
   * Protects one confidential document using one owner-specific symmetric storage key.
   */
  public async protectConfidentialData(doc: any, entityId: string): Promise<any> {
    return this.protectManagedConfidentialData!(doc, {
      profile: { profileId: entityId },
      runtime: { runtimeId: `${entityId}:runtime`, runtimeType: 'web-app' },
    });
  }

  /**
   * Protects one confidential document using the richer execution-context model.
   */
  public async protectManagedConfidentialData(doc: any, context: WalletExecutionContext, _options?: { key?: WalletKeySelection }): Promise<any> {
    if (!doc?.content) return doc;
    const storageKey = this.requireStorageKey(context);
    const ownerId = this.resolveStorageOwnerId(context);
    const contentString = JSON.stringify(doc.content);
    const encrypted = await this.cryptography.encrypt(contentString, storageKey, ownerId);
    const { content, ...docWithoutContent } = doc;
    return {
      ...docWithoutContent,
      jwe: encrypted,
    };
  }

  /**
   * Decrypts one confidential document using the legacy entity id shape.
   */
  public async unprotectConfidentialData(doc: any, entityId: string): Promise<any> {
    return this.unprotectManagedConfidentialData!(doc, {
      profile: { profileId: entityId },
      runtime: { runtimeId: `${entityId}:runtime`, runtimeType: 'web-app' },
    });
  }

  /**
   * Decrypts one confidential document using the richer execution-context model.
   */
  public async unprotectManagedConfidentialData(doc: any, context: WalletExecutionContext, _options?: { key?: WalletKeySelection }): Promise<any> {
    if (!doc?.jwe) return doc;
    const storageKey = this.requireStorageKey(context);
    const ownerId = this.resolveStorageOwnerId(context);
    const decrypted = await this.cryptography.decrypt(doc.jwe, storageKey, ownerId);
    const { jwe, ...docWithoutJwe } = doc;
    return {
      ...docWithoutJwe,
      content: JSON.parse(decrypted),
    };
  }

  /**
   * Signs arbitrary bytes or one UTF-8 string using the selected managed key.
   */
  public async sign(payload: Uint8Array | string, context: WalletExecutionContext, options: WalletKeySelection): Promise<string> {
    const entry = this.requireManagedKey(context, options, 'sig');
    const payloadBytes = typeof payload === 'string' ? Content.stringToBytesUTF8(payload) : payload;
    const alg = entry.descriptor.alg;
    if (alg.startsWith('ML-DSA')) {
      const signature = await this.cryptography.signBytes(payloadBytes, entry.privateMaterial as Uint8Array, alg as MldsaAlg);
      return Content.bytesToRawBase64UrlSafe(signature);
    }

    const privateJwk = entry.privateMaterial as ClassicPublicJwk & { d: string };
    const keyObject = createPrivateKey({ key: privateJwk as any, format: 'jwk' });
    const signature = cryptoSign(this.resolveNodeDigestForAlgorithm(alg), Buffer.from(payloadBytes), keyObject);
    return Buffer.from(signature).toString('base64url');
  }

  /**
   * Verifies one signature against the provided public JWK.
   */
  public async verify(payload: Uint8Array | string, signature: string, jwk: JWK, options?: { alg?: WalletAlgorithm }): Promise<boolean> {
    const payloadBytes = typeof payload === 'string' ? Content.stringToBytesUTF8(payload) : payload;
    const algorithm = (options?.alg ?? jwk.alg) as WalletAlgorithm | undefined;
    if (!algorithm) {
      throw new Error('NodeManagedWallet.verify requires an algorithm on the key or in options.alg.');
    }

    if (algorithm.startsWith('ML-DSA')) {
      return this.cryptography.verifyBytes(Content.base64ToBytes(signature), payloadBytes, jwk as PublicJwk);
    }

    const publicKey = createPublicKey({ key: jwk as any, format: 'jwk' });
    return cryptoVerify(this.resolveNodeDigestForAlgorithm(algorithm), Buffer.from(payloadBytes), publicKey, Buffer.from(signature, 'base64url'));
  }

  /**
   * Encrypts one payload for the provided recipient public JWK.
   */
  public async encrypt(
    plaintext: Uint8Array | string,
    recipientJwk: JWK,
    options?: { context?: WalletExecutionContext; key?: WalletKeySelection; contentType?: string },
  ): Promise<string> {
    if (!options?.context || !options?.key) {
      throw new Error('NodeManagedWallet.encrypt requires options.context and options.key.');
    }
    return this.buildCompactJwe!(options.context, {
      plaintext,
      recipientJwk,
      contentType: options.contentType,
      key: options.key,
    });
  }

  /**
   * Decrypts one ciphertext using one selected local encryption key.
   */
  public async decrypt(ciphertext: string, context: WalletExecutionContext, options?: { key?: WalletKeySelection }): Promise<Uint8Array> {
    return this.decryptCompactJwe!(ciphertext, context, {
      key: options?.key ?? {
        ownerScope: 'runtime',
        purpose: 'comm-encryption',
      },
    });
  }

  /**
   * Builds one compact JWS using one managed signing key.
   */
  public async signCompactJws(context: WalletExecutionContext, request: WalletCompactJwsRequest): Promise<string> {
    const entry = this.requireManagedKey(context, request.key, 'sig');
    const header = {
      ...request.header,
      alg: entry.descriptor.alg,
      kid: entry.descriptor.kid,
    };
    const prepared = prepareJwtForSignature(header, request.claims);
    const signature = await this.sign(prepared.signingInput, context, request.key);
    return buildJwtCompact(prepared.encodedHeader, prepared.encodedPayload, signature);
  }

  /**
   * Builds one detached compact JWS using one managed signing key.
   */
  public async signDetachedJws(context: WalletExecutionContext, request: WalletDetachedJwsRequest): Promise<string> {
    const entry = this.requireManagedKey(context, request.key, 'sig');
    const header = {
      ...request.header,
      alg: entry.descriptor.alg,
      kid: entry.descriptor.kid,
      b64: false,
      crit: ['b64'],
    };
    const payloadBytes = typeof request.payload === 'string' ? Content.stringToBytesUTF8(request.payload) : request.payload;
    const encodedHeader = Content.objectToRawBase64UrlSafe(header);
    const signingBytes = Buffer.concat([Buffer.from(`${encodedHeader}.`, 'ascii'), Buffer.from(payloadBytes)]);
    const signature = await this.sign(signingBytes, context, request.key);
    return `${encodedHeader}..${signature}`;
  }

  /**
   * Builds one compact JWE using one selected local ML-KEM key and one recipient public JWK.
   */
  public async buildCompactJwe(context: WalletExecutionContext, request: WalletCompactJweRequest): Promise<string> {
    const entry = this.requireManagedKey(context, request.key, 'enc');
    const secretKeyJwk: MlkemPrivateJwk = {
      ...(entry.descriptor.publicJwk as any),
      dBytes: entry.privateMaterial as Uint8Array,
    };
    const protectedHeader = {
      enc: 'A256GCM',
      ...(request.contentType ? { cty: request.contentType } : {}),
    };
    const plaintext = typeof request.plaintext === 'string'
      ? request.plaintext
      : Content.bytesToStringUTF8(request.plaintext);
    return this.cryptography.encryptJweToCompact(plaintext, protectedHeader, secretKeyJwk, request.recipientJwk as any);
  }

  /**
   * Decrypts one compact JWE using one selected local ML-KEM key.
   */
  public async decryptCompactJwe(jwe: string, context: WalletExecutionContext, options: { key: WalletKeySelection }): Promise<Uint8Array> {
    const entry = this.requireManagedKey(context, options.key, 'enc');
    const secretKeyJwk: MlkemPrivateJwk = {
      ...(entry.descriptor.publicJwk as any),
      dBytes: entry.privateMaterial as Uint8Array,
    };
    const result = await this.cryptography.decryptJwe(jwe, secretKeyJwk);
    return result.decryptedBytes;
  }

  /**
   * Legacy pack shape retained for app compatibility.
   */
  public async packForRecipient(content: any, recipientDid: string): Promise<string> {
    return this.packForRecipientWithContext!(content, recipientDid, {
      context: {
        runtime: {
          runtimeId: 'default-runtime',
          runtimeType: 'web-app',
        },
      },
    });
  }

  /**
   * Packs one payload into a transport envelope signed and encrypted by the runtime.
   */
  public async packForRecipientWithContext(content: any, recipientDidOrJwk: string | JWK, options: WalletPackOptions): Promise<string> {
    const recipientJwk = typeof recipientDidOrJwk === 'string'
      ? await this.resolveRecipientPublicJwk(recipientDidOrJwk)
      : recipientDidOrJwk;
    const signingKey = options.signingKey ?? {
      ownerScope: 'runtime',
      purpose: 'comm-signing',
    };
    const encryptionKey = options.encryptionKey ?? {
      ownerScope: 'runtime',
      purpose: 'comm-encryption',
    };
    const compactJws = await this.signCompactJws!(options.context, {
      header: {
        typ: 'JWS',
      },
      claims: {
        payload: content,
      },
      key: signingKey,
    });
    return this.buildCompactJwe!(options.context, {
      plaintext: compactJws,
      recipientJwk,
      contentType: 'JWS',
      key: encryptionKey,
    });
  }

  /**
   * Legacy unpack shape retained for app compatibility.
   */
  public async unpack(packedMessage: string): Promise<{ content: any; meta: any }> {
    return this.unpackWithContext!(packedMessage, {
      context: {
        runtime: {
          runtimeId: 'default-runtime',
          runtimeType: 'web-app',
        },
      },
    });
  }

  /**
   * Unpacks one transport envelope and returns the decoded business payload plus JOSE metadata.
   */
  public async unpackWithContext(packedMessage: string, options: WalletUnpackOptions): Promise<{ content: any; meta: any }> {
    const decryptedBytes = await this.decryptCompactJwe!(packedMessage, options.context, {
      key: options.decryptionKey ?? {
        ownerScope: 'runtime',
        purpose: 'comm-encryption',
      },
    });
    const decryptedText = Content.bytesToStringUTF8(decryptedBytes);
    const protectedHeader = this.cryptography.parseCompactJwe(packedMessage).protected;
    if (protectedHeader) {
      const decodedProtectedHeader = Content.base64UrlSafeToJSON(protectedHeader);
      if ((decodedProtectedHeader as Record<string, unknown>).cty === 'JWS') {
        const compact = decryptedText;
        const parts = compact.split('.');
        if (parts.length !== 3) {
          throw new Error('NodeManagedWallet.unpackWithContext expected a compact JWS payload.');
        }
        const payload = Content.base64UrlSafeToJSON(parts[1]);
        return {
          content: (payload as Record<string, any>).payload,
          meta: {
            jwe: { protected: decodedProtectedHeader },
            jws: {
              compact,
            },
          },
        };
      }
      return {
        content: JSON.parse(decryptedText),
        meta: {
          jwe: { protected: decodedProtectedHeader },
        },
      };
    }
    return {
      content: JSON.parse(decryptedText),
      meta: {},
    };
  }

  private getOrCreateOwnerState(context: WalletExecutionContext, ownerScope: WalletKeyOwnerScope): StoredOwnerState {
    const ownerId = this.resolveOwnerId(context, ownerScope);
    const existing = this.owners.get(ownerId);
    if (existing) return existing;
    const created: StoredOwnerState = {
      keys: [],
    };
    this.owners.set(ownerId, created);
    return created;
  }

  private tryGetOwnerState(context: WalletExecutionContext, ownerScope: WalletKeyOwnerScope): StoredOwnerState | undefined {
    const ownerId = this.resolveOwnerId(context, ownerScope);
    return this.owners.get(ownerId);
  }

  private resolveOwnerId(context: WalletExecutionContext, ownerScope: WalletKeyOwnerScope): string {
    if (ownerScope === 'profile') {
      const profileId = context.profile?.profileId;
      if (!profileId) {
        throw new Error('NodeManagedWallet requires context.profile.profileId when ownerScope="profile".');
      }
      return `profile:${profileId}:${context.walletId ?? 'default'}`;
    }
    const runtimeId = context.runtime?.runtimeId;
    if (!runtimeId) {
      throw new Error('NodeManagedWallet requires context.runtime.runtimeId when ownerScope="runtime".');
    }
    return `runtime:${runtimeId}:${context.walletId ?? 'default'}`;
  }

  private resolveStorageOwnerId(context: WalletExecutionContext): string {
    if (context.profile?.profileId) return `storage:profile:${context.profile.profileId}`;
    if (context.runtime?.runtimeId) return `storage:runtime:${context.runtime.runtimeId}`;
    throw new Error('NodeManagedWallet requires either context.profile or context.runtime for storage operations.');
  }

  private async createManagedKey(
    context: WalletExecutionContext,
    ownerScope: WalletKeyOwnerScope,
    purpose: WalletKeyPurpose,
    request: WalletProvisionRequest,
    ownerId: string,
  ): Promise<StoredManagedKey> {
    const algorithm = this.resolveAlgorithmForPurpose(purpose);
    if (algorithm === 'ML-KEM-768' || algorithm === 'ML-KEM-1024') {
      const seedBytes = request.mode === 'deterministic' && request.seedMaterial !== undefined
        ? this.deriveSeedBytes(request.seedMaterial, ownerId, purpose, 64)
        : undefined;
      const generated = await this.cryptography.generateKeyPairMlKem(seedBytes, algorithm);
      return {
        descriptor: {
          kid: generated.publicJWKey.kid!,
          ownerScope,
          purpose,
          use: 'enc',
          alg: algorithm,
          publicJwk: generated.publicJWKey as unknown as JWK,
          defaultForPurpose: true,
        },
        privateMaterial: generated.secretKeyBytes,
      };
    }

    const signer = await createJwtSigner({
      alg: algorithm as any,
      purpose: `${ownerId}:${purpose}`,
      seed: request.mode === 'deterministic' && request.seedMaterial !== undefined
        ? this.deriveSignerSeed(request.seedMaterial, ownerId, purpose)
        : undefined,
      cryptography: this.cryptography,
    });
    return {
      descriptor: {
        kid: signer.getKid(),
        ownerScope,
        purpose,
        use: 'sig',
        alg: algorithm,
        publicJwk: signer.getPublicJwk() as JWK,
        defaultForPurpose: true,
      },
      privateMaterial: signer.getPrivateMaterial(),
    };
  }

  private async createStorageKey(request: WalletProvisionRequest, ownerId: string): Promise<Uint8Array> {
    if (request.mode === 'deterministic' && request.seedMaterial !== undefined) {
      return this.deriveSeedBytes(request.seedMaterial, ownerId, 'document-at-rest', 32);
    }
    return this.cryptoHelper.getRandomBytes(32);
  }

  private requireStorageKey(context: WalletExecutionContext): Uint8Array {
    if (context.profile?.profileId) {
      const state = this.owners.get(`profile:${context.profile.profileId}:${context.walletId ?? 'default'}`);
      if (state?.storageKey) return state.storageKey;
    }
    if (context.runtime?.runtimeId) {
      const state = this.owners.get(`runtime:${context.runtime.runtimeId}:${context.walletId ?? 'default'}`);
      if (state?.storageKey) return state.storageKey;
    }
    throw new Error('NodeManagedWallet has no storage key for the provided context. Provision keys first.');
  }

  private requireManagedKey(context: WalletExecutionContext, selection: WalletKeySelection, expectedUse?: 'sig' | 'enc'): StoredManagedKey {
    if (selection.keyId) {
      for (const ownerState of this.owners.values()) {
        const match = ownerState.keys.find((entry) => entry.descriptor.kid === selection.keyId);
        if (match) {
          if (expectedUse && match.descriptor.use !== expectedUse) {
            throw new Error(`NodeManagedWallet key '${selection.keyId}' is not usable for '${expectedUse}'.`);
          }
          return match;
        }
      }
    }

    const scopes = this.inferRelevantScopes(context, selection);
    for (const scope of scopes) {
      const ownerState = this.tryGetOwnerState(context, scope);
      const match = ownerState?.keys.find((entry) => this.matchesSelection(entry.descriptor, selection));
      if (match) {
        if (expectedUse && match.descriptor.use !== expectedUse) {
          throw new Error(`NodeManagedWallet key '${match.descriptor.kid}' is not usable for '${expectedUse}'.`);
        }
        return match;
      }
    }

    throw new Error(`NodeManagedWallet found no managed key for selection ${JSON.stringify(selection)}.`);
  }

  private inferRelevantScopes(context: WalletExecutionContext | undefined, selection?: WalletKeySelection): WalletKeyOwnerScope[] {
    if (selection?.ownerScope) return [selection.ownerScope];
    const scopes: WalletKeyOwnerScope[] = [];
    if (context?.profile?.profileId) scopes.push('profile');
    if (context?.runtime?.runtimeId) scopes.push('runtime');
    return scopes.length > 0 ? scopes : ['runtime', 'profile'];
  }

  private matchesSelection(descriptor: WalletKeyDescriptor, selection?: WalletKeySelection): boolean {
    if (!selection) return true;
    if (selection.keyId && descriptor.kid !== selection.keyId) return false;
    if (selection.ownerScope && descriptor.ownerScope !== selection.ownerScope) return false;
    if (selection.purpose && descriptor.purpose !== selection.purpose) return false;
    if (selection.alg && descriptor.alg !== selection.alg) return false;
    return true;
  }

  private resolveAlgorithmForPurpose(purpose: WalletKeyPurpose): WalletAlgorithm {
    const resolved = this.policy.defaults[purpose];
    if (!resolved) {
      throw new Error(`NodeManagedWallet has no default algorithm configured for purpose '${purpose}'.`);
    }
    return resolved;
  }

  private deriveSignerSeed(seedMaterial: string | Uint8Array, ownerId: string, purpose: WalletKeyPurpose): string {
    const base = seedMaterial instanceof Uint8Array
      ? Buffer.from(seedMaterial).toString('base64url')
      : seedMaterial;
    return `${base}:${ownerId}:${purpose}`;
  }

  private deriveSeedBytes(seedMaterial: string | Uint8Array, ownerId: string, purpose: WalletKeyPurpose, size: number): Uint8Array {
    const source = seedMaterial instanceof Uint8Array
      ? Buffer.from(seedMaterial).toString('base64url')
      : seedMaterial;
    const blocks: Buffer[] = [];
    let counter = 0;
    while (Buffer.concat(blocks).length < size) {
      blocks.push(Buffer.from(this.deriveDeterministicBlock(source, ownerId, purpose, counter), 'hex'));
      counter += 1;
    }
    return Buffer.concat(blocks).subarray(0, size);
  }

  private deriveDeterministicBlock(seed: string, ownerId: string, purpose: WalletKeyPurpose, counter: number): string {
    return createHash('sha512')
      .update(seed, 'utf8')
      .update(':', 'utf8')
      .update(ownerId, 'utf8')
      .update(':', 'utf8')
      .update(purpose, 'utf8')
      .update(':', 'utf8')
      .update(String(counter), 'utf8')
      .digest('hex');
  }

  private resolveNodeDigestForAlgorithm(algorithm: WalletAlgorithm): string {
    switch (algorithm) {
      case 'ES256K':
        return 'sha256';
      case 'ES384':
        return 'sha384';
      case 'RS256':
        return 'sha256';
      default:
        throw new Error(`NodeManagedWallet does not support Node digest signing for algorithm '${algorithm}'.`);
    }
  }

  private async resolveRecipientPublicJwk(recipientDid: string): Promise<JWK> {
    if (!this.resolveRecipientJwk) {
      throw new Error(`NodeManagedWallet cannot resolve recipient DID '${recipientDid}' without options.resolveRecipientJwk.`);
    }
    return this.resolveRecipientJwk(recipientDid);
  }
}

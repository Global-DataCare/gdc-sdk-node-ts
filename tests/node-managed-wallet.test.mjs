import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, verify as cryptoVerify } from 'node:crypto';

import { NodeCryptoHelper, NodeManagedWallet } from '../dist/index.js';

/**
 * Low-level key contract, not a complete onboarding recipe:
 * this runtime scope is one generic portal user/profile device wallet. It can
 * belong to an organization controller, employee/professional or individual
 * controller. The actor kind is selected by the later high-level lifecycle,
 * not by these communication-key inputs.
 */
test('NodeManagedWallet provisions communication keys for any user/profile device', async () => {
  const userWallet = new NodeManagedWallet({
    cryptoHelper: new NodeCryptoHelper(),
  });

  const userCommunicationKeys = await userWallet.provisionManagedKeys(
    {
      runtime: {
        // Stable opaque id of this profile/device wallet, not an actor role,
        // DID, email, DCR client_id or global deployment identifier.
        runtimeId: 'portal-runtime:user-profile-7f3a:primary-device',
        // Describes where the wallet executes; it grants no authority.
        runtimeType: 'web-bff',
      },
    },
    {
      ownerScope: 'runtime',
      // DIDComm signing and encryption keys are technical communication keys,
      // not the user's person/professional-role signing key.
      purposes: ['comm-signing', 'comm-encryption'],
      // Test fixture only. A portal decrypts its stable KMS-protected seed in
      // the trusted backend and never hardcodes or sends it to ICA/GW.
      seedMaterial: 'user-profile-device-seed-001',
      mode: 'deterministic',
    },
  );

  const userCommunicationDescriptors = await userWallet.getPublicJwks(
    {
      runtime: {
        runtimeId: 'portal-runtime:user-profile-7f3a:primary-device',
        runtimeType: 'web-bff',
      },
    },
    { ownerScope: 'runtime' },
  );

  assert.equal(userCommunicationKeys.keys.length, 2);
  assert.equal(userCommunicationDescriptors.length, 2);
  assert.ok(userCommunicationDescriptors.some(
    (entry) => entry.alg === 'ML-DSA-44' && entry.use === 'sig',
  ));
  assert.ok(userCommunicationDescriptors.some(
    (entry) => entry.alg === 'ML-KEM-768' && entry.use === 'enc',
  ));
});

/**
 * Actor/person or professional-role signing is a separate profile scope. The
 * professional below is one explicit fixture; a controller or individual
 * controller supplies its own actor type and DID instead of reusing this key.
 */
test('NodeManagedWallet keeps actor-role signing separate from communication keys', async () => {
  const actorWallet = new NodeManagedWallet({
    cryptoHelper: new NodeCryptoHelper(),
  });

  const actorProfileContext = {
    profile: {
      // Stable local profile id for this actor key scope.
      profileId: 'professional-profile:main',
      // This fixture is specifically a professional. Other actor flows use
      // their own canonical actor type rather than copying this literal.
      actorType: 'professional',
      // Exact actor DID represented by the role-signing key.
      actorId: 'did:web:example.org:prof:main',
    },
  };

  const actorRoleKeys = await actorWallet.provisionManagedKeys(
    actorProfileContext,
    {
      ownerScope: 'profile',
      purposes: ['actor-signing'],
      // Deterministic test fixture only; production custody remains protected.
      seedMaterial: 'profile-role-seed-001',
      mode: 'deterministic',
    },
  );
  const actorRoleDescriptors = await actorWallet.getPublicJwks(
    actorProfileContext,
    { ownerScope: 'profile' },
  );

  assert.equal(actorRoleKeys.keys.length, 1);
  assert.equal(actorRoleDescriptors.length, 1);
  assert.equal(actorRoleDescriptors[0]?.purpose, 'actor-signing');
});

test('NodeManagedWallet exposes role-neutral user communication JWKS without a professional role key', async () => {
  // This wallet represents one portal profile/device. The actor may be a
  // controller, employee/professional or individual controller; that role is
  // established by the higher-level lifecycle proof, not by this keyring.
  const userWallet = new NodeManagedWallet({ cryptoHelper: new NodeCryptoHelper() });
  const userWalletContext = {
    runtime: {
      runtimeId: 'portal-runtime:user-profile-7f3a:primary-device',
      runtimeType: 'web-bff',
    },
  };

  // The portal persists this stable userWalletContext plus the seed encrypted
  // by its KMS/KEK. It does not need to persist private JWKs. If the product
  // uses a user PIN, that PIN only protects/unlocks the encrypted seed.
  const userPublicCommunicationJwks =
    await userWallet.initializeCommunicationJsonWebKeySet(userWalletContext, {
      seedMaterial: 'user-profile-device-wallet-seed',
    });
  const sameUserPublicCommunicationJwks =
    await userWallet.getCommunicationJsonWebKeySet(userWalletContext);

  // A new process/wallet instance reconstructs exactly the same keyring from
  // the same decrypted seed plus the same runtimeId.
  const restartedUserWallet = new NodeManagedWallet({ cryptoHelper: new NodeCryptoHelper() });
  const reconstructedUserPublicCommunicationJwks =
    await restartedUserWallet.initializeCommunicationJsonWebKeySet(userWalletContext, {
      seedMaterial: 'user-profile-device-wallet-seed',
    });

  assert.deepEqual(sameUserPublicCommunicationJwks, userPublicCommunicationJwks);
  assert.deepEqual(reconstructedUserPublicCommunicationJwks, userPublicCommunicationJwks);
  assert.equal(userPublicCommunicationJwks.keys.length, 2);
  assert.ok(userPublicCommunicationJwks.keys.some((key) => key.use === 'sig'));
  assert.ok(userPublicCommunicationJwks.keys.some((key) => key.use === 'enc'));
  assert.ok(userPublicCommunicationJwks.keys.every(
    (key) => key.d === undefined && key.dBytes === undefined,
  ));
});

test('NodeManagedWallet signs an id_token with the separate portal OpenID issuer wallet', async () => {
  // This is one portal-wide OpenID Provider issuer wallet, not one wallet per
  // controller, employee or individual. It proves the authenticated account
  // and verified email; user/profile communication wallets cannot replace it.
  const portalOidcIssuerWallet = new NodeManagedWallet({
    cryptoHelper: new NodeCryptoHelper(),
  });

  const portalOidcIssuerContext = {
    runtime: {
      // Stable application-owned identity of the portal's OIDC issuer runtime.
      runtimeId: 'portal-runtime:openid-provider:primary-issuer',
      runtimeType: 'web-bff',
    },
  };

  await portalOidcIssuerWallet.provisionManagedKeys(portalOidcIssuerContext, {
    ownerScope: 'runtime',
    purposes: ['openid-id-token-signing'],
    // Test fixture only; production uses the portal's protected issuer seed.
    seedMaterial: 'portal-openid-issuer-seed-001',
    mode: 'deterministic',
  });

  const signedIdToken = await portalOidcIssuerWallet.signCompactJws(
    portalOidcIssuerContext,
    {
      header: { alg: 'ES384', typ: 'JWT' },
      claims: {
        // Stable account subject at this issuer; it is not an actor DID.
        sub: 'portal-account-001',
        // Exact audience configured as trusted by the receiving GW.
        aud: 'did:web:gw.example.org',
        // Exact HTTPS issuer published in openid-configuration.
        iss: 'https://portal.example.org',
      },
      key: {
        ownerScope: 'runtime',
        purpose: 'openid-id-token-signing',
      },
    },
  );

  assert.match(signedIdToken, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  const [encodedHeader, encodedPayload, encodedSignature] = signedIdToken.split('.');
  const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
  const [descriptor] = await portalOidcIssuerWallet.getPublicJwks(portalOidcIssuerContext, {
    ownerScope: 'runtime',
    purpose: 'openid-id-token-signing',
    keyId: header.kid,
  });
  assert.equal(cryptoVerify(
    'sha384',
    Buffer.from(`${encodedHeader}.${encodedPayload}`, 'ascii'),
    { key: createPublicKey({ key: descriptor.publicJwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' },
    Buffer.from(encodedSignature, 'base64url'),
  ), true);
});

test('NodeManagedWallet packs the DIDComm message itself as the signed JWS claims', async () => {
  const wallet = new NodeManagedWallet({ cryptoHelper: new NodeCryptoHelper() });
  const context = {
    runtime: { runtimeId: 'portal-runtime:secure-message', runtimeType: 'web-bff' },
  };
  await wallet.provisionManagedKeys(context, {
    ownerScope: 'runtime',
    purposes: ['comm-signing'],
    seedMaterial: 'secure-message-seed',
    mode: 'deterministic',
  });
  wallet.buildCompactJwe = async (_context, request) => String(request.plaintext);

  const message = {
    iss: 'tenant-example',
    aud: 'tenant-example',
    jti: 'jti-example',
    thid: 'thid-example',
    type: 'application/didcomm-plain+json',
    body: { data: [{ type: 'LicenseAddRequest' }] },
  };
  const compactJws = await wallet.packForRecipientWithContext(message, { kty: 'OKP', kid: 'recipient' }, { context });
  const signedClaims = JSON.parse(Buffer.from(compactJws.split('.')[1], 'base64url').toString('utf8'));

  assert.deepEqual(signedClaims, message);
  assert.equal(signedClaims.payload, undefined);
});

test('NodeManagedWallet identifies its sender encryption key in the compact JWE protected header', async () => {
  const sender = new NodeManagedWallet({ cryptoHelper: new NodeCryptoHelper() });
  const recipient = new NodeManagedWallet({ cryptoHelper: new NodeCryptoHelper() });
  const senderContext = { runtime: { runtimeId: 'portal-runtime:jwe-sender', runtimeType: 'web-bff' } };
  const recipientContext = { runtime: { runtimeId: 'gateway-runtime:jwe-recipient', runtimeType: 'backend-service' } };

  await sender.provisionManagedKeys(senderContext, {
    ownerScope: 'runtime', purposes: ['comm-signing', 'comm-encryption'],
    seedMaterial: 'jwe-sender-seed', mode: 'deterministic',
  });
  await recipient.provisionManagedKeys(recipientContext, {
    ownerScope: 'runtime', purposes: ['comm-encryption'],
    seedMaterial: 'jwe-recipient-seed', mode: 'deterministic',
  });
  const [senderEncryption] = await sender.getPublicJwks(senderContext, {
    ownerScope: 'runtime', purpose: 'comm-encryption',
  });
  const [recipientEncryption] = await recipient.getPublicJwks(recipientContext, {
    ownerScope: 'runtime', purpose: 'comm-encryption',
  });

  const compactJwe = await sender.packForRecipientWithContext({
    iss: 'tenant-example', aud: 'tenant-example', jti: 'jti-example', thid: 'thid-example',
    type: 'application/didcomm-plain+json', body: { data: [{ type: 'LicenseAddRequest' }] },
  }, recipientEncryption.publicJwk, { context: senderContext });
  const protectedHeader = JSON.parse(Buffer.from(compactJwe.split('.')[0], 'base64url').toString('utf8'));

  assert.equal(protectedHeader.skid, senderEncryption.kid);
  assert.equal(protectedHeader.cty, 'JWS');
});

test('NodeManagedWallet protects and restores confidential documents with runtime storage keys', async () => {
  const wallet = new NodeManagedWallet({
    cryptoHelper: new NodeCryptoHelper(),
  });

  const context = {
    runtime: {
      runtimeId: 'portal-runtime:storage-001',
      runtimeType: 'web-bff',
    },
  };

  await wallet.provisionManagedKeys(context, {
    ownerScope: 'runtime',
    purposes: ['document-at-rest'],
    seedMaterial: 'storage-seed-001',
    mode: 'deterministic',
  });

  const protectedDoc = await wallet.protectManagedConfidentialData(
    { id: 'doc-1', content: { confidential: true, note: 'hello' } },
    context,
  );
  const restoredDoc = await wallet.unprotectManagedConfidentialData(protectedDoc, context);

  assert.ok(protectedDoc.jwe);
  const protectedHeader = JSON.parse(Buffer.from(protectedDoc.jwe.split('.')[0], 'base64url').toString());
  assert.equal(protectedHeader.enc, 'A256GCM');
  assert.equal(protectedHeader.gdc_pq_profile, 'confidential-pqc-v1');
  assert.equal(protectedHeader.gdc_key_purpose, 'document-at-rest');
  assert.equal(protectedDoc.content, undefined);
  assert.deepEqual(restoredDoc.content, { confidential: true, note: 'hello' });
});

test('confidential document fails closed for another storage profile and after tampering', async () => {
  const wallet = new NodeManagedWallet({ cryptoHelper: new NodeCryptoHelper() });
  const first = { profile: { profileId: 'profile-a' } };
  const second = { profile: { profileId: 'profile-b' } };
  for (const context of [first, second]) {
    await wallet.provisionManagedKeys(context, {
      ownerScope: 'profile', purposes: ['document-at-rest'], seedMaterial: context.profile.profileId, mode: 'deterministic',
    });
  }
  const protectedDoc = await wallet.protectManagedConfidentialData({ id: 'doc', content: { health: 'private' } }, first);
  await assert.rejects(wallet.unprotectManagedConfidentialData(protectedDoc, second));
  const parts = protectedDoc.jwe.split('.');
  // Mutate a full ciphertext sextet. Changing the final base64url character can
  // affect only unused padding bits and occasionally decode to identical bytes.
  parts[3] = `${parts[3].startsWith('A') ? 'B' : 'A'}${parts[3].slice(1)}`;
  await assert.rejects(wallet.unprotectManagedConfidentialData({ ...protectedDoc, jwe: parts.join('.') }, first));
});

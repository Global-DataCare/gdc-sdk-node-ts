import test from 'node:test';
import assert from 'node:assert/strict';

import { NodeCryptoHelper, NodeManagedWallet } from '../dist/index.js';

/**
 * Teaching goal:
 * sdk-node owns the concrete Node wallet/runtime adapters while reusing the
 * sdk-core wallet contract and common-utils crypto primitives.
 */
test('NodeManagedWallet provisions runtime and profile keys deterministically', async () => {
  const wallet = new NodeManagedWallet({
    cryptoHelper: new NodeCryptoHelper(),
  });

  const runtimeKeys = await wallet.provisionManagedKeys(
    {
      runtime: {
        runtimeId: 'portal-runtime:gdc-bff',
        runtimeType: 'web-bff',
      },
    },
    {
      ownerScope: 'runtime',
      purposes: ['comm-signing', 'comm-encryption', 'openid-id-token-signing'],
      seedMaterial: 'runtime-seed-001',
      mode: 'deterministic',
    },
  );

  const profileKeys = await wallet.provisionManagedKeys(
    {
      profile: {
        profileId: 'professional-profile:main',
        actorType: 'professional',
        actorId: 'did:web:example.org:prof:main',
      },
    },
    {
      ownerScope: 'profile',
      purposes: ['actor-signing'],
      seedMaterial: 'profile-seed-001',
      mode: 'deterministic',
    },
  );

  const runtimeDescriptors = await wallet.getPublicJwks(
    {
      runtime: {
        runtimeId: 'portal-runtime:gdc-bff',
        runtimeType: 'web-bff',
      },
    },
    { ownerScope: 'runtime' },
  );

  assert.equal(runtimeKeys.keys.length, 3);
  assert.equal(profileKeys.keys.length, 1);
  assert.equal(runtimeDescriptors.length, 3);
  assert.ok(runtimeDescriptors.some((entry) => entry.alg === 'ML-DSA-44' && entry.use === 'sig'));
  assert.ok(runtimeDescriptors.some((entry) => entry.alg === 'ML-KEM-768' && entry.use === 'enc'));
});

test('NodeManagedWallet signs compact JWS payloads with managed runtime keys', async () => {
  const wallet = new NodeManagedWallet({
    cryptoHelper: new NodeCryptoHelper(),
  });

  const context = {
    runtime: {
      runtimeId: 'portal-runtime:jwt-001',
      runtimeType: 'web-bff',
    },
  };

  await wallet.provisionManagedKeys(context, {
    ownerScope: 'runtime',
    purposes: ['openid-id-token-signing'],
    seedMaterial: 'jwt-seed-001',
    mode: 'deterministic',
  });

  const compact = await wallet.signCompactJws(context, {
    header: { alg: 'ES384', typ: 'JWT' },
    claims: { sub: 'did:web:example.org:user:001', aud: 'gw', iss: 'bff' },
    key: {
      ownerScope: 'runtime',
      purpose: 'openid-id-token-signing',
    },
  });

  assert.match(compact, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
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

// Flow contract: portable wallet recovery exports only an authenticated encrypted seed descriptor, rejects weak recovery secrets, and detects tampering or wrong secrets before returning material.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPortableProfileRecoveryEnvelope,
  openPortableProfileRecoveryEnvelope,
} from '../dist/index.js';

test('portable recovery round-trips a seed and public derivation descriptor without plaintext key material', () => {
  const walletSeed = Buffer.alloc(32, 7).toString('base64url');
  const envelope = createPortableProfileRecoveryEnvelope({
    profileId: 'profile-1',
    walletSeed,
    walletKeyDerivationId: 'profile-keys-v1',
    recoverySecret: 'correct horse battery staple 2026',
    protection: { cost: 1_024 },
  });
  const serialized = JSON.stringify(envelope);
  assert.equal(serialized.includes(walletSeed), false);
  assert.equal(serialized.includes('"d"'), false);
  assert.deepEqual(openPortableProfileRecoveryEnvelope({
    envelope,
    recoverySecret: 'correct horse battery staple 2026',
  }), {
    profileId: 'profile-1',
    walletSeed,
    walletKeyDerivationId: 'profile-keys-v1',
  });
});

test('portable recovery refuses a six-digit PIN as its only offline protection', () => {
  assert.throws(() => createPortableProfileRecoveryEnvelope({
    profileId: 'profile-1',
    walletSeed: Buffer.alloc(32, 7).toString('base64url'),
    walletKeyDerivationId: 'profile-keys-v1',
    recoverySecret: '123456',
    protection: { cost: 1_024 },
  }), /high-entropy recovery secret/);
});

test('portable recovery fails closed for a wrong secret or modified ciphertext', () => {
  const envelope = createPortableProfileRecoveryEnvelope({
    profileId: 'profile-1',
    walletSeed: Buffer.alloc(32, 7).toString('base64url'),
    walletKeyDerivationId: 'profile-keys-v1',
    recoverySecret: 'correct horse battery staple 2026',
    protection: { cost: 1_024 },
  });
  assert.throws(() => openPortableProfileRecoveryEnvelope({ envelope, recoverySecret: 'this is the wrong recovery secret' }), /could not be opened/);
  assert.throws(() => openPortableProfileRecoveryEnvelope({
    envelope: { ...envelope, ciphertextBase64Url: `${envelope.ciphertextBase64Url.slice(0, -1)}A` },
    recoverySecret: 'correct horse battery staple 2026',
  }), /could not be opened/);
});

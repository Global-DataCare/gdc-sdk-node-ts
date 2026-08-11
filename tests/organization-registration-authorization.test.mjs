import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NodeManagedWallet,
  signOrganizationRegistrationAuthorizationCredential,
} from '../dist/index.js';

/**
 * Flow contract: an authenticated host employee first unlocks/provisions the
 * server wallet; only that wallet can add the PQC contractAgreement proof.
 */
test('adds an ML-DSA-65 proof without exposing profile private material', async () => {
  const wallet = new NodeManagedWallet({
    policy: { defaults: { 'actor-signing': 'ML-DSA-65' } },
  });
  const context = { profile: { profileId: 'host-reviewer' } };
  const provisioned = await wallet.provisionManagedKeys(context, {
    ownerScope: 'profile',
    purposes: ['actor-signing'],
    mode: 'deterministic',
    seedMaterial: 'test-only-reviewer-seed',
  });
  const signingKey = provisioned.keys[0];
  const credential = {
    '@context': ['https://www.w3.org/ns/credentials/v2', 'https://schema.org'],
    id: 'urn:uuid:authorization',
    type: ['VerifiableCredential', 'OrganizationRegistrationAuthorizationCredential'],
    issuer: 'did:web:host.example',
    credentialSubject: { id: 'did:web:host.example:DSRC-001' },
    validFrom: '2026-08-10T00:00:00.000Z',
  };

  const signed = await signOrganizationRegistrationAuthorizationCredential({
    credential,
    wallet,
    context,
    key: { ownerScope: 'profile', purpose: 'actor-signing', alg: 'ML-DSA-65' },
    verificationMethod: `did:web:host.example:controller#${signingKey.kid}`,
    createdAt: '2026-08-10T01:00:00.000Z',
  });

  assert.equal(Array.isArray(signed.proof), true);
  assert.equal(signed.proof[0].proofPurpose, 'contractAgreement');
  assert.match(signed.proof[0].jws, /^[^.]+\.\.[A-Za-z0-9_-]+$/);
  assert.equal(JSON.stringify(signed).includes('test-only-reviewer-seed'), false);
});

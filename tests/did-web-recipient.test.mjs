import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveDidWebKeyAgreementJwk } from '../dist/index.js';

/**
 * DID recipient-resolution flow contract:
 * the recipient DID, not an environment JWK literal, selects the public
 * keyAgreement key; a transport override cannot substitute another identity.
 */
test('resolves the public keyAgreement JWK from the recipient DID document', async () => {
  const did = 'did:web:gw.example:acme:cds-ES:v1:health-care';
  const calls = [];
  const jwk = await resolveDidWebKeyAgreementJwk(did, {
    didDocumentUrl: 'http://127.0.0.1:3300/acme/cds-ES/v1/health-care/.well-known/did.json',
    fetchImpl: async (url) => {
      calls.push(url);
      return Response.json({
        id: did,
        verificationMethod: [{
          id: `${did}#kem-1`, controller: did, type: 'JsonWebKey2020',
          publicKeyJwk: { kty: 'OKP', crv: 'ML-KEM-768', use: 'enc', x: 'public-key' },
        }],
        keyAgreement: [`${did}#kem-1`],
      });
    },
  });

  assert.deepEqual(calls, ['http://127.0.0.1:3300/acme/cds-ES/v1/health-care/.well-known/did.json']);
  assert.deepEqual(jwk, { kty: 'OKP', crv: 'ML-KEM-768', use: 'enc', kid: 'kem-1', x: 'public-key' });
});

test('rejects a transport override that returns another DID identity', async () => {
  await assert.rejects(
    resolveDidWebKeyAgreementJwk('did:web:gw.example', {
      didDocumentUrl: 'http://127.0.0.1:3300/.well-known/did.json',
      fetchImpl: async () => Response.json({ id: 'did:web:other.example' }),
    }),
    /does not belong/,
  );
});

// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
// A BFF sends one PDQm Parameters request directly in FHIR mode or as exactly
// one DIDComm body.data[] entry; strict mode protects that same message and
// returns the same search Bundle after verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EXAMPLE_FORM_SUBJECT_IDENTIFIER_VALUE,
  EXAMPLE_INDEX_PROVIDER_SECTOR_DID_WEB,
  EXAMPLE_PROFESSIONAL_DID,
} from 'gdc-common-utils-ts/examples/shared';
import { NodeHttpClient, TransportProfiles } from '../dist/index.js';

const fhirBaseUrl = 'https://index.example.test/fhir';
const patient = {
  resourceType: 'Patient',
  identifier: [{
    system: 'urn:iso:std:iso:3166:ES:dni',
    value: EXAMPLE_FORM_SUBJECT_IDENTIFIER_VALUE,
  }],
};
const matchBundle = {
  resourceType: 'Bundle',
  type: 'searchset',
  total: 1,
  entry: [{ resource: { resourceType: 'Patient', identifier: patient.identifier } }],
};

function createFetchRecorder(profile, calls) {
  return async (url, init) => {
    calls.push({ url: String(url), init });
    if (profile === TransportProfiles.FhirJson) {
      return Response.json(matchBundle, {
        status: 200,
        headers: { 'content-type': TransportProfiles.FhirJson },
      });
    }
    if (profile === TransportProfiles.DidcommPlainJson) {
      return Response.json({ body: matchBundle }, {
        status: 200,
        headers: { 'content-type': TransportProfiles.DidcommPlainJson },
      });
    }
    return new Response(`response=${encodeURIComponent('response-jwe')}`, {
      status: 200,
      headers: { 'content-type': TransportProfiles.DidcommEncryptedForm },
    });
  };
}

for (const profile of Object.values(TransportProfiles)) {
  test(`matches one Patient through the provider with ${profile}`, async () => {
    const calls = [];
    const packedMessages = [];
    const secureTransportAdapter = profile === TransportProfiles.DidcommEncryptedForm
      ? {
          async pack(message) {
            packedMessages.push(message);
            return 'request-jwe+segment/value=';
          },
          async unpack(compactJwe) {
            assert.equal(compactJwe, 'response-jwe');
            return { body: matchBundle };
          },
        }
      : undefined;
    const client = new NodeHttpClient({
      baseUrl: 'https://gw.example.test',
      transportProfile: profile,
      secureTransportAdapter,
      fetchImpl: createFetchRecorder(profile, calls),
    });

    const result = await client.matchPatientAtIndexProvider({
      fhirBaseUrl,
      patient,
      requesterDid: EXAMPLE_PROFESSIONAL_DID,
      indexProviderDid: EXAMPLE_INDEX_PROVIDER_SECTOR_DID_WEB,
      onlyCertainMatches: true,
    });

    assert.deepEqual(result, matchBundle);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${fhirBaseUrl}/Patient/$match`);
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers['Content-Type'], profile);

    if (profile === TransportProfiles.FhirJson) {
      const body = JSON.parse(calls[0].init.body);
      assert.equal(body.resourceType, 'Parameters');
      assert.equal(body.parameter.length, 2);
      assert.deepEqual(body.parameter[0], { name: 'resource', resource: patient });
      return;
    }

    const message = profile === TransportProfiles.DidcommPlainJson
      ? JSON.parse(calls[0].init.body)
      : packedMessages[0];
    assert.equal(message.from, EXAMPLE_PROFESSIONAL_DID);
    assert.deepEqual(message.to, [EXAMPLE_INDEX_PROVIDER_SECTOR_DID_WEB]);
    assert.equal(message.body.resourceType, 'Bundle');
    assert.equal(message.body.data.length, 1);
    assert.equal(message.body.data[0].resource.resourceType, 'Parameters');
    assert.deepEqual(message.body.data[0].request, { method: 'POST', url: 'Patient/$match' });

    if (profile === TransportProfiles.DidcommEncryptedForm) {
      assert.equal(calls[0].init.body, 'request=request-jwe%2Bsegment%2Fvalue%3D');
      assert.equal(packedMessages.length, 1);
    }
  });
}

test('strict patient match fails before network I/O without a wallet-backed adapter', async () => {
  const calls = [];
  const client = new NodeHttpClient({
    baseUrl: 'https://gw.example.test',
    transportProfile: TransportProfiles.DidcommEncryptedForm,
    fetchImpl: createFetchRecorder(TransportProfiles.DidcommEncryptedForm, calls),
  });

  await assert.rejects(
    client.matchPatientAtIndexProvider({
      fhirBaseUrl,
      patient,
      requesterDid: EXAMPLE_PROFESSIONAL_DID,
      indexProviderDid: EXAMPLE_INDEX_PROVIDER_SECTOR_DID_WEB,
    }),
    /requires a secure adapter/,
  );
  assert.equal(calls.length, 0);
});

test('documents the high-level BFF flow without exposing the Fabric hash to the provider', () => {
  const guide = readFileSync('docs/101-PDQM_PATIENT_MATCH.md', 'utf8');
  const snippet = readFileSync('docs/snippets/pdqm-patient-match.ts', 'utf8');
  const readme = readFileSync('README.md', 'utf8');
  const endToEnd = readFileSync('docs/101-SDK_END_TO_END.md', 'utf8');
  const releaseSkill = readFileSync('.codex/skills/enforce-release-test-discipline/SKILL.md', 'utf8');

  for (const document of [guide, snippet, readme, endToEnd, releaseSkill]) {
    assert.match(document, /Patient\/\$match/);
    assert.doesNotMatch(document, /PIXm|\$ihe-pix/);
  }
  assert.match(guide, /opaque hash stops at Fabric/i);
  assert.match(guide, /exactly one entry/i);
  assert.match(guide, /application\/didcomm-plain\+json/);
  assert.match(guide, /application\/x-www-form-urlencoded/);
  assert.match(guide, /JAR\/JARM-inspired/);
  assert.match(snippet, /matchPatientAtIndexProvider/);
  assert.doesNotMatch(snippet, /pack\(|unpack\(|request-jwe|response-jwe/);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ActorKinds,
  DigitalTwinSdk,
  NodeActorSession,
  materializeDigitalTwinWithDeps,
  searchDigitalTwinsWithDeps,
} from '../dist/index.js';

const ctx = Object.freeze({ tenantId: 'acme', jurisdiction: 'ES', sector: 'health-care' });

test('DigitalTwinSdk is public and delegates token, search, and materialization', async () => {
  const calls = [];
  const client = {
    requestSmartToken: async (...args) => { calls.push(['token', args]); return { accessToken: 'smart' }; },
    searchDigitalTwins: async (...args) => { calls.push(['search', args]); return { ok: true }; },
    materializeDigitalTwin: async (...args) => { calls.push(['materialize', args]); return { ok: true }; },
  };
  const sdk = new DigitalTwinSdk(client);

  await sdk.requestSmartToken({ actorDid: 'did:web:api.acme.org:employee:one:ISCO-08|2211', scopes: [] });
  await sdk.search(ctx, { filters: { section: 'LOINC|10160-0' } });
  await sdk.materialize(ctx, { twinSubjectId: 'urn:uuid:twin-1' });

  assert.deepEqual(calls.map(([name]) => name), ['token', 'search', 'materialize']);
  assert.equal(calls[1][1][1].accessToken, 'smart');
  assert.equal(calls[2][1][1].accessToken, 'smart');
});

test('organization employees and professionals can materialize DigitalTwinSdk from ActorSession', () => {
  const client = {};
  assert.ok(new NodeActorSession({ actorKind: ActorKinds.OrganizationEmployee }, client).asDigitalTwin() instanceof DigitalTwinSdk);
  assert.ok(new NodeActorSession({ actorKind: ActorKinds.Professional }, client).asDigitalTwin() instanceof DigitalTwinSdk);
  assert.throws(
    () => new NodeActorSession({ actorKind: ActorKinds.IndividualController }, client).asDigitalTwin(),
    /cannot use digital-twin research operations/,
  );
});

test('digital-twin search uses the direct GW digitaltwin search and batch-response routes', async () => {
  const call = {};
  await searchDigitalTwinsWithDeps(ctx, {
    thid: 'search-1',
    resourceType: 'Composition',
    filters: { section: 'LOINC|10160-0', 'MedicationStatement.code': 'RXNORM|161' },
  }, {
    digitalTwinSearchPath: (_ctx, format, resourceType) => `/digitaltwin/${format}/${resourceType}/_search`,
    digitalTwinSearchPollPath: (_ctx, format, resourceType) => `/digitaltwin/${format}/${resourceType}/_batch-response`,
    digitalTwinCommunicationBatchPath: () => '',
    digitalTwinCommunicationPollPath: () => '',
    submitAndPoll: async (submitPath, pollPath, payload) => {
      Object.assign(call, { submitPath, pollPath, payload });
      return { ok: true };
    },
  });

  assert.equal(call.submitPath, '/digitaltwin/org.hl7.fhir.r4/Composition/_search');
  assert.equal(call.pollPath, '/digitaltwin/org.hl7.fhir.r4/Composition/_batch-response');
  assert.deepEqual(call.payload.body.parameter, [
    { name: 'section', valueString: 'LOINC|10160-0' },
    { name: 'MedicationStatement.code', valueString: 'RXNORM|161' },
  ]);
});

test('digital-twin materialization calls Communication and embeds the twin subject only', async () => {
  const call = {};
  await materializeDigitalTwinWithDeps(ctx, {
    thid: 'materialize-1',
    twinSubjectId: 'urn:uuid:twin-1',
    sections: ['LOINC|10160-0'],
    sent: '2026-08-15T18:00:00.000Z',
  }, {
    digitalTwinSearchPath: () => '',
    digitalTwinSearchPollPath: () => '',
    digitalTwinCommunicationBatchPath: (_ctx, format) => `/digitaltwin/${format}/Communication/_batch`,
    digitalTwinCommunicationPollPath: (_ctx, format) => `/digitaltwin/${format}/Communication/_batch-response`,
    submitAndPoll: async (submitPath, pollPath, payload) => {
      Object.assign(call, { submitPath, pollPath, payload });
      return { ok: true };
    },
  });

  assert.equal(call.submitPath, '/digitaltwin/org.hl7.fhir.r4/Communication/_batch');
  assert.equal(call.pollPath, '/digitaltwin/org.hl7.fhir.r4/Communication/_batch-response');
  const communication = call.payload.body.entry[0].resource;
  assert.equal(communication.subject.reference, 'urn:uuid:twin-1');
  const parameters = JSON.parse(Buffer.from(communication.payload[0].contentAttachment.data, 'base64').toString('utf8'));
  assert.deepEqual(parameters.parameter, [
    { name: 'subject', valueString: 'urn:uuid:twin-1' },
    { name: 'section', valueString: 'LOINC|10160-0' },
  ]);
});

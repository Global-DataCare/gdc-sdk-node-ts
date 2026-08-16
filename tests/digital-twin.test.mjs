import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ActorKinds,
  DigitalTwinSdk,
  NodeActorSession,
  materializeDigitalTwinWithDeps,
  saveDigitalTwinSelectionWithDeps,
  searchDigitalTwinsWithDeps,
} from '../dist/index.js';

const ctx = Object.freeze({ tenantId: 'acme', jurisdiction: 'ES', sector: 'health-care' });

test('DigitalTwinSdk is public and delegates token, search, tagged selection, and materialization', async () => {
  const calls = [];
  const client = {
    requestSmartToken: async (...args) => { calls.push(['token', args]); return { accessToken: 'smart' }; },
    searchDigitalTwins: async (...args) => { calls.push(['search', args]); return { ok: true }; },
    saveDigitalTwinSelection: async (...args) => { calls.push(['save-selection', args]); return { ok: true }; },
    materializeDigitalTwin: async (...args) => { calls.push(['materialize', args]); return { ok: true }; },
  };
  const sdk = new DigitalTwinSdk(client);

  await sdk.requestSmartToken({ actorDid: 'did:web:api.acme.org:employee:one:ISCO-08|2211', scopes: [] });
  await sdk.search(ctx, { filters: { section: 'LOINC|10160-0' } });
  await sdk.saveSelection(ctx, {
    twinSubjectId: 'urn:uuid:twin-1',
    section: 'LOINC|10160-0',
    tags: [{ system: 'urn:acme:research:workset', code: 'study-1' }],
  });
  await sdk.materialize(ctx, { twinSubjectId: 'urn:uuid:twin-1' });

  assert.deepEqual(calls.map(([name]) => name), ['token', 'search', 'save-selection', 'materialize']);
  assert.equal(calls[1][1][1].accessToken, 'smart');
  assert.equal(calls[2][1][1].accessToken, 'smart');
  assert.equal(calls[2][1][1].authorDid, 'did:web:api.acme.org:employee:one:ISCO-08|2211');
  assert.equal(calls[3][1][1].accessToken, 'smart');
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

test('DigitalTwinSdk binds SMART and working-selection authorship to the actor session', async () => {
  const actorDid = 'did:web:api.acme.org:employee:one:ISCO-08|2211';
  const anotherDid = 'did:web:api.acme.org:employee:two:ISCO-08|2211';
  const sdk = new DigitalTwinSdk({
    requestSmartToken: async () => ({ accessToken: 'smart' }),
    saveDigitalTwinSelection: async () => ({ ok: true }),
  }, actorDid);

  await assert.rejects(
    () => sdk.requestSmartToken({ actorDid: anotherDid, scopes: [] }),
    /actorDid must match the actor session/,
  );
  assert.throws(
    () => sdk.saveSelection(ctx, {
      authorDid: anotherDid,
      twinSubjectId: 'urn:uuid:twin-1',
      section: 'LOINC|10160-0',
      tags: [{ system: 'urn:acme:research:workset', code: 'study-1' }],
    }),
    /authorDid must match the actor session/,
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

test('digital-twin API search wraps Parameters so GW reads coded and custom-tag filters', async () => {
  const call = {};
  await searchDigitalTwinsWithDeps(ctx, {
    thid: 'search-api-1',
    format: 'org.hl7.fhir.api',
    filters: {
      section: 'LOINC|10160-0',
      'Composition.meta-tag': 'urn:acme:research:workset|study-1',
    },
  }, {
    digitalTwinSearchPath: (_ctx, format, resourceType) => `/digitaltwin/${format}/${resourceType}/_search`,
    digitalTwinSearchPollPath: (_ctx, format, resourceType) => `/digitaltwin/${format}/${resourceType}/_batch-response`,
    digitalTwinCommunicationBatchPath: () => '',
    digitalTwinCommunicationPollPath: () => '',
    digitalTwinCompositionBatchPath: () => '',
    digitalTwinCompositionPollPath: () => '',
    submitAndPoll: async (_submitPath, _pollPath, payload) => {
      Object.assign(call, { payload });
      return { ok: true };
    },
  });

  assert.deepEqual(call.payload.body.data[0].resource, {
    resourceType: 'Parameters',
    parameter: [
      { name: 'section', valueString: 'LOINC|10160-0' },
      { name: 'Composition.meta-tag', valueString: 'urn:acme:research:workset|study-1' },
    ],
  });
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

test('digital-twin selection saves a ledger-safe tagged researcher branch through Composition', async () => {
  const call = {};
  await saveDigitalTwinSelectionWithDeps(ctx, {
    thid: 'selection-1',
    compositionId: 'urn:uuid:selection-1',
    twinSubjectId: 'urn:uuid:twin-1',
    section: 'LOINC|10160-0',
    authorDid: 'did:web:api.acme.org:employee:one:ISCO-08|2211',
    date: '2026-08-16T09:00:00.000Z',
    tags: [
      { system: 'urn:acme:research:workset', code: 'study-2026-04', userSelected: true },
      { id: 'Composition.meta.tag[1]', system: 'urn:acme:research:status', code: 'reviewed' },
    ],
  }, {
    digitalTwinSearchPath: () => '',
    digitalTwinSearchPollPath: () => '',
    digitalTwinCompositionBatchPath: (_ctx, format) => `/digitaltwin/${format}/Composition/_batch`,
    digitalTwinCompositionPollPath: (_ctx, format) => `/digitaltwin/${format}/Composition/_batch-response`,
    digitalTwinCommunicationBatchPath: () => '',
    digitalTwinCommunicationPollPath: () => '',
    submitAndPoll: async (submitPath, pollPath, payload) => {
      Object.assign(call, { submitPath, pollPath, payload });
      return { ok: true };
    },
  });

  assert.equal(call.submitPath, '/digitaltwin/org.hl7.fhir.r4/Composition/_batch');
  assert.equal(call.pollPath, '/digitaltwin/org.hl7.fhir.r4/Composition/_batch-response');
  const composition = call.payload.body.entry[0].resource;
  assert.equal(composition.meta.claims['Composition.subject'], 'urn:uuid:twin-1');
  assert.equal(composition.meta.claims['Composition.author'], 'did:web:api.acme.org:employee:one:ISCO-08|2211');
  assert.deepEqual(composition.meta.tag, [
    {
      id: 'Composition.meta.tag[0]',
      system: 'urn:acme:research:workset',
      code: 'study-2026-04',
      userSelected: true,
    },
    {
      id: 'Composition.meta.tag[1]',
      system: 'urn:acme:research:status',
      code: 'reviewed',
    },
  ]);
  assert.equal(JSON.stringify(composition).includes('display'), false);
});

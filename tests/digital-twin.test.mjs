import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ActorKinds,
  DigitalTwinSdk,
  NodeActorSession,
  materializeDigitalTwinWithDeps,
  buildDigitalTwinSelectionIdentifier,
  resolveOperationalActorDid,
  saveDigitalTwinSelectionWithDeps,
  searchDigitalTwinsWithDeps,
} from '../dist/index.js';
import { HealthcareConsentPurposes, ServiceCapability } from 'gdc-common-utils-ts/constants';
import { buildOrganizationDidWeb, buildProfessionalDidWeb } from 'gdc-common-utils-ts/utils/did';
import {
  EXAMPLE_HOST_PUBLIC_HOSTNAME,
  EXAMPLE_ROUTE_VERSION,
  EXAMPLE_TENANT_ROUTE_CONTEXT,
  ExampleEmployeeEmails,
  ExampleEmployeeRoles,
} from 'gdc-common-utils-ts/examples';

const ctx = EXAMPLE_TENANT_ROUTE_CONTEXT;
const organizationDid = buildOrganizationDidWeb({
  hostDidWeb: `did:web:${EXAMPLE_HOST_PUBLIC_HOSTNAME}`,
  tenantId: ctx.tenantId,
  jurisdiction: ctx.jurisdiction,
  version: EXAMPLE_ROUTE_VERSION,
  sector: ctx.sector,
});
const actorDid = buildProfessionalDidWeb({
  organizationDidWeb: organizationDid,
  email: ExampleEmployeeEmails.SharedProfessional,
  role: ExampleEmployeeRoles.Doctor,
});

test('DigitalTwinSdk is public and delegates token, search, tagged selection, and materialization', async () => {
  const calls = [];
  const client = {
    requestSmartToken: async (...args) => { calls.push(['token', args]); return { accessToken: 'smart' }; },
    searchDigitalTwins: async (...args) => {
      calls.push(['search', args]);
      return {
        submit: { status: 202, body: {} },
        poll: {
          status: 200,
          attempts: 1,
          body: { data: [{ resource: { total: 1, data: [{ 'Composition.subject': 'urn:uuid:twin-1' }] } }] },
        },
      };
    },
    saveDigitalTwinSelection: async (...args) => { calls.push(['save-selection', args]); return { ok: true }; },
    materializeDigitalTwin: async (...args) => { calls.push(['materialize', args]); return { ok: true }; },
  };
  const sdk = new DigitalTwinSdk(client);

  await sdk.requestSmartToken({ actorDid, scopes: [] });
  const search = await sdk.search(ctx, { filters: { section: 'LOINC|10160-0' } });
  await sdk.saveSelection(ctx, {
    twinSubjectId: 'urn:uuid:twin-1',
    section: 'LOINC|10160-0',
    tags: [{ system: 'https://research.acme.org/fhir/CodeSystem/digital-twin-workset', code: 'study-1' }],
  });
  await sdk.materialize(ctx, { twinSubjectId: 'urn:uuid:twin-1' });

  assert.deepEqual(calls.map(([name]) => name), ['token', 'search', 'save-selection', 'materialize']);
  assert.equal(search.total, 1);
  assert.equal(search.matches[0]['Composition.subject'], 'urn:uuid:twin-1');
  assert.equal(search.operation.poll.status, 200);
  assert.equal(calls[0][1][0].purpose, HealthcareConsentPurposes.Research);
  assert.deepEqual(calls[0][1][0].scopes, [ServiceCapability.DigitalTwinReader]);
  assert.equal(calls[1][1][1].accessToken, 'smart');
  assert.equal(calls[2][1][1].accessToken, 'smart');
  assert.equal(calls[2][1][1].authorDid, actorDid);
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
  const anotherDid = buildProfessionalDidWeb({
    organizationDidWeb: organizationDid,
    email: 'second.' + ExampleEmployeeEmails.SharedProfessional,
    role: ExampleEmployeeRoles.Doctor,
  });
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
      tags: [{ system: 'https://research.acme.org/fhir/CodeSystem/digital-twin-workset', code: 'study-1' }],
    }),
    /authorDid must match the actor session/,
  );
});

test('DigitalTwinSdk scopes exact-tag searches to the operational employee DID', async () => {
  let received;
  const sdk = new DigitalTwinSdk({
    searchDigitalTwins: async (_ctx, input) => {
      received = input;
      return { poll: { body: { data: [{ resource: { total: 0, data: [] } }] } } };
    },
  }, actorDid);

  await sdk.searchSelections(ctx, {
    section: 'LOINC|10160-0',
    tag: { system: 'https://research.acme.org/fhir/CodeSystem/digital-twin-workset', code: 'study-1' },
  });

  assert.equal(received.filters['Composition.author'], actorDid);
  assert.equal(received.filters['Composition.meta-tag'], 'https://research.acme.org/fhir/CodeSystem/digital-twin-workset|study-1');
});

test('DigitalTwinSdk rejects a conflicting author even when supplied as a filter list', async () => {
  const sdk = new DigitalTwinSdk({ searchDigitalTwins: async () => ({}) }, actorDid);
  await assert.rejects(
    () => sdk.search(ctx, {
      filters: {
        section: 'LOINC|10160-0',
        'Composition.meta-tag': 'https://research.acme.org/fhir/CodeSystem/digital-twin-workset|study-1',
        'Composition.author': [actorDid, `${actorDid}:another`],
      },
    }),
    /author filter must match the actor session/,
  );
});

test('public portal aliases resolve to a hosted operational actor DID before session creation', async () => {
  const publicPortalDid = 'did:web:portal.example.org:employees:doctor';
  assert.equal(await resolveOperationalActorDid(publicPortalDid, async () => ({
    id: actorDid,
    alsoKnownAs: [publicPortalDid],
  })), actorDid);
  await assert.rejects(
    () => resolveOperationalActorDid(publicPortalDid, async () => ({ id: actorDid, alsoKnownAs: [] })),
    /does not bind the requested public actor alias/,
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
      'Composition.meta-tag': 'https://research.acme.org/fhir/CodeSystem/digital-twin-workset|study-1',
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
      { name: 'Composition.meta-tag', valueString: 'https://research.acme.org/fhir/CodeSystem/digital-twin-workset|study-1' },
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

test('digital-twin selection saves a tagged researcher working Composition', async () => {
  const call = {};
  await saveDigitalTwinSelectionWithDeps(ctx, {
    thid: 'selection-1',
    selectionId: 'selection-1',
    twinSubjectId: 'urn:uuid:twin-1',
    section: 'LOINC|10160-0',
    authorDid: actorDid,
    date: '2026-08-16T09:00:00.000Z',
    tags: [
      { system: 'https://research.acme.org/fhir/CodeSystem/digital-twin-workset', code: 'study-2026-04', userSelected: true },
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
  assert.equal(composition.meta.claims['Composition.author'], actorDid);
  assert.equal(composition.meta.claims['Composition.identifier'], 'selection-1');
  assert.equal('Composition.branch' in composition.meta.claims, false);
  assert.equal('Composition.branch-version' in composition.meta.claims, false);
  assert.deepEqual(composition.meta.tag, [
    {
      id: 'Composition.meta.tag[0]',
      system: 'https://research.acme.org/fhir/CodeSystem/digital-twin-workset',
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

test('digital-twin selections use only opaque FHIR logical ids', () => {
  const first = buildDigitalTwinSelectionIdentifier({ selectionId: 'selection-1' });
  const second = buildDigitalTwinSelectionIdentifier({ selectionId: 'selection-2' });
  assert.equal(first.selectionId, 'selection-1');
  assert.equal(first.compositionId, 'selection-1');
  assert.notEqual(first.compositionId, second.compositionId);
  assert.throws(
    () => buildDigitalTwinSelectionIdentifier({
      selectionId: 'urn:unsafe:non-fhir-id',
    }),
    /valid FHIR logical id/,
  );
});

// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
/**
 * Flow contract: an authenticated organization professional obtains SMART,
 * performs tenant-scoped basic discovery, saves a private working selection
 * and materializes only a registered pseudonymous twin subject.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ActorKinds,
  DigitalTwinSdk,
  DigitalTwinSearchParameter,
  NodeActorSession,
  materializeDigitalTwinWithDeps,
  buildDigitalTwinSelectionIdentifier,
  resolveOperationalActorDid,
  saveDigitalTwinSelectionWithDeps,
  searchDigitalTwinsWithDeps,
} from '../dist/index.js';
import {
  HealthcareConsentPurposes,
  HealthcareCoreSections,
  ServiceCapability,
} from 'gdc-common-utils-ts/constants';
import { CompositionClaim, MedicationStatementClaim } from 'gdc-common-utils-ts/models';
import { buildOrganizationDidWeb, buildProfessionalDidWeb } from 'gdc-common-utils-ts/utils/did';
import { stableActorIdentifierFromDidWeb } from 'gdc-common-utils-ts/utils/actor-identifier';
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
const medicationSection = HealthcareCoreSections.HistoryOfMedicationUse.attributeValue;
const twinSubjectId = 'urn:uuid:00000000-0000-4000-8000-000000000101';
const worksetTag = Object.freeze({
  system: stableActorIdentifierFromDidWeb(actorDid),
  code: 'medication-review',
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
          body: {
            type: 'https://didcomm.org/gdc/1.0/transaction-response',
            body: {
              resourceType: 'Bundle',
              type: 'batch-response',
              total: 1,
              data: [{
                type: 'ResearchSubject-search-response-v1.0',
                resource: {
                  resourceType: 'ResearchSubject',
                  identifier: [{ value: twinSubjectId }],
                  contained: [{
                    resourceType: 'Composition',
                    id: 'twin-composition',
                    subject: { reference: twinSubjectId },
                  }],
                },
              }],
            },
          },
        },
      };
    },
    saveDigitalTwinSelection: async (...args) => { calls.push(['save-selection', args]); return { ok: true }; },
    materializeDigitalTwin: async (...args) => { calls.push(['materialize', args]); return { ok: true }; },
  };
  const sdk = new DigitalTwinSdk(client);

  await sdk.requestSmartToken({ actorDid, scopes: [] });
  const search = await sdk.search(ctx, { filters: { [DigitalTwinSearchParameter.Section]: medicationSection } });
  await sdk.saveSelection(ctx, {
    twinSubjectId,
    section: medicationSection,
    tags: [worksetTag],
  });
  await sdk.materialize(ctx, { twinSubjectId });

  assert.deepEqual(calls.map(([name]) => name), ['token', 'search', 'save-selection', 'materialize']);
  assert.equal(search.total, 1);
  assert.equal(search.matches[0][CompositionClaim.Subject], twinSubjectId);
  assert.equal(search.matches[0].composition.resourceType, 'Composition');
  assert.equal(search.operation.poll.status, 200);
  assert.equal(calls[0][1][0].purpose, HealthcareConsentPurposes.Research);
  assert.deepEqual(calls[0][1][0].scopes, [`${ServiceCapability.DigitalTwinReader}?subject=*`]);
  assert.equal(calls[1][1][1].accessToken, 'smart');
  assert.equal(calls[2][1][1].accessToken, 'smart');
  assert.equal(calls[2][1][1].authorDid, actorDid);
  assert.equal(calls[3][1][1].accessToken, 'smart');
});

test('DigitalTwinSdk normalizes a claims-first ResearchSubject with mixed Composition claims', async () => {
  const sdk = new DigitalTwinSdk({
    searchDigitalTwins: async () => ({
      poll: {
        body: {
          total: 1,
          data: [{
            resource: {
              resourceType: 'ResearchSubject',
              meta: {
                claims: {
                  '@context': 'org.hl7.fhir.api',
                  'ResearchSubject.identifier': twinSubjectId,
                  [CompositionClaim.Subject]: twinSubjectId,
                },
              },
            },
          }],
        },
      },
    }),
  }, actorDid);

  const search = await sdk.search(ctx, {
    filters: { [DigitalTwinSearchParameter.Section]: medicationSection },
  });

  assert.equal(search.matches[0][CompositionClaim.Subject], twinSubjectId);
  assert.equal(search.matches[0].composition.meta.claims['@context'], 'org.hl7.fhir.api');
});

test('DigitalTwinSdk reads the deprecated nested search envelope during rolling deployments', async () => {
  const sdk = new DigitalTwinSdk({
    searchDigitalTwins: async () => ({
      poll: {
        body: { data: [{ resource: { total: 1, data: [{ [CompositionClaim.Subject]: twinSubjectId }] } }] },
      },
    }),
  }, actorDid);

  const search = await sdk.search(ctx, {
    filters: { [DigitalTwinSearchParameter.Section]: medicationSection },
  });

  assert.equal(search.total, 1);
  assert.equal(search.matches[0][CompositionClaim.Subject], twinSubjectId);
});

test('DigitalTwinSdk completes an explicit bare ResearchSubject reader scope with the root query', async () => {
  const calls = [];
  const sdk = new DigitalTwinSdk({
    requestSmartToken: async (input) => {
      calls.push(input);
      return { accessToken: 'smart' };
    },
  }, actorDid);

  await sdk.requestSmartToken({
    actorDid,
    scopes: [ServiceCapability.DigitalTwinReader],
  });

  assert.deepEqual(calls[0].scopes, [`${ServiceCapability.DigitalTwinReader}?subject=*`]);
});

test('DigitalTwinSdk rejects operational DIDs returned or supplied as twin subjects', async () => {
  const operationalDid = 'did:web:patient.example.org:individual:real-subject';
  const sdk = new DigitalTwinSdk({
    searchDigitalTwins: async () => ({
      poll: {
        body: { data: [{ resource: { total: 1, data: [{ [CompositionClaim.Subject]: operationalDid }] } }] },
      },
    }),
    saveDigitalTwinSelection: async () => ({ ok: true }),
    materializeDigitalTwin: async () => ({ ok: true }),
  }, actorDid);

  await assert.rejects(
    () => sdk.search(ctx, { filters: { [DigitalTwinSearchParameter.Section]: medicationSection } }),
    /valid urn:uuid/,
  );
  assert.throws(
    () => sdk.saveSelection(ctx, {
      twinSubjectId: operationalDid,
      section: medicationSection,
      tags: [worksetTag],
    }),
    /valid urn:uuid/,
  );
  assert.throws(
    () => sdk.materialize(ctx, { twinSubjectId: operationalDid }),
    /valid urn:uuid/,
  );
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
      twinSubjectId,
      section: medicationSection,
      tags: [worksetTag],
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
    section: medicationSection,
    tag: worksetTag,
  });

  assert.equal(received.filters[CompositionClaim.Author], actorDid);
  assert.equal(received.filters[DigitalTwinSearchParameter.MetaTag], `${worksetTag.system}|${worksetTag.code}`);
  assert.equal(received.resourceType, 'ResearchSubject');
});

test('DigitalTwinSdk rejects a conflicting author even when supplied as a filter list', async () => {
  const sdk = new DigitalTwinSdk({ searchDigitalTwins: async () => ({}) }, actorDid);
  await assert.rejects(
    () => sdk.search(ctx, {
      filters: {
        [DigitalTwinSearchParameter.Section]: medicationSection,
        [DigitalTwinSearchParameter.MetaTag]: `${worksetTag.system}|${worksetTag.code}`,
        [CompositionClaim.Author]: [actorDid, `${actorDid}:another`],
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

test('digital-twin search exposes ResearchSubject/_search and sends FHIR Parameters', async () => {
  const call = {};
  await searchDigitalTwinsWithDeps(ctx, {
    thid: 'search-1',
    filters: {
      [DigitalTwinSearchParameter.Section]: medicationSection,
      [MedicationStatementClaim.Code]: 'RXNORM|161',
    },
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

  assert.equal(call.submitPath, '/digitaltwin/org.hl7.fhir.r4/ResearchSubject/_search');
  assert.equal(call.pollPath, '/digitaltwin/org.hl7.fhir.r4/ResearchSubject/_batch-response');
  assert.deepEqual(call.payload.body.parameter, [
    { name: DigitalTwinSearchParameter.Section, valueString: medicationSection },
    { name: MedicationStatementClaim.Code, valueString: 'RXNORM|161' },
  ]);
});

test('digital-twin basic search sends repeated sections, text and an open-ended date range', async () => {
  const call = {};
  await searchDigitalTwinsWithDeps(ctx, {
    thid: 'basic-search-1',
    sections: [medicationSection, HealthcareCoreSections.Results.attributeValue],
    dateFrom: '2026-01-01',
    text: 'antiinflamatorio',
  }, {
    digitalTwinSearchPath: (_ctx, format, resourceType) => `/digitaltwin/${format}/${resourceType}/_search`,
    digitalTwinSearchPollPath: (_ctx, format, resourceType) => `/digitaltwin/${format}/${resourceType}/_batch-response`,
    digitalTwinCommunicationBatchPath: () => '',
    digitalTwinCommunicationPollPath: () => '',
    submitAndPoll: async (_submitPath, _pollPath, payload) => {
      Object.assign(call, { payload });
      return { ok: true };
    },
  });

  assert.deepEqual(call.payload.body.parameter, [
    { name: DigitalTwinSearchParameter.Section, valueString: medicationSection },
    { name: DigitalTwinSearchParameter.Section, valueString: HealthcareCoreSections.Results.attributeValue },
    { name: DigitalTwinSearchParameter.DateFrom, valueDate: '2026-01-01' },
    { name: DigitalTwinSearchParameter.Text, valueString: 'antiinflamatorio' },
  ]);
  assert.equal(call.payload.body.parameter.some(({ name }) => name === DigitalTwinSearchParameter.DateTo), false);
});

test('digital-twin API search wraps Parameters so GW reads coded and custom-tag filters', async () => {
  const call = {};
  await searchDigitalTwinsWithDeps(ctx, {
    thid: 'search-api-1',
    format: 'org.hl7.fhir.api',
    filters: {
      [DigitalTwinSearchParameter.Section]: medicationSection,
      [DigitalTwinSearchParameter.MetaTag]: `${worksetTag.system}|${worksetTag.code}`,
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
    meta: { claims: {
      '@context': 'org.hl7.fhir.api',
      [DigitalTwinSearchParameter.Section]: medicationSection,
      [DigitalTwinSearchParameter.MetaTag]: `${worksetTag.system}|${worksetTag.code}`,
    } },
    parameter: [
      { name: DigitalTwinSearchParameter.Section, valueString: medicationSection },
      { name: DigitalTwinSearchParameter.MetaTag, valueString: `${worksetTag.system}|${worksetTag.code}` },
    ],
  });
});

test('digital-twin materialization calls Communication and embeds the twin subject only', async () => {
  const call = {};
  await materializeDigitalTwinWithDeps(ctx, {
    thid: 'materialize-1',
    twinSubjectId,
    sections: [medicationSection],
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
  assert.equal(communication.subject.reference, twinSubjectId);
  const parameters = JSON.parse(Buffer.from(communication.payload[0].contentAttachment.data, 'base64').toString('utf8'));
  assert.deepEqual(parameters.parameter, [
    { name: 'subject', valueString: twinSubjectId },
    { name: DigitalTwinSearchParameter.Section, valueString: medicationSection },
  ]);
});

test('digital-twin selection saves a tagged researcher working Composition', async () => {
  const call = {};
  await saveDigitalTwinSelectionWithDeps(ctx, {
    thid: 'selection-1',
    selectionId: 'selection-1',
    twinSubjectId,
    section: medicationSection,
    authorDid: actorDid,
    date: '2026-08-16T09:00:00.000Z',
    // Even an untyped caller cannot downgrade an explicitly saved workset tag
    // to a system-derived tag; the runtime owns userSelected.
    tags: [{ ...worksetTag, userSelected: false }],
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
  assert.equal(composition.meta.claims[CompositionClaim.Subject], twinSubjectId);
  assert.equal(composition.meta.claims[CompositionClaim.Author], actorDid);
  assert.equal(composition.meta.claims[CompositionClaim.Identifier], 'selection-1');
  assert.equal('Composition.branch' in composition.meta.claims, false);
  assert.equal('Composition.branch-version' in composition.meta.claims, false);
  assert.deepEqual(composition.meta.tag, [
    {
      id: 'Composition.meta.tag[0]',
      system: worksetTag.system,
      code: worksetTag.code,
      userSelected: true,
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

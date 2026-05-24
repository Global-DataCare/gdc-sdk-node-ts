import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXAMPLE_CLINICAL_BUNDLE_SEARCH_INPUT,
  EXAMPLE_COMMUNICATION_INGESTION_PAYLOAD,
  EXAMPLE_CONSENT_GRANT_INPUT,
  EXAMPLE_DIGITAL_TWIN_COMPOSITION_INPUT,
  EXAMPLE_LATEST_IPS_SEARCH_INPUT,
  EXAMPLE_ORGANIZATION_EMPLOYEE_INPUT,
  EXAMPLE_RELATED_PERSON_PAYLOAD,
  EXAMPLE_TENANT_ROUTE_CONTEXT,
  cloneExample,
} from 'gdc-common-utils-ts/examples';

import {
  createOrganizationEmployeeWithDeps,
  generateDigitalTwinFromSubjectDataWithDeps,
  grantProfessionalAccessWithDeps,
  importIpsOrFhirAndUpdateIndexWithDeps,
  ingestCommunicationAndUpdateIndexWithDeps,
  searchClinicalBundleWithDeps,
  searchLatestIpsWithDeps,
  upsertRelatedPersonAndPollWithDeps,
} from '../dist/index.js';

test('createOrganizationEmployeeWithDeps builds employee batch payload', async () => {
  const calls = [];
  await createOrganizationEmployeeWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    cloneExample(EXAMPLE_ORGANIZATION_EMPLOYEE_INPUT),
    { timeoutMs: 1000, intervalMs: 1 },
    {
      employeeBatchPath: () => '/employee/_batch',
      employeePollPath: () => '/employee/_batch-response',
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], '/employee/_batch');
  assert.equal(calls[0][2].body.data[0].resource.meta.claims['org.schema.Person.email'], 'receptionist1@acme.org');
  assert.equal(calls[0][2].body.data[0].resource.meta.claims['org.schema.Person.hasOccupation.identifier.value'], 'ISCO-08|4226');
});

test('importIpsOrFhirAndUpdateIndexWithDeps rewrites api path family when needed', async () => {
  const calls = [];
  await importIpsOrFhirAndUpdateIndexWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    { compositionPayload: { body: {} }, format: 'api' },
    {
      individualCompositionR4BatchPath: () => '/x/org.hl7.fhir.r4/Composition/_batch',
      individualCompositionR4PollPath: () => '/x/org.hl7.fhir.r4/Composition/_batch-response',
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], '/x/org.hl7.fhir.api/Composition/_batch');
});

test('upsertRelatedPersonAndPollWithDeps preserves payload and routes', async () => {
  const calls = [];
  await upsertRelatedPersonAndPollWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    { relatedPersonPayload: cloneExample(EXAMPLE_RELATED_PERSON_PAYLOAD) },
    {
      individualRelatedPersonBatchPath: () => '/related/_batch',
      individualRelatedPersonPollPath: () => '/related/_batch-response',
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], '/related/_batch');
});

test('ingestCommunicationAndUpdateIndexWithDeps uses transformer on r4 path', async () => {
  const calls = [];
  await ingestCommunicationAndUpdateIndexWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    {
      communicationPayload: cloneExample(EXAMPLE_COMMUNICATION_INGESTION_PAYLOAD),
      pathFormatSegment: 'r4',
    },
    {
      individualCommunicationBatchPath: (_ctx, format) => `/${format}/Communication/_batch`,
      individualCommunicationPollPath: (_ctx, format) => `/${format}/Communication/_batch-response`,
      transformPayloadForFhirR4: (payload) => ({ ...payload, transformed: true }),
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], '/org.hl7.fhir.r4/Communication/_batch');
  assert.equal(calls[0][2].transformed, true);
});

test('grantProfessionalAccessWithDeps builds consent payload and returns built metadata', async () => {
  const calls = [];
  const result = await grantProfessionalAccessWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    cloneExample(EXAMPLE_CONSENT_GRANT_INPUT),
    {
      buildConsentClaimsWithCid: () => ({
        actorIdentifier: 'did:web:practitioner.example,ES',
        subjectIdentifier: 'did:web:subject.example',
        consentClaims: { a: 1 },
        claimsCid: 'cid-1',
      }),
      individualConsentR4BatchPath: () => '/consent/_batch',
      individualConsentR4PollPath: () => '/consent/_batch-response',
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], '/consent/_batch');
  assert.equal(typeof result.thid, 'string');
  assert.equal(result.consent.poll.status, 200);
});

test('generateDigitalTwinFromSubjectDataWithDeps selects api route when requested', async () => {
  const calls = [];
  await generateDigitalTwinFromSubjectDataWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    cloneExample(EXAMPLE_DIGITAL_TWIN_COMPOSITION_INPUT),
    {
      digitalTwinCompositionApiBatchPath: () => '/dt/api/_batch',
      digitalTwinCompositionApiPollPath: () => '/dt/api/_batch-response',
      digitalTwinCompositionR4BatchPath: () => '/dt/r4/_batch',
      digitalTwinCompositionR4PollPath: () => '/dt/r4/_batch-response',
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], '/dt/api/_batch');
});

test('searchClinicalBundleWithDeps builds canonical bundle search query with filters', async () => {
  const calls = [];
  await searchClinicalBundleWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    cloneExample(EXAMPLE_CLINICAL_BUNDLE_SEARCH_INPUT),
    {
      bundleSearchPath: () => '/bundle/_search',
      bundleSearchPollPath: () => '/bundle/_search-response',
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], '/bundle/_search');
  const requestUrl = calls[0][2].body.entry[0].request.url;
  assert.match(requestUrl, /Bundle\?type=document&/);
  assert.match(requestUrl, /composition.section=LOINC%7C60591-5%2CLOINC%7C48765-2/);
  assert.match(requestUrl, /start=2026-01-01/);
  assert.match(requestUrl, /end=2026-12-31/);
  assert.match(requestUrl, /code=LOINC%7C11450-4/);
  assert.match(requestUrl, /author=did%3Aweb%3Aapi\.acme\.org%3Aprofessional%3A1/);
});

test('searchLatestIpsWithDeps defaults to IPS section and core included types', async () => {
  const calls = [];
  await searchLatestIpsWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    cloneExample(EXAMPLE_LATEST_IPS_SEARCH_INPUT),
    {
      searchClinicalBundle: async (_ctx, input) => {
        calls.push(input);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0].section, 'LOINC|60591-5');
  assert.deepEqual(calls[0].includedTypes, ['Composition', 'DocumentReference']);
});

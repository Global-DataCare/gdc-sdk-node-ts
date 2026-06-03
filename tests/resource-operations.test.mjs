import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXAMPLE_EMPLOYEE_DISABLE_MESSAGE,
  EXAMPLE_INDIVIDUAL_DISABLE_MESSAGE,
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
  EmployeeDraft,
  createOrganizationEmployeeWithDeps,
  disableIndividualOrganizationWithDeps,
  disableOrganizationEmployeeWithDeps,
  generateDigitalTwinFromSubjectDataWithDeps,
  grantProfessionalAccessWithDeps,
  importIpsOrFhirAndUpdateIndexWithDeps,
  ingestCommunicationAndUpdateIndexWithDeps,
  purgeIndividualOrganizationWithDeps,
  purgeOrganizationEmployeeWithDeps,
  searchOrganizationEmployeesWithDeps,
  searchClinicalBundleWithDeps,
  searchLatestIpsWithDeps,
  upsertRelatedPersonAndPollWithDeps,
} from '../dist/index.js';

test('createOrganizationEmployeeWithDeps builds employee batch payload', async () => {
  const calls = [];
  await createOrganizationEmployeeWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    {
      employeeClaims: new EmployeeDraft()
        .mergeClaims(cloneExample(EXAMPLE_ORGANIZATION_EMPLOYEE_INPUT.employeeClaims))
        .toClaims(),
    },
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
  assert.equal(calls[0][2].body.data[0].resource.resourceType, 'Employee');
});

test('searchOrganizationEmployeesWithDeps builds Employee bundle search payload', async () => {
  const calls = [];
  await searchOrganizationEmployeesWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    {
      employeeClaims: {
        'org.schema.Person.email': 'receptionist1@acme.org',
        'org.schema.Person.hasOccupation.identifier.value': 'ISCO-08|4226',
      },
    },
    {
      employeeSearchPath: () => '/employee/_search',
      employeeSearchPollPath: () => '/employee/_search-response',
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], '/employee/_search');
  assert.equal(calls[0][1], '/employee/_search-response');
  assert.equal(calls[0][2].body.resourceType, 'Bundle');
  assert.equal(calls[0][2].body.entry[0].request.method, 'GET');
  assert.match(calls[0][2].body.entry[0].request.url, /^Employee\?/);
  assert.match(calls[0][2].body.entry[0].request.url, /org\.schema\.Person\.email=receptionist1%40acme\.org/);
});

test('disableOrganizationEmployeeWithDeps keeps the current GW CORE DELETE-in-batch contract', async () => {
  const calls = [];
  await disableOrganizationEmployeeWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    {
      employeeClaims: cloneExample(EXAMPLE_EMPLOYEE_DISABLE_MESSAGE.claims),
      resourceId: 'employee-to-disable',
    },
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
  assert.equal(calls[0][1], '/employee/_batch-response');
  assert.equal(calls[0][2].body.data[0].request.method, 'DELETE');
  assert.equal(calls[0][2].body.data[0].type, 'Employee-disable-request-v1.0');
  assert.equal(calls[0][2].body.data[0].resource.id, 'employee-to-disable');
});

test('purgeOrganizationEmployeeWithDeps uses the explicit current purge route', async () => {
  const calls = [];
  await purgeOrganizationEmployeeWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    {
      employeeClaims: cloneExample(EXAMPLE_EMPLOYEE_DISABLE_MESSAGE.claims),
      resourceId: 'employee-to-purge',
    },
    { timeoutMs: 1000, intervalMs: 1 },
    {
      employeePurgePath: () => '/employee/_purge',
      employeePurgePollPath: () => '/employee/_purge-response',
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], '/employee/_purge');
  assert.equal(calls[0][1], '/employee/_purge-response');
  assert.equal(calls[0][2].body.data[0].request.method, 'POST');
  assert.equal(calls[0][2].body.data[0].type, 'Employee-purge-request-v1.0');
});

test('disableIndividualOrganizationWithDeps uses the explicit current disable route', async () => {
  const calls = [];
  await disableIndividualOrganizationWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    {
      organizationClaims: cloneExample(EXAMPLE_INDIVIDUAL_DISABLE_MESSAGE.claims),
      resourceId: 'individual-org-1',
    },
    { timeoutMs: 1000, intervalMs: 1 },
    {
      individualOrganizationDisablePath: () => '/individual/org.schema/Organization/_disable',
      individualOrganizationDisablePollPath: () => '/individual/org.schema/Organization/_disable-response',
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], '/individual/org.schema/Organization/_disable');
  assert.equal(calls[0][1], '/individual/org.schema/Organization/_disable-response');
  assert.equal(calls[0][2].body.data[0].request.method, 'POST');
  assert.equal(calls[0][2].body.data[0].type, 'Family-disable-request-v1.0');
  assert.equal(calls[0][2].body.data[0].resource.id, 'individual-org-1');
});

test('purgeIndividualOrganizationWithDeps uses the explicit current purge route', async () => {
  const calls = [];
  await purgeIndividualOrganizationWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    {
      organizationClaims: cloneExample(EXAMPLE_INDIVIDUAL_DISABLE_MESSAGE.claims),
    },
    { timeoutMs: 1000, intervalMs: 1 },
    {
      individualOrganizationPurgePath: () => '/individual/org.schema/Organization/_purge',
      individualOrganizationPurgePollPath: () => '/individual/org.schema/Organization/_purge-response',
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], '/individual/org.schema/Organization/_purge');
  assert.equal(calls[0][1], '/individual/org.schema/Organization/_purge-response');
  assert.equal(calls[0][2].body.data[0].request.method, 'POST');
  assert.equal(calls[0][2].body.data[0].type, 'Family-purge-request-v1.0');
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

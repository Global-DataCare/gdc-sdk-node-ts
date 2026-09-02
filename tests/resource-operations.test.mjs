// Flow contract: Node clinical facades preserve Communication-carried FHIR batches,
// including independent mixed create/delete entries and optional request.ifMatch.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXAMPLE_LICENSE_ACTIVE_RECORD,
  EXAMPLE_EMPLOYEE_DISABLE_MESSAGE,
  EXAMPLE_INDIVIDUAL_DISABLE_MESSAGE,
  EXAMPLE_INDIVIDUAL_ORGANIZATION_DISABLE_ENTRY,
  EXAMPLE_INDIVIDUAL_ORGANIZATION_PURGE_ENTRY,
  EXAMPLE_CLINICAL_BUNDLE_SEARCH_INPUT,
  EXAMPLE_COMMUNICATION_INGESTION_PAYLOAD,
  EXAMPLE_CONSENT_GRANT_INPUT,
  EXAMPLE_DIGITAL_TWIN_COMPOSITION_INPUT,
  EXAMPLE_LATEST_IPS_SEARCH_INPUT,
  EXAMPLE_ORGANIZATION_EMPLOYEE_INPUT,
  EXAMPLE_RELATED_PERSON_DISABLE_INPUT,
  EXAMPLE_RELATED_PERSON_DISABLE_BUNDLE_ENTRY,
  EXAMPLE_RELATED_PERSON_IDENTIFIER,
  EXAMPLE_RELATED_PERSON_PURGE_BUNDLE_ENTRY,
  EXAMPLE_RELATED_PERSON_PAYLOAD,
  EXAMPLE_RELATED_PERSON_UPSERT_BUNDLE_PAYLOAD,
  EXAMPLE_SUBJECT_DID,
  EXAMPLE_TENANT_ROUTE_CONTEXT,
  cloneExample,
} from 'gdc-common-utils-ts/examples';
import {
  buildCommunicationParticipantSearchBundle,
  HealthcareBasicSections,
  buildExampleCommunicationParticipantSearchInput,
  buildFhirParametersResourceFromSearchParams,
  ClaimsOrganizationSchemaorg,
  ClaimsPersonSchemaorg,
  EmployeeBatchEntryTypes,
  EmployeeBundleMethods,
  EmployeeBundleRoutes,
  IndividualOrganizationLifecycleEditor,
  InteroperableLifecycleStatuses,
  HealthcareConsentPurposes,
  ServiceCapability,
} from 'gdc-common-utils-ts';
import { RelatedPersonClaim } from 'gdc-common-utils-ts/models/interoperable-claims/related-person-claims';
import { ClaimConsent, ConsentStatuses } from 'gdc-common-utils-ts/models/consent-rule';
import { buildGrantProfessionalAccessClaimsWithCid } from '../dist/runtime-consent.js';

import {
  EmployeeDraft,
  createOrganizationEmployeeWithDeps,
  prepareEmployeeLifecycleMessageForTransport,
  TransportProfiles,
  disableIndividualMemberWithDeps,
  disableIndividualOrganizationWithDeps,
  listIndividualLicenseOffersWithDeps,
  listIndividualLicenseOrdersWithDeps,
  disableOrganizationEmployeeWithDeps,
  generateDigitalTwinFromSubjectDataWithDeps,
  grantProfessionalAccessWithDeps,
  setDigitalTwinSecondaryUseConsentWithDeps,
  purgeDigitalTwinSubjectLinkWithDeps,
  buildProfessionalAccessRequestDecisionGrant,
  buildProfessionalAccessRequestSearchInput,
  importIpsOrFhirAndUpdateIndexWithDeps,
  ingestCommunicationAndUpdateIndexWithDeps,
  registerBlockchainArtifactAndUpdateIndexWithDeps,
  requestClinicalSummaryWithDeps,
  requestProfessionalAccessWithDeps,
  listIndividualLicensesWithDeps,
  addFreeIndividualMemberLicensesWithDeps,
  requestOrganizationEmployeeLicenseOfferWithDeps,
  issueIndividualMemberLicenseWithDeps,
  issueOrganizationEmployeeLicenseWithDeps,
  transitionIndividualMemberLicenseWithDeps,
  listOrganizationLicenseOffersWithDeps,
  listOrganizationLicenseOrdersWithDeps,
  listOrganizationLicensesWithDeps,
  purgeIndividualMemberWithDeps,
  purgeIndividualOrganizationWithDeps,
  purgeOrganizationEmployeeWithDeps,
  searchIndividualLicensesWithDeps,
  searchIndividualLicenseOffersWithDeps,
  searchIndividualLicenseOrdersWithDeps,
  searchOrganizationLicensesWithDeps,
  searchOrganizationLicenseOffersWithDeps,
  searchOrganizationLicenseOrdersWithDeps,
  searchOrganizationEmployeesWithDeps,
  searchClinicalBundleWithDeps,
  searchSubjectConsentsWithDeps,
  searchCommunicationParticipantsWithDeps,
  searchLatestIpsWithDeps,
  revokeProfessionalAccessWithDeps,
  upsertRelatedPersonAndPollWithDeps,
  buildBlockchainArtifactBundleFromSearchResponse,
  buildVitalSignBatchCommunicationFromSearchResponse,
  buildClinicalSectionUpdateIngestion,
  buildClinicalSummaryUpdateIngestion,
  GwCoreLifecycleRequestMethod,
  GwCoreLifecycleRequestType,
  revokeEmployeeDeviceWithDeps,
} from '../dist/index.js';

const TEST_ROUTE_CTX = cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT);

function gwV1Path(section, format, resourceType, action) {
  return `/${TEST_ROUTE_CTX.tenantId}/cds-${TEST_ROUTE_CTX.jurisdiction}/v1/${TEST_ROUTE_CTX.sector}/${section}/${format}/${resourceType}/${action}`;
}

const EMPLOYEE_BATCH_PATH = gwV1Path('entity', 'org.schema', 'Employee', '_batch');
const EMPLOYEE_BATCH_POLL_PATH = gwV1Path('entity', 'org.schema', 'Employee', '_batch-response');
const EMPLOYEE_SEARCH_PATH = gwV1Path('entity', 'org.schema', 'Employee', '_search');
const EMPLOYEE_SEARCH_POLL_PATH = gwV1Path('entity', 'org.schema', 'Employee', '_search-response');
const EMPLOYEE_PURGE_PATH = gwV1Path('entity', 'org.schema', 'Employee', '_purge');
const EMPLOYEE_PURGE_POLL_PATH = gwV1Path('entity', 'org.schema', 'Employee', '_purge-response');
const ORG_LICENSE_SEARCH_PATH = gwV1Path('entity', 'org.schema', 'License', '_search');
const ORG_LICENSE_SEARCH_POLL_PATH = gwV1Path('entity', 'org.schema', 'License', '_search-response');
const ORG_EMPLOYEE_LICENSE_ISSUE_PATH = `/host/cds-${TEST_ROUTE_CTX.jurisdiction}/v1/${TEST_ROUTE_CTX.sector}/${TEST_ROUTE_CTX.tenantId}/identity/auth/_issue`;
const ORG_EMPLOYEE_LICENSE_ISSUE_POLL_PATH = `${ORG_EMPLOYEE_LICENSE_ISSUE_PATH}-response`;
const ORG_OFFER_SEARCH_PATH = gwV1Path('entity', 'org.schema', 'Offer', '_search');
const ORG_OFFER_SEARCH_POLL_PATH = gwV1Path('entity', 'org.schema', 'Offer', '_search-response');
const ORG_ORDER_SEARCH_PATH = gwV1Path('entity', 'org.schema', 'Order', '_search');
const ORG_ORDER_SEARCH_POLL_PATH = gwV1Path('entity', 'org.schema', 'Order', '_search-response');
const INDIVIDUAL_ORG_DISABLE_PATH = gwV1Path('individual', 'org.schema', 'Organization', '_disable');
const INDIVIDUAL_ORG_DISABLE_POLL_PATH = gwV1Path('individual', 'org.schema', 'Organization', '_disable-response');
const INDIVIDUAL_ORG_PURGE_PATH = gwV1Path('individual', 'org.schema', 'Organization', '_purge');
const INDIVIDUAL_ORG_PURGE_POLL_PATH = gwV1Path('individual', 'org.schema', 'Organization', '_purge-response');
const INDIVIDUAL_LICENSE_SEARCH_PATH = gwV1Path('individual', 'org.schema', 'License', '_search');
const INDIVIDUAL_LICENSE_SEARCH_POLL_PATH = gwV1Path('individual', 'org.schema', 'License', '_search-response');
const INDIVIDUAL_LICENSE_ADD_PATH = gwV1Path('individual', 'org.schema', 'License', '_add');
const INDIVIDUAL_LICENSE_ACCEPT_PATH = gwV1Path('individual', 'org.schema', 'License', '_accept');
const INDIVIDUAL_LICENSE_ISSUE_PATH = gwV1Path('individual', 'org.schema', 'License', '_issue');
const INDIVIDUAL_OFFER_SEARCH_PATH = gwV1Path('individual', 'org.schema', 'Offer', '_search');
const INDIVIDUAL_OFFER_SEARCH_POLL_PATH = gwV1Path('individual', 'org.schema', 'Offer', '_search-response');
const INDIVIDUAL_ORDER_SEARCH_PATH = gwV1Path('individual', 'org.schema', 'Order', '_search');
const INDIVIDUAL_ORDER_SEARCH_POLL_PATH = gwV1Path('individual', 'org.schema', 'Order', '_search-response');
const INDIVIDUAL_RELATED_PERSON_BATCH_PATH = gwV1Path('individual', 'org.hl7.fhir.r4', 'RelatedPerson', '_batch');
const INDIVIDUAL_RELATED_PERSON_BATCH_POLL_PATH = gwV1Path('individual', 'org.hl7.fhir.r4', 'RelatedPerson', '_batch-response');
const INDIVIDUAL_RELATED_PERSON_PURGE_PATH = gwV1Path('individual', 'org.hl7.fhir.r4', 'RelatedPerson', '_purge');
const INDIVIDUAL_RELATED_PERSON_PURGE_POLL_PATH = gwV1Path('individual', 'org.hl7.fhir.r4', 'RelatedPerson', '_purge-response');
const INDIVIDUAL_COMPOSITION_R4_BATCH_PATH = gwV1Path('individual', 'org.hl7.fhir.r4', 'Composition', '_batch');
const INDIVIDUAL_COMPOSITION_R4_BATCH_POLL_PATH = gwV1Path('individual', 'org.hl7.fhir.r4', 'Composition', '_batch-response');
const INDIVIDUAL_CONSENT_R4_BATCH_PATH = gwV1Path('individual', 'org.hl7.fhir.r4', 'Consent', '_batch');
const INDIVIDUAL_CONSENT_R4_BATCH_POLL_PATH = gwV1Path('individual', 'org.hl7.fhir.r4', 'Consent', '_batch-response');
const INDIVIDUAL_COMMUNICATION_API_BATCH_PATH = gwV1Path('individual', 'org.hl7.fhir.api', 'Communication', '_batch');
const INDIVIDUAL_COMMUNICATION_API_BATCH_POLL_PATH = gwV1Path('individual', 'org.hl7.fhir.api', 'Communication', '_batch-response');
const INDIVIDUAL_COMMUNICATION_R4_BATCH_PATH = gwV1Path('individual', 'org.hl7.fhir.r4', 'Communication', '_batch');
const INDIVIDUAL_COMMUNICATION_R4_BATCH_POLL_PATH = gwV1Path('individual', 'org.hl7.fhir.r4', 'Communication', '_batch-response');
const DIGITAL_TWIN_COMPOSITION_API_BATCH_PATH = gwV1Path('digitaltwin', 'org.hl7.fhir.api', 'Composition', '_batch');
const DIGITAL_TWIN_COMPOSITION_API_BATCH_POLL_PATH = gwV1Path('digitaltwin', 'org.hl7.fhir.api', 'Composition', '_batch-response');
const DIGITAL_TWIN_COMPOSITION_R4_BATCH_PATH = gwV1Path('digitaltwin', 'org.hl7.fhir.r4', 'Composition', '_batch');
const DIGITAL_TWIN_COMPOSITION_R4_BATCH_POLL_PATH = gwV1Path('digitaltwin', 'org.hl7.fhir.r4', 'Composition', '_batch-response');
const INDIVIDUAL_COMMUNICATION_SEARCH_PATH = gwV1Path('individual', 'org.hl7.fhir.r4', 'Communication', '_search');
const INDIVIDUAL_COMMUNICATION_SEARCH_POLL_PATH = gwV1Path('individual', 'org.hl7.fhir.r4', 'Communication', '_search-response');
const INDIVIDUAL_BUNDLE_SEARCH_PATH = gwV1Path('individual', 'org.hl7.fhir.r4', 'Bundle', '_search');
const INDIVIDUAL_BUNDLE_SEARCH_POLL_PATH = gwV1Path('individual', 'org.hl7.fhir.r4', 'Bundle', '_search-response');
const INDIVIDUAL_DOCUMENT_REFERENCE_BATCH_PATH = gwV1Path('individual', 'org.hl7.fhir.r4', 'DocumentReference', '_batch');
const INDIVIDUAL_DOCUMENT_REFERENCE_BATCH_POLL_PATH = gwV1Path('individual', 'org.hl7.fhir.r4', 'DocumentReference', '_batch-response');

test('createOrganizationEmployeeWithDeps builds employee batch payload', async () => {
  const calls = [];
  const employeeClaims = cloneExample(EXAMPLE_ORGANIZATION_EMPLOYEE_INPUT.employeeClaims);
  await createOrganizationEmployeeWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    {
      employeeClaims: new EmployeeDraft()
        .mergeClaims(employeeClaims)
        .toClaims(),
    },
    { timeoutMs: 1000, intervalMs: 1 },
    {
      employeeBatchPath: () => EMPLOYEE_BATCH_PATH,
      employeePollPath: () => EMPLOYEE_BATCH_POLL_PATH,
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], EMPLOYEE_BATCH_PATH);
  assert.equal(
    calls[0][2].body.data[0].resource.meta.claims[ClaimsPersonSchemaorg.email],
    employeeClaims[ClaimsPersonSchemaorg.email],
  );
  assert.equal(
    calls[0][2].body.data[0].resource.meta.claims[ClaimsPersonSchemaorg.hasOccupationalRoleValue],
    employeeClaims[ClaimsPersonSchemaorg.hasOccupationalRoleValue],
  );
  assert.equal(calls[0][2].body.data[0].resource.resourceType, 'Employee');
  assert.match(calls[0][2].body.data[0].resource.id, /^urn:uuid:/);
  assert.equal(calls[0][2].body.data[0].fullUrl, calls[0][2].body.data[0].resource.id);
});

test('employee lifecycle keeps BundleEditor data in DIDComm and maps only FHIR transport to Bundle.entry', () => {
  const message = {
    thid: 'employee-transport',
    body: {
      data: [{
        type: 'Employee:Create',
        request: { method: 'POST' },
        resource: { resourceType: 'Employee', meta: { claims: { '@context': 'org.schema' } } },
      }],
    },
  };
  assert.equal(
    prepareEmployeeLifecycleMessageForTransport(message, TransportProfiles.DidcommEncryptedForm),
    message,
  );
  const fhir = prepareEmployeeLifecycleMessageForTransport(message, TransportProfiles.FhirJson);
  assert.deepEqual(fhir.body, {
    resourceType: 'Bundle',
    type: 'batch',
    entry: message.body.data,
  });
});

test('searchOrganizationEmployeesWithDeps builds Employee bundle search payload', async () => {
  const calls = [];
  const employeeClaims = cloneExample(EXAMPLE_ORGANIZATION_EMPLOYEE_INPUT.employeeClaims);
  await searchOrganizationEmployeesWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    {
      employeeClaims,
    },
    {
      employeeSearchPath: () => EMPLOYEE_SEARCH_PATH,
      employeeSearchPollPath: () => EMPLOYEE_SEARCH_POLL_PATH,
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], EMPLOYEE_SEARCH_PATH);
  assert.equal(calls[0][1], EMPLOYEE_SEARCH_POLL_PATH);
  assert.equal(calls[0][2].body.resourceType, 'Bundle');
  assert.equal(calls[0][2].body.entry[0].request.method, EmployeeBundleMethods.search);
  assert.equal(calls[0][2].body.entry[0].request.url, EmployeeBundleRoutes.search);
  assert.deepEqual(
    calls[0][2].body.entry[0].resource,
    buildFhirParametersResourceFromSearchParams(employeeClaims),
  );
});

test('searchOrganizationLicensesWithDeps builds canonical License bundle search payload', async () => {
  const calls = [];
  await searchOrganizationLicensesWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    {
      licenseQuery: {
        serialNumbers: [EXAMPLE_LICENSE_ACTIVE_RECORD.id],
        active: true,
      },
    },
    {
      organizationLicenseSearchPath: () => ORG_LICENSE_SEARCH_PATH,
      organizationLicenseSearchPollPath: () => ORG_LICENSE_SEARCH_POLL_PATH,
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], ORG_LICENSE_SEARCH_PATH);
  assert.equal(calls[0][1], ORG_LICENSE_SEARCH_POLL_PATH);
  assert.equal(calls[0][2].body.resourceType, 'Bundle');
  assert.equal(calls[0][2].body.entry[0].type, 'License-search-request-v1.0');
  assert.equal(calls[0][2].body.entry[0].meta.status, 'active');
});

test('listOrganizationLicensesWithDeps reuses search route without mandatory filters', async () => {
  const calls = [];
  await listOrganizationLicensesWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    undefined,
    {
      organizationLicenseSearchPath: () => ORG_LICENSE_SEARCH_PATH,
      organizationLicenseSearchPollPath: () => ORG_LICENSE_SEARCH_POLL_PATH,
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], ORG_LICENSE_SEARCH_PATH);
  assert.equal(calls[0][2].body.entry[0].type, 'License-search-request-v1.0');
});

test('disableOrganizationEmployeeWithDeps keeps the current GW CORE DELETE-in-batch contract', async () => {
  const calls = [];
  const employeeClaims = cloneExample(EXAMPLE_EMPLOYEE_DISABLE_MESSAGE.claims);
  await disableOrganizationEmployeeWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    {
      employeeClaims,
      resourceId: 'employee-to-disable',
    },
    { timeoutMs: 1000, intervalMs: 1 },
    {
      employeeBatchPath: () => EMPLOYEE_BATCH_PATH,
      employeePollPath: () => EMPLOYEE_BATCH_POLL_PATH,
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], EMPLOYEE_BATCH_PATH);
  assert.equal(calls[0][1], EMPLOYEE_BATCH_POLL_PATH);
  assert.equal(calls[0][2].body.data[0].request.method, GwCoreLifecycleRequestMethod.Delete);
  assert.equal(calls[0][2].body.data[0].type, EmployeeBatchEntryTypes.disable);
  assert.equal(calls[0][2].body.data[0].resource.id, 'employee-to-disable');
  assert.equal(
    calls[0][2].body.data[0].resource.meta.claims[ClaimsPersonSchemaorg.identifier],
    employeeClaims[ClaimsPersonSchemaorg.identifier],
  );
});

test('purgeOrganizationEmployeeWithDeps uses the explicit current purge route', async () => {
  const calls = [];
  const employeeClaims = cloneExample(EXAMPLE_EMPLOYEE_DISABLE_MESSAGE.claims);
  await purgeOrganizationEmployeeWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    {
      employeeClaims,
      resourceId: 'employee-to-purge',
    },
    { timeoutMs: 1000, intervalMs: 1 },
    {
      employeePurgePath: () => EMPLOYEE_PURGE_PATH,
      employeePurgePollPath: () => EMPLOYEE_PURGE_POLL_PATH,
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], EMPLOYEE_PURGE_PATH);
  assert.equal(calls[0][1], EMPLOYEE_PURGE_POLL_PATH);
  assert.equal(calls[0][2].body.data[0].request.method, EmployeeBundleMethods.purge);
  assert.equal(calls[0][2].body.data[0].type, EmployeeBatchEntryTypes.purge);
  assert.equal(calls[0][2].body.data[0].resource.id, 'employee-to-purge');
  assert.equal(
    calls[0][2].body.data[0].resource.meta.claims[ClaimsPersonSchemaorg.identifier],
    employeeClaims[ClaimsPersonSchemaorg.identifier],
  );
});

test('disableOrganizationEmployeeWithDeps rejects calls without resourceId', async () => {
  await assert.rejects(
    () => disableOrganizationEmployeeWithDeps(
      cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
      {
        employeeClaims: cloneExample(EXAMPLE_EMPLOYEE_DISABLE_MESSAGE.claims),
        resourceId: '',
      },
      { timeoutMs: 1000, intervalMs: 1 },
      {
        employeeBatchPath: () => EMPLOYEE_BATCH_PATH,
        employeePollPath: () => EMPLOYEE_BATCH_POLL_PATH,
        submitAndPoll: async () => ({ submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } }),
      },
    ),
    /disableEmployee: resourceId is required/i,
  );
});

test('purgeOrganizationEmployeeWithDeps rejects calls without resourceId', async () => {
  await assert.rejects(
    () => purgeOrganizationEmployeeWithDeps(
      cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
      {
        employeeClaims: cloneExample(EXAMPLE_EMPLOYEE_DISABLE_MESSAGE.claims),
        resourceId: '',
      },
      { timeoutMs: 1000, intervalMs: 1 },
      {
        employeePurgePath: () => EMPLOYEE_PURGE_PATH,
        employeePurgePollPath: () => EMPLOYEE_PURGE_POLL_PATH,
        submitAndPoll: async () => ({ submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } }),
      },
    ),
    /purgeEmployee: resourceId is required/i,
  );
});

test('disableIndividualOrganizationWithDeps uses the explicit current disable route', async () => {
  const calls = [];
  const individualEditor = new IndividualOrganizationLifecycleEditor()
    .setIdentifier(String(EXAMPLE_INDIVIDUAL_DISABLE_MESSAGE.claims[ClaimsOrganizationSchemaorg.identifier]))
    .setAlternateName(String(EXAMPLE_INDIVIDUAL_DISABLE_MESSAGE.claims[ClaimsOrganizationSchemaorg.alternateName]))
    .setOwnerEmail(String(EXAMPLE_INDIVIDUAL_DISABLE_MESSAGE.claims[ClaimsOrganizationSchemaorg.ownerEmail]));
  await disableIndividualOrganizationWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    {
      individualEditor,
      resourceId: 'individual-org-1',
    },
    { timeoutMs: 1000, intervalMs: 1 },
    {
      individualOrganizationDisablePath: () => INDIVIDUAL_ORG_DISABLE_PATH,
      individualOrganizationDisablePollPath: () => INDIVIDUAL_ORG_DISABLE_POLL_PATH,
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], INDIVIDUAL_ORG_DISABLE_PATH);
  assert.equal(calls[0][1], INDIVIDUAL_ORG_DISABLE_POLL_PATH);
  assert.deepEqual(calls[0][2].body.data[0], {
    ...cloneExample(EXAMPLE_INDIVIDUAL_ORGANIZATION_DISABLE_ENTRY),
    resource: {
      ...cloneExample(EXAMPLE_INDIVIDUAL_ORGANIZATION_DISABLE_ENTRY.resource),
      id: 'individual-org-1',
    },
  });
  assert.equal(calls[0][2].body.data[0].request.method, GwCoreLifecycleRequestMethod.Post);
  assert.equal(calls[0][2].body.data[0].type, GwCoreLifecycleRequestType.IndividualOrganizationDisable);
  assert.equal(calls[0][2].body.data[0].resource.id, 'individual-org-1');
});

test('purgeIndividualOrganizationWithDeps uses the explicit current purge route', async () => {
  const calls = [];
  const individualEditor = new IndividualOrganizationLifecycleEditor()
    .setIdentifier(String(EXAMPLE_INDIVIDUAL_DISABLE_MESSAGE.claims[ClaimsOrganizationSchemaorg.identifier]))
    .setAlternateName(String(EXAMPLE_INDIVIDUAL_DISABLE_MESSAGE.claims[ClaimsOrganizationSchemaorg.alternateName]))
    .setOwnerEmail(String(EXAMPLE_INDIVIDUAL_DISABLE_MESSAGE.claims[ClaimsOrganizationSchemaorg.ownerEmail]));
  await purgeIndividualOrganizationWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    {
      individualEditor,
    },
    { timeoutMs: 1000, intervalMs: 1 },
    {
      individualOrganizationPurgePath: () => INDIVIDUAL_ORG_PURGE_PATH,
      individualOrganizationPurgePollPath: () => INDIVIDUAL_ORG_PURGE_POLL_PATH,
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], INDIVIDUAL_ORG_PURGE_PATH);
  assert.equal(calls[0][1], INDIVIDUAL_ORG_PURGE_POLL_PATH);
  assert.deepEqual(calls[0][2].body.data[0], cloneExample(EXAMPLE_INDIVIDUAL_ORGANIZATION_PURGE_ENTRY));
  assert.equal(calls[0][2].body.data[0].request.method, GwCoreLifecycleRequestMethod.Post);
  assert.equal(calls[0][2].body.data[0].type, GwCoreLifecycleRequestType.IndividualOrganizationPurge);
});

test('disableIndividualOrganizationWithDeps still accepts deprecated organizationEditor alias', async () => {
  const calls = [];
  const organizationEditor = new IndividualOrganizationLifecycleEditor()
    .setIdentifier(String(EXAMPLE_INDIVIDUAL_DISABLE_MESSAGE.claims[ClaimsOrganizationSchemaorg.identifier]))
    .setAlternateName(String(EXAMPLE_INDIVIDUAL_DISABLE_MESSAGE.claims[ClaimsOrganizationSchemaorg.alternateName]))
    .setOwnerEmail(String(EXAMPLE_INDIVIDUAL_DISABLE_MESSAGE.claims[ClaimsOrganizationSchemaorg.ownerEmail]));
  await disableIndividualOrganizationWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    {
      organizationEditor,
      resourceId: 'individual-org-legacy',
    },
    { timeoutMs: 1000, intervalMs: 1 },
    {
      individualOrganizationDisablePath: () => INDIVIDUAL_ORG_DISABLE_PATH,
      individualOrganizationDisablePollPath: () => INDIVIDUAL_ORG_DISABLE_POLL_PATH,
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][2].body.data[0].resource.id, 'individual-org-legacy');
  assert.equal(calls[0][2].body.data[0].meta.claims[ClaimsOrganizationSchemaorg.identifier], organizationEditor.getIdentifier());
});

test('searchIndividualLicensesWithDeps builds canonical License bundle search payload for the subject side', async () => {
  const calls = [];
  await searchIndividualLicensesWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    {
      licenseQuery: {
        subjectId: EXAMPLE_LICENSE_ACTIVE_RECORD.subjectId,
        ownerOrganizationId: 'individual-org-patricia',
      },
    },
    {
      individualLicenseSearchPath: () => INDIVIDUAL_LICENSE_SEARCH_PATH,
      individualLicenseSearchPollPath: () => INDIVIDUAL_LICENSE_SEARCH_POLL_PATH,
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], INDIVIDUAL_LICENSE_SEARCH_PATH);
  assert.equal(calls[0][1], INDIVIDUAL_LICENSE_SEARCH_POLL_PATH);
  assert.equal(calls[0][2].body.entry[0].meta.subjectId, EXAMPLE_LICENSE_ACTIVE_RECORD.subjectId);
  assert.equal(calls[0][2].body.entry[0].meta.ownerOrganizationId, 'individual-org-patricia');
});

test('listIndividualLicensesWithDeps reuses search route without mandatory filters', async () => {
  const calls = [];
  await listIndividualLicensesWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    undefined,
    {
      individualLicenseSearchPath: () => INDIVIDUAL_LICENSE_SEARCH_PATH,
      individualLicenseSearchPollPath: () => INDIVIDUAL_LICENSE_SEARCH_POLL_PATH,
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], INDIVIDUAL_LICENSE_SEARCH_PATH);
  assert.equal(calls[0][2].body.entry[0].type, 'License-search-request-v1.0');
});

test('individual member license helpers keep add, FHIR-role issue and acceptance as explicit steps', async () => {
  /**
   * Flow contract:
   * 1. Adding a free seat changes only Patricia's pool.
   * 2. Issuing reserves that seat for an existing RelatedPerson with a FHIR
   *    v3 RoleCode.
   * 3. Accepting binds the Firebase-verified recipient to the seat.
   */
  const calls = [];
  const deps = {
    individualLicenseActionPath: (_ctx, action) => gwV1Path('individual', 'org.schema', 'License', action),
    individualLicenseActionPollPath: (_ctx, action) => gwV1Path('individual', 'org.schema', 'License', `${action}-response`),
    submitAndPoll: async (...args) => {
      calls.push(args);
      return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
    },
  };

  // Step 1. The zero price is part of the request instead of being inferred
  // from a missing payment record.
  await addFreeIndividualMemberLicensesWithDeps(TEST_ROUTE_CTX, {
    ownerOrganizationId: 'individual-org-patricia',
    quantity: 1,
  }, deps);
  assert.equal(calls[0][0], INDIVIDUAL_LICENSE_ADD_PATH);
  assert.equal(calls[0][2].body.data[0].meta.claims['org.schema.Offer.price'], 0);
  assert.equal(calls[0][2].body.data[0].meta.ownerOrganizationId, 'individual-org-patricia');

  // Step 2. A family/representative invitation carries its public contact,
  // RelatedPerson and role while preserving separate workflow identifiers.
  await issueIndividualMemberLicenseWithDeps(TEST_ROUTE_CTX, {
    ownerOrganizationId: 'individual-org-patricia',
    subjectDid: 'did:web:example.test:card:personal:patricia',
    relatedPersonId: 'related-fernando',
    invitationId: 'invite-fernando',
    role: 'v3-RoleCode|RESPRSN',
    telephone: '+34600111222',
  }, deps);
  assert.equal(calls[1][0], INDIVIDUAL_LICENSE_ISSUE_PATH);
  assert.equal(calls[1][2].body.data[0].meta.relatedPersonId, 'related-fernando');
  assert.equal(calls[1][2].body.data[0].meta.subjectDid, 'did:web:example.test:card:personal:patricia');

  // Step 3. Acceptance forwards the authenticated subject and verified
  // channel value so the GW does not treat the code as a bearer credential.
  await transitionIndividualMemberLicenseWithDeps(TEST_ROUTE_CTX, '_accept', {
    activationCode: 'lic-example',
    subjectId: 'did:web:example.test:person:fernando',
    verifiedActorIdentifier: '+34600111222',
  }, deps);
  assert.equal(calls[2][0], INDIVIDUAL_LICENSE_ACCEPT_PATH);
  assert.equal(calls[2][2].body.data[0].meta.verifiedActorIdentifier, '+34600111222');
  assert.equal(calls[2][2].body.data[0].meta.ownerOrganizationId, undefined);
});

test('professional seat acquisition requests an Offer without inventing price or seat ids', async () => {
  const calls = [];
  await requestOrganizationEmployeeLicenseOfferWithDeps(TEST_ROUTE_CTX, {
    issuerDid: 'did:web:gw.example:tenant:controller:one',
    quantity: 2,
  }, {
    organizationLicenseOfferCreatePath: () => gwV1Path('entity', 'org.schema', 'Offer', '_create'),
    organizationLicenseOfferCreatePollPath: () => gwV1Path('entity', 'org.schema', 'Offer', '_create-response'),
    submitAndPoll: async (...args) => {
      calls.push(args);
      return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], gwV1Path('entity', 'org.schema', 'Offer', '_create'));
  assert.equal(calls[0][1], gwV1Path('entity', 'org.schema', 'Offer', '_create-response'));
  assert.equal(calls[0][2].iss, 'did:web:gw.example:tenant:controller:one');
  const claims = calls[0][2].body.data[0].meta.claims;
  assert.equal(claims['org.schema.Offer.eligibleQuantity.value'], 2);
  assert.equal(claims['org.schema.IndividualProduct.category'], 'professional');
  assert.equal(claims['org.schema.Offer.price'], undefined);
  assert.equal(claims['org.schema.Offer.serialNumber'], undefined);
});

test('employee license issue binds one existing employee seat and does not invent a device id', async () => {
  const calls = [];
  await issueOrganizationEmployeeLicenseWithDeps(TEST_ROUTE_CTX, {
    email: 'Doctor.One@Example.org',
    role: 'ISCO-08|2211',
    subjectDid: 'did:web:provider.example:employee:doctor-one',
  }, {
    identityLicenseIssuePath: () => ORG_EMPLOYEE_LICENSE_ISSUE_PATH,
    identityLicenseIssuePollPath: () => ORG_EMPLOYEE_LICENSE_ISSUE_POLL_PATH,
    submitAndPoll: async (...args) => {
      calls.push(args);
      return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
    },
  });

  assert.equal(calls[0][0], ORG_EMPLOYEE_LICENSE_ISSUE_PATH);
  assert.equal(calls[0][1], ORG_EMPLOYEE_LICENSE_ISSUE_POLL_PATH);
  const entry = calls[0][2].body.data[0];
  assert.equal(entry.meta.claims['org.schema.Person.email'], 'doctor.one@example.org');
  assert.equal(entry.meta.claims['org.schema.Person.hasOccupation.identifier.value'], 'ISCO-08|2211');
  assert.equal(entry.meta.subjectDid, 'did:web:provider.example:employee:doctor-one');
  assert.equal(entry.meta.clientInstanceId, undefined);
});

test('employee device revocation targets one client while keeping the seat separate', async () => {
  const calls = [];
  await revokeEmployeeDeviceWithDeps({
    routeCtx: TEST_ROUTE_CTX,
    input: { licenseId: 'license-1', clientId: 'client-2' },
    identityDeviceRevokePath: () => '/identity/auth/_revoke',
    identityDeviceRevokePollPath: () => '/identity/auth/_revoke-response',
    submitAndPoll: async (...args) => {
      calls.push(args);
      return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
    },
  });
  assert.deepEqual(calls[0].slice(0, 2), ['/identity/auth/_revoke', '/identity/auth/_revoke-response']);
  assert.deepEqual(calls[0][2].body, { license_id: 'license-1', client_id: 'client-2' });
});

test('individual member issue helper rejects an ISCO professional before calling GW', async () => {
  // Step 1. A doctor can receive Consent and Communication, but the patient's
  // household license pool must remain untouched.
  let called = false;
  await assert.rejects(
    issueIndividualMemberLicenseWithDeps(TEST_ROUTE_CTX, {
      ownerOrganizationId: 'individual-org-patricia',
      subjectDid: 'did:web:example.test:card:personal:patricia',
      relatedPersonId: 'related-doctor',
      invitationId: 'invite-doctor',
      role: 'ISCO-08|2211',
      email: 'doctor@example.org',
    }, {
      individualLicenseActionPath: () => INDIVIDUAL_LICENSE_ISSUE_PATH,
      individualLicenseActionPollPath: () => `${INDIVIDUAL_LICENSE_ISSUE_PATH}-response`,
      submitAndPoll: async () => {
        called = true;
        throw new Error('must not be called');
      },
    }),
    /ISCO professional roles do not consume individual-member licenses/,
  );
  assert.equal(called, false);
});

test('searchOrganizationLicenseOffersWithDeps builds canonical Offer bundle search payload', async () => {
  const calls = [];
  await searchOrganizationLicenseOffersWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    {
      offerQuery: {
        offerIds: [EXAMPLE_LICENSE_ACTIVE_RECORD.offerId],
      },
    },
    {
      organizationLicenseOfferSearchPath: () => ORG_OFFER_SEARCH_PATH,
      organizationLicenseOfferSearchPollPath: () => ORG_OFFER_SEARCH_POLL_PATH,
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], ORG_OFFER_SEARCH_PATH);
  assert.equal(calls[0][1], ORG_OFFER_SEARCH_POLL_PATH);
  assert.equal(calls[0][2].body.data[0].type, 'Offer-search-request-v1.0');
});

test('listOrganizationLicenseOffersWithDeps reuses search route without mandatory filters', async () => {
  const calls = [];
  await listOrganizationLicenseOffersWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    undefined,
    {
      organizationLicenseOfferSearchPath: () => ORG_OFFER_SEARCH_PATH,
      organizationLicenseOfferSearchPollPath: () => ORG_OFFER_SEARCH_POLL_PATH,
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][2].body.data[0].type, 'Offer-search-request-v1.0');
});

test('searchOrganizationLicenseOrdersWithDeps builds canonical Order bundle search payload', async () => {
  const calls = [];
  await searchOrganizationLicenseOrdersWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    {
      orderQuery: {
        acceptedOfferIds: [EXAMPLE_LICENSE_ACTIVE_RECORD.offerId],
      },
    },
    {
      organizationLicenseOrderSearchPath: () => ORG_ORDER_SEARCH_PATH,
      organizationLicenseOrderSearchPollPath: () => ORG_ORDER_SEARCH_POLL_PATH,
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], ORG_ORDER_SEARCH_PATH);
  assert.equal(calls[0][1], ORG_ORDER_SEARCH_POLL_PATH);
  assert.equal(calls[0][2].body.data[0].type, 'Order-search-request-v1.0');
});

test('listOrganizationLicenseOrdersWithDeps reuses search route without mandatory filters', async () => {
  const calls = [];
  await listOrganizationLicenseOrdersWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    undefined,
    {
      organizationLicenseOrderSearchPath: () => ORG_ORDER_SEARCH_PATH,
      organizationLicenseOrderSearchPollPath: () => ORG_ORDER_SEARCH_POLL_PATH,
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][2].body.data[0].type, 'Order-search-request-v1.0');
});

test('searchIndividualLicenseOffersWithDeps builds canonical Offer bundle search payload for the subject side', async () => {
  const calls = [];
  await searchIndividualLicenseOffersWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    {
      offerQuery: {},
    },
    {
      individualLicenseOfferSearchPath: () => INDIVIDUAL_OFFER_SEARCH_PATH,
      individualLicenseOfferSearchPollPath: () => INDIVIDUAL_OFFER_SEARCH_POLL_PATH,
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], INDIVIDUAL_OFFER_SEARCH_PATH);
  assert.equal(calls[0][1], INDIVIDUAL_OFFER_SEARCH_POLL_PATH);
  assert.equal(calls[0][2].body.data[0].type, 'Offer-search-request-v1.0');
});

test('listIndividualLicenseOffersWithDeps reuses search route without mandatory filters', async () => {
  const calls = [];
  await listIndividualLicenseOffersWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    undefined,
    {
      individualLicenseOfferSearchPath: () => INDIVIDUAL_OFFER_SEARCH_PATH,
      individualLicenseOfferSearchPollPath: () => INDIVIDUAL_OFFER_SEARCH_POLL_PATH,
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][2].body.data[0].type, 'Offer-search-request-v1.0');
});

test('searchIndividualLicenseOrdersWithDeps builds canonical Order bundle search payload for the subject side', async () => {
  const calls = [];
  await searchIndividualLicenseOrdersWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    {
      orderQuery: {},
    },
    {
      individualLicenseOrderSearchPath: () => INDIVIDUAL_ORDER_SEARCH_PATH,
      individualLicenseOrderSearchPollPath: () => INDIVIDUAL_ORDER_SEARCH_POLL_PATH,
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], INDIVIDUAL_ORDER_SEARCH_PATH);
  assert.equal(calls[0][1], INDIVIDUAL_ORDER_SEARCH_POLL_PATH);
  assert.equal(calls[0][2].body.data[0].type, 'Order-search-request-v1.0');
});

test('listIndividualLicenseOrdersWithDeps reuses search route without mandatory filters', async () => {
  const calls = [];
  await listIndividualLicenseOrdersWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    undefined,
    {
      individualLicenseOrderSearchPath: () => INDIVIDUAL_ORDER_SEARCH_PATH,
      individualLicenseOrderSearchPollPath: () => INDIVIDUAL_ORDER_SEARCH_POLL_PATH,
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][2].body.data[0].type, 'Order-search-request-v1.0');
});

test('disableIndividualMemberWithDeps sends identifier-first lifecycle resource semantics for RelatedPerson', async () => {
  const calls = [];
  await disableIndividualMemberWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    cloneExample(EXAMPLE_RELATED_PERSON_DISABLE_INPUT),
    { timeoutMs: 1000, intervalMs: 100 },
    {
      individualRelatedPersonBatchPath: () => INDIVIDUAL_RELATED_PERSON_BATCH_PATH,
      individualRelatedPersonPollPath: () => INDIVIDUAL_RELATED_PERSON_BATCH_POLL_PATH,
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );

  assert.equal(calls[0][0], INDIVIDUAL_RELATED_PERSON_BATCH_PATH);
  assert.equal(calls[0][1], INDIVIDUAL_RELATED_PERSON_BATCH_POLL_PATH);
  assert.deepEqual(calls[0][2].body.entry[0], cloneExample(EXAMPLE_RELATED_PERSON_DISABLE_BUNDLE_ENTRY));
  assert.equal(calls[0][2].body.entry[0].resource.identifier[0].value, EXAMPLE_RELATED_PERSON_IDENTIFIER);
  assert.equal(calls[0][2].body.entry[0].resource.meta.status, InteroperableLifecycleStatuses.Inactive);
  assert.equal(calls[0][2].body.entry[0].meta.claims[RelatedPersonClaim.Active], undefined);
  assert.equal(calls[0][2].body.entry[0].resource.id, EXAMPLE_RELATED_PERSON_DISABLE_INPUT.resourceId);
});

test('purgeIndividualMemberWithDeps sends explicit RelatedPerson purge lifecycle semantics', async () => {
  const calls = [];
  await purgeIndividualMemberWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    cloneExample(EXAMPLE_RELATED_PERSON_DISABLE_INPUT),
    { timeoutMs: 1000, intervalMs: 100 },
    {
      individualRelatedPersonPurgePath: () => INDIVIDUAL_RELATED_PERSON_PURGE_PATH,
      individualRelatedPersonPurgePollPath: () => INDIVIDUAL_RELATED_PERSON_PURGE_POLL_PATH,
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );

  assert.equal(calls[0][0], INDIVIDUAL_RELATED_PERSON_PURGE_PATH);
  assert.equal(calls[0][1], INDIVIDUAL_RELATED_PERSON_PURGE_POLL_PATH);
  assert.deepEqual(calls[0][2].body.entry[0], cloneExample(EXAMPLE_RELATED_PERSON_PURGE_BUNDLE_ENTRY));
  assert.equal(calls[0][2].body.entry[0].resource.identifier[0].value, EXAMPLE_RELATED_PERSON_IDENTIFIER);
  assert.equal(calls[0][2].body.entry[0].request.method, GwCoreLifecycleRequestMethod.Post);
  assert.equal(calls[0][2].body.entry[0].type, GwCoreLifecycleRequestType.IndividualMemberPurge);
});

test('importIpsOrFhirAndUpdateIndexWithDeps rewrites api path family when needed', async () => {
  const calls = [];
  await importIpsOrFhirAndUpdateIndexWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    { compositionPayload: { body: {} }, format: 'api' },
    {
      individualCompositionR4BatchPath: () => INDIVIDUAL_COMPOSITION_R4_BATCH_PATH,
      individualCompositionR4PollPath: () => INDIVIDUAL_COMPOSITION_R4_BATCH_POLL_PATH,
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(
    calls[0][0],
    INDIVIDUAL_COMPOSITION_R4_BATCH_PATH.replace('/org.hl7.fhir.r4/', '/org.hl7.fhir.api/'),
  );
});

test('upsertRelatedPersonAndPollWithDeps preserves payload and routes', async () => {
  const calls = [];
  const relatedPersonPayload = cloneExample(EXAMPLE_RELATED_PERSON_UPSERT_BUNDLE_PAYLOAD);
  // Step 1. The caller keeps family relationship and operational functions in
  // separate claims; the SDK is transport orchestration and must not collapse
  // them or invent an access relationship.
  relatedPersonPayload.body.entry[0].resource.meta = { claims: {
    [RelatedPersonClaim.Relationship]:
      'http://terminology.hl7.org/CodeSystem/v3-RoleCode|FAMMEMB',
    [RelatedPersonClaim.Role]: 'ECON,BILL',
  } };
  await upsertRelatedPersonAndPollWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    { relatedPersonPayload },
    {
      individualRelatedPersonBatchPath: () => INDIVIDUAL_RELATED_PERSON_BATCH_PATH,
      individualRelatedPersonPollPath: () => INDIVIDUAL_RELATED_PERSON_BATCH_POLL_PATH,
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  // Step 2. GW receives exactly the two assertions and remains responsible for
  // rejecting non-terminology values such as PERMITTED.
  assert.equal(calls[0][0], INDIVIDUAL_RELATED_PERSON_BATCH_PATH);
  assert.deepEqual(calls[0][2], relatedPersonPayload);
  assert.equal(
    calls[0][2].body.entry[0].resource.meta.claims[RelatedPersonClaim.Role],
    'ECON,BILL',
  );
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
      individualCommunicationBatchPath: (_ctx, format) =>
        format === 'org.hl7.fhir.api' ? INDIVIDUAL_COMMUNICATION_API_BATCH_PATH : INDIVIDUAL_COMMUNICATION_R4_BATCH_PATH,
      individualCommunicationPollPath: (_ctx, format) =>
        format === 'org.hl7.fhir.api' ? INDIVIDUAL_COMMUNICATION_API_BATCH_POLL_PATH : INDIVIDUAL_COMMUNICATION_R4_BATCH_POLL_PATH,
      transformPayloadForFhirR4: (payload) => ({ ...payload, transformed: true }),
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], INDIVIDUAL_COMMUNICATION_R4_BATCH_PATH);
  assert.equal(calls[0][2].transformed, true);
});

test('registerBlockchainArtifactAndUpdateIndexWithDeps builds a blockchain-ready DocumentReference batch payload', async () => {
  const calls = [];
  await registerBlockchainArtifactAndUpdateIndexWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    {
      subject: 'did:web:example.com:subject:1',
      identifier: 'logical-artifact-001',
      resource: {
        resourceType: 'Observation',
        id: 'obs-1',
        status: 'final',
        code: { text: 'Heart rate' },
      },
    },
    {
      individualDocumentReferenceBatchPath: () => INDIVIDUAL_DOCUMENT_REFERENCE_BATCH_PATH,
      individualDocumentReferencePollPath: () => INDIVIDUAL_DOCUMENT_REFERENCE_BATCH_POLL_PATH,
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );

  assert.equal(calls[0][0], INDIVIDUAL_DOCUMENT_REFERENCE_BATCH_PATH);
  assert.equal(calls[0][1], INDIVIDUAL_DOCUMENT_REFERENCE_BATCH_POLL_PATH);
  assert.equal(calls[0][2].body.resourceType, 'Bundle');
  assert.equal(calls[0][2].body.type, 'batch');
  assert.equal(calls[0][2].body.data[0].type, 'DocumentReference');
  assert.equal(calls[0][2].body.data[0].resource.resourceType, 'DocumentReference');
  assert.equal(calls[0][2].body.data[0].resource.identifier[0].value, 'logical-artifact-001');
  assert.equal(calls[0][2].body.data[0].resource.meta.claims['DocumentReference.identifier'], 'logical-artifact-001');
  assert.equal(calls[0][2].body.data[0].resource.meta.claims['DocumentReference.subject'], 'did:web:example.com:subject:1');
  assert.equal(typeof calls[0][2].body.data[0].resource.meta.claims['DocumentReference.contenthash'], 'string');
  assert.equal(calls[0][2].body.data[0].resource.meta.claims['DocumentReference.contenthash'].startsWith('z'), true);
});

test('buildBlockchainArtifactBundleFromSearchResponse selects paginated batch ids into a blockchain-ready bundle', () => {
  const result = buildBlockchainArtifactBundleFromSearchResponse({
    subject: 'did:web:subject.example',
    searchResponse: {
      resourceType: 'Bundle',
      type: 'search-response',
      total: 4,
      data: [
        {
          id: 'urn:uuid:batch-1',
          fullUrl: 'urn:uuid:batch-1',
          type: 'bundle-batch-entry-v1.0',
          audit: { txId: 'tx-batch-1' },
          resource: {
            resourceType: 'Bundle',
            id: 'urn:uuid:batch-1',
            meta: { claims: { 'Bundle.identifier': 'urn:uuid:batch-1' } },
          },
        },
        {
          id: 'urn:uuid:batch-2',
          fullUrl: 'urn:uuid:batch-2',
          type: 'bundle-batch-entry-v1.0',
          resource: {
            resourceType: 'Bundle',
            id: 'urn:uuid:batch-2',
            meta: { claims: { 'Bundle.identifier': 'urn:uuid:batch-2' } },
          },
        },
        {
          id: 'urn:uuid:batch-3',
          fullUrl: 'urn:uuid:batch-3',
          type: 'bundle-batch-entry-v1.0',
          resource: {
            resourceType: 'Bundle',
            id: 'urn:uuid:batch-3',
            meta: { claims: { 'Bundle.identifier': 'urn:uuid:batch-3' } },
          },
        },
      ],
    },
    selectedResourceIds: ['urn:uuid:batch-2', 'urn:uuid:batch-3'],
  });

  assert.deepEqual(result.availableResourceIds, ['urn:uuid:batch-1', 'urn:uuid:batch-2', 'urn:uuid:batch-3']);
  assert.deepEqual(result.anchoredResourceIds, ['urn:uuid:batch-1']);
  assert.deepEqual(result.unanchoredResourceIds, ['urn:uuid:batch-2', 'urn:uuid:batch-3']);
  assert.deepEqual(result.selectedResourceIds, ['urn:uuid:batch-2', 'urn:uuid:batch-3']);
  assert.deepEqual(result.missingResourceIds, []);
  assert.equal(result.totalCount, 4);
  assert.equal(result.returnedCount, 3);
  assert.equal(result.bundle.resourceType, 'Bundle');
  assert.equal(result.bundle.type, 'batch');
  assert.equal(result.bundle.data.length, 2);
  assert.equal(result.bundle.meta.claims['BlockchainArtifactSelection.selectedCount'], 2);
  assert.equal(result.bundle.data[0].resource.resourceType, 'DocumentReference');
  assert.equal(result.bundle.data[0].resource.meta.claims['DocumentReference.identifier'], 'urn:uuid:batch-2');
});

test('buildBlockchainArtifactBundleFromSearchResponse rejects fully missing selected ids', () => {
  assert.throws(() => buildBlockchainArtifactBundleFromSearchResponse({
    subject: 'did:web:subject.example',
    searchResponse: {
      resourceType: 'Bundle',
      type: 'search-response',
      data: [],
    },
    selectedResourceIds: ['urn:uuid:missing-batch'],
  }), /could not match any selected resource ids/);
});

test('buildVitalSignBatchCommunicationFromSearchResponse wraps unanchored batch artifacts into one Communication payload', () => {
  const result = buildVitalSignBatchCommunicationFromSearchResponse({
    subject: 'did:web:subject.example',
    searchResponse: {
      resourceType: 'Bundle',
      type: 'search-response',
      total: 3,
      data: [
        {
          id: 'urn:uuid:batch-1',
          fullUrl: 'urn:uuid:batch-1',
          type: 'bundle-batch-entry-v1.0',
          audit: { txId: 'tx-batch-1' },
          resource: {
            resourceType: 'Bundle',
            id: 'urn:uuid:batch-1',
            meta: { claims: { 'Bundle.identifier': 'urn:uuid:batch-1' } },
          },
        },
        {
          id: 'urn:uuid:batch-2',
          fullUrl: 'urn:uuid:batch-2',
          type: 'bundle-batch-entry-v1.0',
          resource: {
            resourceType: 'Bundle',
            id: 'urn:uuid:batch-2',
            meta: { claims: { 'Bundle.identifier': 'urn:uuid:batch-2' } },
          },
        },
        {
          id: 'urn:uuid:batch-3',
          fullUrl: 'urn:uuid:batch-3',
          type: 'bundle-batch-entry-v1.0',
          resource: {
            resourceType: 'Bundle',
            id: 'urn:uuid:batch-3',
            meta: { claims: { 'Bundle.identifier': 'urn:uuid:batch-3' } },
          },
        },
      ],
    },
  });

  assert.equal(result.pathFormatSegment, 'org.hl7.fhir.r4');
  assert.equal(result.communicationPayload.resourceType, 'Communication');
  assert.equal(result.communicationPayload.payload.length, 1);

  const attachment = result.communicationPayload.payload[0].contentAttachment;
  const decodedBundle = JSON.parse(Buffer.from(attachment.data, 'base64').toString('utf8'));

  assert.equal(decodedBundle.resourceType, 'Bundle');
  assert.equal(decodedBundle.type, 'batch');
  assert.equal(decodedBundle.data.length, 2);
  assert.equal(decodedBundle.data[0].type, 'DocumentReference');
  assert.equal(decodedBundle.data[0].request.method, 'POST');
  assert.equal(decodedBundle.data[0].request.url, 'individual/org.hl7.fhir.r4/DocumentReference/_batch');
});

test('grantProfessionalAccessWithDeps builds consent payload and returns built metadata', async () => {
  const calls = [];
  let consentInput;
  const result = await grantProfessionalAccessWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    {
      ...cloneExample(EXAMPLE_CONSENT_GRANT_INPUT),
      eventBasedOn: 'urn:uuid:permission-request-1',
      sourceReference: 'Communication/permission-request-1',
      periodEnd: '2026-08-31T18:30:00Z',
    },
    {
      buildConsentClaimsWithCid: (input) => {
        consentInput = input;
        return {
          actorIdentifier: 'did:web:practitioner.example,ES',
          subjectIdentifier: 'did:web:subject.example',
          consentClaims: { a: 1 },
          claimsCid: 'cid-1',
        };
      },
      individualConsentR4BatchPath: () => INDIVIDUAL_CONSENT_R4_BATCH_PATH,
      individualConsentR4PollPath: () => INDIVIDUAL_CONSENT_R4_BATCH_POLL_PATH,
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], INDIVIDUAL_CONSENT_R4_BATCH_PATH);
  assert.equal(typeof result.thid, 'string');
  assert.equal(result.consent.poll.status, 200);
  assert.equal(consentInput.eventBasedOn, 'urn:uuid:permission-request-1');
  assert.equal(consentInput.sourceReference, 'Communication/permission-request-1');
  assert.equal(consentInput.periodEnd, '2026-08-31T18:30:00Z');
});

test('setDigitalTwinSecondaryUseConsentWithDeps authors the canonical research permit and deny rule', async () => {
  const captured = [];
  const submissions = [];
  const deps = {
    buildConsentClaimsWithCid: (input) => {
      captured.push(input);
      return {
        actorIdentifier: input.actorId,
        subjectIdentifier: input.subjectDid,
        consentClaims: {
          [ClaimConsent.subject]: input.subjectDid,
          [ClaimConsent.actorIdentifier]: input.actorId,
          [ClaimConsent.purpose]: input.purpose,
          [ClaimConsent.action]: input.actions.join(','),
          [ClaimConsent.decision]: input.decision,
          [ClaimConsent.identifier]: 'urn:uuid:caller-generated-value-must-not-leave-sdk',
          [ClaimConsent.sourceReference]: input.sourceReference,
          [ClaimConsent.attachmentContentType]: 'application/odrl+json',
          [ClaimConsent.attachmentData]: 'e30=',
        },
      };
    },
    individualConsentR4BatchPath: () => INDIVIDUAL_CONSENT_R4_BATCH_PATH,
    individualConsentR4PollPath: () => INDIVIDUAL_CONSENT_R4_BATCH_POLL_PATH,
    submitAndPoll: async (...args) => {
      submissions.push(args);
      return {
        submit: { status: 202, body: {} },
        poll: { status: 200, body: {}, attempts: 1 },
      };
    },
  };
  const baseInput = {
    subjectDid: 'did:web:subject.example',
    indexProviderOrganizationDid: 'did:web:index-provider.example',
    researchUseReference: 'https://portal.example/research',
  };

  await setDigitalTwinSecondaryUseConsentWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    { ...baseInput, decision: 'deny' },
    deps,
  );
  await setDigitalTwinSecondaryUseConsentWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    { ...baseInput, decision: 'permit' },
    deps,
  );

  assert.deepEqual(captured.map((input) => input.decision), ['deny', 'permit']);
  assert.equal(captured[0].purpose, HealthcareConsentPurposes.Research);
  assert.deepEqual(captured[0].actions, [ServiceCapability.DigitalTwinReader]);
  assert.equal(captured[0].actor, 'did:web:index-provider.example');
  assert.equal(captured[0].actorRole, '*');
  const submittedClaims = submissions[0][2].body.data[0].meta.claims;
  assert.equal(submittedClaims[ClaimConsent.attachmentContentType], undefined);
  assert.equal(submittedClaims[ClaimConsent.attachmentData], undefined);
  assert.equal(submittedClaims[ClaimConsent.identifier], undefined);
  assert.equal(submittedClaims[ClaimConsent.sourceReference], 'https://portal.example/research');
});

test('setDigitalTwinSecondaryUseConsentWithDeps rejects updates without a portal/software/study reference', async () => {
  await assert.rejects(
    setDigitalTwinSecondaryUseConsentWithDeps(
      cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
      {
        subjectDid: 'did:web:subject.example',
        indexProviderOrganizationDid: 'did:web:index-provider.example',
        decision: 'permit',
        researchUseReference: '',
      },
      {},
    ),
    /researchUseReference is required/,
  );
});

test('searchSubjectConsentsWithDeps reads one Consent rule through Communication -> Subject/_search Parameters', async () => {
  const calls = [];
  await searchSubjectConsentsWithDeps(TEST_ROUTE_CTX, {
    subject: EXAMPLE_SUBJECT_DID,
    actorIdentifier: 'did:web:index-provider.example',
    purpose: HealthcareConsentPurposes.Research,
    action: ServiceCapability.DigitalTwinReader,
    sourceReference: 'https://portal.example/research',
  }, {
    individualCommunicationBatchPath: () => INDIVIDUAL_COMMUNICATION_R4_BATCH_PATH,
    individualCommunicationPollPath: () => INDIVIDUAL_COMMUNICATION_R4_BATCH_POLL_PATH,
    submitAndPoll: async (submitPath, pollPath, payload) => {
      calls.push({ submitPath, pollPath, payload });
      return { poll: { body: { data: [] } } };
    },
  });

  assert.equal(calls[0].submitPath, INDIVIDUAL_COMMUNICATION_R4_BATCH_PATH);
  const communication = calls[0].payload.body.entry[0].resource;
  assert.equal(communication.resourceType, 'Communication');
  assert.equal(
    communication.payload[0].contentReference.reference,
    'individual/org.hl7.fhir.api/Subject/_search',
  );
  const parameters = JSON.parse(Buffer.from(
    communication.payload[0].contentAttachment.data,
    'base64',
  ).toString('utf8'));
  assert.deepEqual(parameters, {
    resourceType: 'Parameters',
    parameter: [
      { name: 'subject', valueString: EXAMPLE_SUBJECT_DID },
      { name: 'actor-identifier', valueString: 'did:web:index-provider.example' },
      { name: 'purpose', valueString: HealthcareConsentPurposes.Research },
      { name: 'action', valueString: ServiceCapability.DigitalTwinReader },
      { name: 'source-reference', valueString: 'https://portal.example/research' },
    ],
  });
});

test('purgeDigitalTwinSubjectLinkWithDeps calls the provider-offboarding endpoint with only the operational subject', async () => {
  const calls = [];
  await purgeDigitalTwinSubjectLinkWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    { subjectDid: 'did:web:subject.example' },
    {
      individualResearchSubjectPurgePath: () => '/individual/ResearchSubject/_purge',
      individualResearchSubjectPurgePollPath: () => '/individual/ResearchSubject/_purge-response',
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], '/individual/ResearchSubject/_purge');
  assert.equal(calls[0][1], '/individual/ResearchSubject/_purge-response');
  assert.deepEqual(calls[0][2].body.parameter, [{ name: 'subject', valueString: 'did:web:subject.example' }]);
});

test('runtime consent builder signs temporary expiry and request correlation claims together', () => {
  const built = buildGrantProfessionalAccessClaimsWithCid({
    ...cloneExample(EXAMPLE_CONSENT_GRANT_INPUT),
    periodEnd: '2026-08-31T18:30:00Z',
    eventBasedOn: 'urn:uuid:permission-request-1',
    sourceReference: 'Communication/permission-request-1',
  }, () => 'temporary-consent-runtime-1');

  assert.equal(built.consentClaims[ClaimConsent.periodEnd], '2026-08-31T18:30:00Z');
  assert.equal(built.consentClaims[ClaimConsent.eventBasedOn], 'urn:uuid:permission-request-1');
  assert.equal(built.consentClaims[ClaimConsent.sourceReference], 'Communication/permission-request-1');
});

test('requestProfessionalAccessWithDeps persists one canonical permission-request Communication', async () => {
  const calls = [];
  const result = await requestProfessionalAccessWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    {
      subject: 'did:web:subject.example',
      requester: { actorKind: 'professional', did: 'did:web:clinic.example:member:zHash:ISCO-08|2211' },
      requesterRole: 'ISCO-08|2211',
      purpose: 'TREAT',
      missing: { sections: ['LOINC|48765-2'], resourceTypes: [] },
      sender: 'did:web:clinic.example:member:zHash:ISCO-08|2211',
      recipient: 'did:web:subject.example',
    },
    {
      individualCommunicationBatchPath: () => '/Communication/_batch/r4',
      individualCommunicationPollPath: () => '/Communication/_batch/r4/poll',
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 201, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(result.communication.category[0], 'permission-request');
  assert.equal(result.communication.subject, 'did:web:subject.example');
  assert.match(result.communicationIdentifier, /^urn:uuid:/);
  assert.equal(calls[0][2].thid, result.thid);
  assert.equal(calls[0][2].body.resourceType, 'Bundle');
  assert.equal(calls[0][2].body.type, 'batch');
  assert.equal(calls[0][2].body.data.length, 1);
  assert.equal(calls[0][2].body.data[0].resource.resourceType, 'Communication');
  assert.equal(calls[0][2].body.data[0].resource.id, result.communicationIdentifier);
  assert.equal(JSON.stringify(calls[0][2]).includes('AccessRequest.'), false);
  assert.deepEqual(
    calls[0][2].body.data[0].resource.meta.claims,
    result.communication.claims,
  );
  const attachment = calls[0][2].body.data[0].resource.payload[0].contentAttachment;
  const draftBundle = JSON.parse(Buffer.from(attachment.data, 'base64').toString('utf8'));
  assert.equal(attachment.contentType, 'application/fhir+json');
  assert.equal(draftBundle.resourceType, 'Bundle');
  assert.equal(draftBundle.type, 'batch');
  assert.equal(draftBundle.data.length, 1);
  assert.equal(draftBundle.data[0].resource.resourceType, 'Consent');
  assert.equal(draftBundle.data[0].resource.status, ConsentStatuses.Draft);
  assert.equal(
    draftBundle.data[0].resource.meta.claims[ClaimConsent.status],
    ConsentStatuses.Draft,
  );
});

test('requestProfessionalAccessWithDeps rejects an empty permission request', async () => {
  await assert.rejects(
    requestProfessionalAccessWithDeps(
      cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
      {
        subject: 'did:web:subject.example',
        requester: { actorKind: 'professional', did: 'did:web:clinic.example:member:zHash:ISCO-08|2211' },
        missing: { sections: [], resourceTypes: [] },
      },
      {
        individualCommunicationBatchPath: () => '',
        individualCommunicationPollPath: () => '',
        submitAndPoll: async () => { throw new Error('must not submit'); },
      },
    ),
    /at least one missing permission/,
  );
});

test('buildProfessionalAccessRequestDecisionGrant links the Consent to the original Communication', () => {
  const grant = buildProfessionalAccessRequestDecisionGrant({
    ...cloneExample(EXAMPLE_CONSENT_GRANT_INPUT),
    requestThid: 'permission-request-thread-1',
    requestCommunicationIdentifier: 'urn:uuid:permission-request-1',
    periodEnd: '2026-08-31T18:30:00Z',
  });
  assert.equal(grant.eventBasedOn, 'urn:uuid:permission-request-1');
  assert.equal(
    grant.sourceReference,
    'Communication?identifier=urn%3Auuid%3Apermission-request-1',
  );
  assert.equal(grant.periodEnd, '2026-08-31T18:30:00Z');
});

test('buildProfessionalAccessRequestSearchInput preserves participant filters and fixes the category', () => {
  assert.deepEqual(buildProfessionalAccessRequestSearchInput({
    subject: 'did:web:subject.example',
    senderActorId: 'did:web:clinic.example:member:zHash:ISCO-08|2211',
    searchParams: { 'Communication.topic': 'clinical-access' },
  }), {
    subject: 'did:web:subject.example',
    senderActorId: 'did:web:clinic.example:member:zHash:ISCO-08|2211',
    searchParams: {
      'Communication.topic': 'clinical-access',
      'Communication.category': 'permission-request',
    },
  });
});

test('revokeProfessionalAccessWithDeps closes consent by setting period end', async () => {
  const calls = [];
  const result = await revokeProfessionalAccessWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    {
      consentClaims: {
        '@context': 'org.hl7.fhir.api',
        'Consent.identifier': 'urn:uuid:consent-1',
        'Consent.subject': 'did:web:subject.example',
        'Consent.actor-identifier': 'did:web:professional.example',
        [ClaimConsent.periodStart]: '2026-01-01T00:00:00Z',
      },
      periodEnd: '2026-06-18T00:00:00Z',
    },
    {
      individualConsentR4BatchPath: () => INDIVIDUAL_CONSENT_R4_BATCH_PATH,
      individualConsentR4PollPath: () => INDIVIDUAL_CONSENT_R4_BATCH_POLL_PATH,
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], INDIVIDUAL_CONSENT_R4_BATCH_PATH);
  assert.equal(calls[0][2].body.data[0].meta.claims[ClaimConsent.periodEnd], '2026-06-18T00:00:00Z');
  assert.equal(result.consent.poll.status, 200);
  assert.equal(result.consentClaims[ClaimConsent.periodEnd], '2026-06-18T00:00:00Z');
});

test('generateDigitalTwinFromSubjectDataWithDeps selects api route when requested', async () => {
  const calls = [];
  await generateDigitalTwinFromSubjectDataWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    cloneExample(EXAMPLE_DIGITAL_TWIN_COMPOSITION_INPUT),
    {
      digitalTwinCompositionApiBatchPath: () => DIGITAL_TWIN_COMPOSITION_API_BATCH_PATH,
      digitalTwinCompositionApiPollPath: () => DIGITAL_TWIN_COMPOSITION_API_BATCH_POLL_PATH,
      digitalTwinCompositionR4BatchPath: () => DIGITAL_TWIN_COMPOSITION_R4_BATCH_PATH,
      digitalTwinCompositionR4PollPath: () => DIGITAL_TWIN_COMPOSITION_R4_BATCH_POLL_PATH,
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], DIGITAL_TWIN_COMPOSITION_API_BATCH_PATH);
});

test('searchCommunicationParticipantsWithDeps builds canonical search bundle payload', async () => {
  const calls = [];
  const input = buildExampleCommunicationParticipantSearchInput();

  await searchCommunicationParticipantsWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    {
      searchParams: input.searchParams,
      subject: input.subject,
      userActorId: input.userActorId,
      targetActorId: input.targetActorId,
    },
    {
      communicationSearchPath: () => INDIVIDUAL_COMMUNICATION_SEARCH_PATH,
      communicationSearchPollPath: () => INDIVIDUAL_COMMUNICATION_SEARCH_POLL_PATH,
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );

  assert.equal(calls[0][0], INDIVIDUAL_COMMUNICATION_SEARCH_PATH);
  assert.equal(calls[0][1], INDIVIDUAL_COMMUNICATION_SEARCH_POLL_PATH);
  assert.deepEqual(
    calls[0][2].body,
    buildCommunicationParticipantSearchBundle({
      searchParams: input.searchParams,
      subject: input.subject,
      userActorId: input.userActorId,
      targetActorId: input.targetActorId,
    }),
  );
});

test('searchClinicalBundleWithDeps builds canonical bundle search query with filters', async () => {
  const calls = [];
  const input = cloneExample(EXAMPLE_CLINICAL_BUNDLE_SEARCH_INPUT);
  await searchClinicalBundleWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    input,
    {
      bundleSearchPath: () => INDIVIDUAL_BUNDLE_SEARCH_PATH,
      bundleSearchPollPath: () => INDIVIDUAL_BUNDLE_SEARCH_POLL_PATH,
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], INDIVIDUAL_BUNDLE_SEARCH_PATH);
  const requestUrl = calls[0][2].body.entry[0].request.url;
  assert.match(requestUrl, /Bundle\?type=document&/);
  assert.match(requestUrl, /composition.section=LOINC%7C60591-5%2CLOINC%7C48765-2/);
  assert.match(requestUrl, /start=2026-01-01/);
  assert.match(requestUrl, /end=2026-12-31/);
  assert.match(requestUrl, /code=LOINC%7C11450-4/);
  assert.match(requestUrl, new RegExp(`author=${encodeURIComponent(input.author)}`));
});

/**
 * Teaching goal:
 * Prove that application code submits exactly one semantic Communication and
 * never calls the internal Subject/$summary route as a second HTTP request.
 */
test('requestClinicalSummaryWithDeps keeps Subject/$summary inside Communication and returns a section reader', async () => {
  const calls = [];
  const summaryDocument = {
    resourceType: 'Bundle',
    type: 'document',
    entry: [{
      resource: {
        resourceType: 'Composition',
        section: [{
          code: { coding: [{ system: 'http://loinc.org', code: '48765-2' }] },
          entry: [{ reference: 'urn:uuid:allergy-summary-1' }],
        }],
      },
    }, {
      resource: {
        resourceType: 'AllergyIntolerance',
        id: 'allergy-summary-1',
        recordedDate: '2026-07-20T10:00:00Z',
      },
    }],
  };

  // Step 1. The BFF supplies actor/subject intent to the high-level operation.
  const result = await requestClinicalSummaryWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    {
      subjectId: EXAMPLE_SUBJECT_DID,
      requesterId: EXAMPLE_SUBJECT_DID,
      filterSections: ['LOINC|48765-2'],
    },
    {
      // Step 2. The runtime dependency receives one Communication outbox job;
      // it receives no direct summary endpoint or Bundle search path.
      submitSummaryCommunication: async (ctx, input) => {
        calls.push({ ctx, input });
        return {
          submit: { status: 202, body: { accepted: true } },
          poll: {
            status: 200,
            attempts: 1,
            body: {
              data: [{
                type: 'Bundle-summary-response-v1.0',
                resource: summaryDocument,
              }],
            },
          },
        };
      },
    },
  );

  // Step 3. The completed Communication result becomes the authoritative
  // document and both reader views without another GW request.
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input.clinicalFormat, 'api');
  assert.equal(calls[0].input.communicationJob.status, 'ready');
  assert.equal(result.bundle.type, 'document');
  assert.equal(result.reader.getDocumentSectionByCode('LOINC|48765-2')?.entryReferences[0], 'urn:uuid:allergy-summary-1');
  assert.equal(result.document.getResourceCount({
    sections: ['LOINC|48765-2'],
    types: ['AllergyIntolerance'],
    date: { start: '2026-07-01', end: '2026-07-31' },
  }), 1);
});

test('clinical update builders keep one-section and multi-section boundaries explicit', () => {
  // Step 1. A section update carries one batch/collection plus its exact
  // The section-scoped batch/collection uses the canonical Communication
  // topic claim. Composition.section remains inside document graphs.
  const mixedBatch = {
    resourceType: 'Bundle',
    type: 'batch',
    data: [
      {
        type: 'Observation-create-request-v1.0',
        request: { method: 'POST', url: 'Observation' },
        resource: { resourceType: 'Observation', id: 'vital-sign-1' },
      },
      {
        type: 'AllergyIntolerance-delete-request-v1.0',
        request: { method: 'DELETE', url: 'AllergyIntolerance/allergy-1' },
        resource: { resourceType: 'AllergyIntolerance', id: 'allergy-1' },
      },
    ],
  };
  const sectionUpdate = buildClinicalSectionUpdateIngestion({
    subject: EXAMPLE_SUBJECT_DID,
    sender: EXAMPLE_SUBJECT_DID,
    section: HealthcareBasicSections.VitalSigns.attributeValue,
    bundle: mixedBatch,
  });
  const sectionClaims = sectionUpdate.communicationJob.payload.body.data[0].resource.meta.claims;
  assert.equal(sectionClaims['Communication.topic'], HealthcareBasicSections.VitalSigns.attributeValue);
  assert.equal('Composition.section' in sectionClaims, false);
  const attachedMixedBatch = JSON.parse(Buffer.from(
    sectionClaims['Communication.content-attachment-data'],
    'base64',
  ).toString('utf8'));
  assert.deepEqual(attachedMixedBatch, mixedBatch);
  assert.equal(attachedMixedBatch.type, 'batch');
  assert.deepEqual(attachedMixedBatch.data.map((entry) => entry.request.method), ['POST', 'DELETE']);

  // Step 2. A summary update accepts only a Composition-first document.
  const summaryUpdate = buildClinicalSummaryUpdateIngestion({
    subject: EXAMPLE_SUBJECT_DID,
    sender: EXAMPLE_SUBJECT_DID,
    bundle: {
      resourceType: 'Bundle',
      type: 'document',
      entry: [{ resource: { resourceType: 'Composition', status: 'final' } }],
    },
  });
  assert.equal(summaryUpdate.communicationJob.status, 'ready');

  assert.throws(
    () => buildClinicalSummaryUpdateIngestion({
      subject: EXAMPLE_SUBJECT_DID,
      bundle: { resourceType: 'Bundle', type: 'batch', data: [] },
    }),
    /Bundle\.type=document/i,
  );
});

test('requestClinicalSummaryWithDeps rejects a completed response without a document Bundle', async () => {
  await assert.rejects(
    requestClinicalSummaryWithDeps(
      cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
      {
        subjectId: EXAMPLE_SUBJECT_DID,
        requesterId: EXAMPLE_SUBJECT_DID,
      },
      {
        submitSummaryCommunication: async () => ({
          submit: { status: 202, body: { accepted: true } },
          poll: { status: 200, attempts: 1, body: { data: [] } },
        }),
      },
    ),
    /did not return a FHIR document Bundle/,
  );
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

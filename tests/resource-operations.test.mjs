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
  EXAMPLE_TENANT_ROUTE_CONTEXT,
  cloneExample,
} from 'gdc-common-utils-ts/examples';
import {
  buildCommunicationParticipantSearchBundle,
  buildExampleCommunicationParticipantSearchInput,
  buildFhirParametersResourceFromSearchParams,
  ClaimsOrganizationSchemaorg,
  ClaimsPersonSchemaorg,
  EmployeeBatchEntryTypes,
  EmployeeBundleMethods,
  EmployeeBundleRoutes,
  IndividualOrganizationLifecycleEditor,
  InteroperableLifecycleStatuses,
} from 'gdc-common-utils-ts';
import { RelatedPersonClaim } from 'gdc-common-utils-ts/models/interoperable-claims/related-person-claims';
import { ClaimConsent } from 'gdc-common-utils-ts/models/consent-rule';

import {
  EmployeeDraft,
  createOrganizationEmployeeWithDeps,
  disableIndividualMemberWithDeps,
  disableIndividualOrganizationWithDeps,
  listIndividualLicenseOffersWithDeps,
  listIndividualLicenseOrdersWithDeps,
  disableOrganizationEmployeeWithDeps,
  generateDigitalTwinFromSubjectDataWithDeps,
  grantProfessionalAccessWithDeps,
  importIpsOrFhirAndUpdateIndexWithDeps,
  ingestCommunicationAndUpdateIndexWithDeps,
  listIndividualLicensesWithDeps,
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
  searchCommunicationParticipantsWithDeps,
  searchLatestIpsWithDeps,
  revokeProfessionalAccessWithDeps,
  upsertRelatedPersonAndPollWithDeps,
  GwCoreLifecycleRequestMethod,
  GwCoreLifecycleRequestType,
} from '../dist/index.js';

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
      employeeBatchPath: () => '/employee/_batch',
      employeePollPath: () => '/employee/_batch-response',
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], '/employee/_batch');
  assert.equal(
    calls[0][2].body.data[0].resource.meta.claims[ClaimsPersonSchemaorg.email],
    employeeClaims[ClaimsPersonSchemaorg.email],
  );
  assert.equal(
    calls[0][2].body.data[0].resource.meta.claims[ClaimsPersonSchemaorg.hasOccupationalRoleValue],
    employeeClaims[ClaimsPersonSchemaorg.hasOccupationalRoleValue],
  );
  assert.equal(calls[0][2].body.data[0].resource.resourceType, 'Employee');
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
      organizationLicenseSearchPath: () => '/license/_search',
      organizationLicenseSearchPollPath: () => '/license/_search-response',
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], '/license/_search');
  assert.equal(calls[0][1], '/license/_search-response');
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
      organizationLicenseSearchPath: () => '/license/_search',
      organizationLicenseSearchPollPath: () => '/license/_search-response',
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], '/license/_search');
  assert.equal(calls[0][2].body.entry[0].type, 'License-search-request-v1.0');
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
  assert.equal(calls[0][2].body.data[0].request.method, GwCoreLifecycleRequestMethod.Delete);
  assert.equal(calls[0][2].body.data[0].type, EmployeeBatchEntryTypes.disable);
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
  assert.equal(calls[0][2].body.data[0].request.method, EmployeeBundleMethods.purge);
  assert.equal(calls[0][2].body.data[0].type, EmployeeBatchEntryTypes.purge);
});

test('disableIndividualOrganizationWithDeps uses the explicit current disable route', async () => {
  const calls = [];
  const organizationEditor = new IndividualOrganizationLifecycleEditor()
    .setIdentifier(String(EXAMPLE_INDIVIDUAL_DISABLE_MESSAGE.claims[ClaimsOrganizationSchemaorg.identifier]))
    .setAlternateName(String(EXAMPLE_INDIVIDUAL_DISABLE_MESSAGE.claims[ClaimsOrganizationSchemaorg.alternateName]))
    .setOwnerEmail(String(EXAMPLE_INDIVIDUAL_DISABLE_MESSAGE.claims[ClaimsOrganizationSchemaorg.ownerEmail]));
  await disableIndividualOrganizationWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    {
      organizationEditor,
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
  const organizationEditor = new IndividualOrganizationLifecycleEditor()
    .setIdentifier(String(EXAMPLE_INDIVIDUAL_DISABLE_MESSAGE.claims[ClaimsOrganizationSchemaorg.identifier]))
    .setAlternateName(String(EXAMPLE_INDIVIDUAL_DISABLE_MESSAGE.claims[ClaimsOrganizationSchemaorg.alternateName]))
    .setOwnerEmail(String(EXAMPLE_INDIVIDUAL_DISABLE_MESSAGE.claims[ClaimsOrganizationSchemaorg.ownerEmail]));
  await purgeIndividualOrganizationWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    {
      organizationEditor,
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
  assert.deepEqual(calls[0][2].body.data[0], cloneExample(EXAMPLE_INDIVIDUAL_ORGANIZATION_PURGE_ENTRY));
  assert.equal(calls[0][2].body.data[0].request.method, GwCoreLifecycleRequestMethod.Post);
  assert.equal(calls[0][2].body.data[0].type, GwCoreLifecycleRequestType.IndividualOrganizationPurge);
});

test('searchIndividualLicensesWithDeps builds canonical License bundle search payload for the subject side', async () => {
  const calls = [];
  await searchIndividualLicensesWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    {
      licenseQuery: {
        subjectId: EXAMPLE_LICENSE_ACTIVE_RECORD.subjectId,
      },
    },
    {
      individualLicenseSearchPath: () => '/individual/license/_search',
      individualLicenseSearchPollPath: () => '/individual/license/_search-response',
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], '/individual/license/_search');
  assert.equal(calls[0][1], '/individual/license/_search-response');
  assert.equal(calls[0][2].body.entry[0].meta.subjectId, EXAMPLE_LICENSE_ACTIVE_RECORD.subjectId);
});

test('listIndividualLicensesWithDeps reuses search route without mandatory filters', async () => {
  const calls = [];
  await listIndividualLicensesWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    undefined,
    {
      individualLicenseSearchPath: () => '/individual/license/_search',
      individualLicenseSearchPollPath: () => '/individual/license/_search-response',
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], '/individual/license/_search');
  assert.equal(calls[0][2].body.entry[0].type, 'License-search-request-v1.0');
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
      organizationLicenseOfferSearchPath: () => '/offer/_search',
      organizationLicenseOfferSearchPollPath: () => '/offer/_search-response',
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], '/offer/_search');
  assert.equal(calls[0][1], '/offer/_search-response');
  assert.equal(calls[0][2].body.data[0].type, 'Offer-search-request-v1.0');
});

test('listOrganizationLicenseOffersWithDeps reuses search route without mandatory filters', async () => {
  const calls = [];
  await listOrganizationLicenseOffersWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    undefined,
    {
      organizationLicenseOfferSearchPath: () => '/offer/_search',
      organizationLicenseOfferSearchPollPath: () => '/offer/_search-response',
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
      organizationLicenseOrderSearchPath: () => '/order/_search',
      organizationLicenseOrderSearchPollPath: () => '/order/_search-response',
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], '/order/_search');
  assert.equal(calls[0][1], '/order/_search-response');
  assert.equal(calls[0][2].body.data[0].type, 'Order-search-request-v1.0');
});

test('listOrganizationLicenseOrdersWithDeps reuses search route without mandatory filters', async () => {
  const calls = [];
  await listOrganizationLicenseOrdersWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    undefined,
    {
      organizationLicenseOrderSearchPath: () => '/order/_search',
      organizationLicenseOrderSearchPollPath: () => '/order/_search-response',
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
      individualLicenseOfferSearchPath: () => '/individual/offer/_search',
      individualLicenseOfferSearchPollPath: () => '/individual/offer/_search-response',
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], '/individual/offer/_search');
  assert.equal(calls[0][1], '/individual/offer/_search-response');
  assert.equal(calls[0][2].body.data[0].type, 'Offer-search-request-v1.0');
});

test('listIndividualLicenseOffersWithDeps reuses search route without mandatory filters', async () => {
  const calls = [];
  await listIndividualLicenseOffersWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    undefined,
    {
      individualLicenseOfferSearchPath: () => '/individual/offer/_search',
      individualLicenseOfferSearchPollPath: () => '/individual/offer/_search-response',
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
      individualLicenseOrderSearchPath: () => '/individual/order/_search',
      individualLicenseOrderSearchPollPath: () => '/individual/order/_search-response',
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], '/individual/order/_search');
  assert.equal(calls[0][1], '/individual/order/_search-response');
  assert.equal(calls[0][2].body.data[0].type, 'Order-search-request-v1.0');
});

test('listIndividualLicenseOrdersWithDeps reuses search route without mandatory filters', async () => {
  const calls = [];
  await listIndividualLicenseOrdersWithDeps(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    undefined,
    {
      individualLicenseOrderSearchPath: () => '/individual/order/_search',
      individualLicenseOrderSearchPollPath: () => '/individual/order/_search-response',
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
      individualRelatedPersonBatchPath: () => '/related-person/batch',
      individualRelatedPersonPollPath: () => '/related-person/batch-response',
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );

  assert.equal(calls[0][0], '/related-person/batch');
  assert.equal(calls[0][1], '/related-person/batch-response');
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
      individualRelatedPersonPurgePath: () => '/related-person/_purge',
      individualRelatedPersonPurgePollPath: () => '/related-person/_purge-response',
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );

  assert.equal(calls[0][0], '/related-person/_purge');
  assert.equal(calls[0][1], '/related-person/_purge-response');
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
    { relatedPersonPayload: cloneExample(EXAMPLE_RELATED_PERSON_UPSERT_BUNDLE_PAYLOAD) },
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
  assert.deepEqual(calls[0][2], cloneExample(EXAMPLE_RELATED_PERSON_UPSERT_BUNDLE_PAYLOAD));
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
      individualConsentR4BatchPath: () => '/consent/_batch',
      individualConsentR4PollPath: () => '/consent/_batch-response',
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );
  assert.equal(calls[0][0], '/consent/_batch');
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
      communicationSearchPath: () => '/communication/_search',
      communicationSearchPollPath: () => '/communication/_search-response',
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
      },
    },
  );

  assert.equal(calls[0][0], '/communication/_search');
  assert.equal(calls[0][1], '/communication/_search-response');
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

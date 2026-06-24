import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXAMPLE_LICENSE_ACTIVE_RECORD,
  EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE,
  EXAMPLE_RELATED_PERSON_DISABLE_BUNDLE_ENTRY,
  EXAMPLE_RELATED_PERSON_DISABLE_INPUT,
  EXAMPLE_RELATED_PERSON_IDENTIFIER,
  EXAMPLE_RELATED_PERSON_PURGE_BUNDLE_ENTRY,
  EXAMPLE_HOST_ROUTE_CONTEXT,
  EXAMPLE_ORGANIZATION_DID_BINDING_BUNDLE,
  EXAMPLE_TENANT_ROUTE_CONTEXT,
  cloneExample,
} from 'gdc-common-utils-ts/examples';
import {
  buildCommunicationParticipantSearchBundle,
  buildExampleCommunicationParticipantSearchInput,
  InteroperableLifecycleStatuses,
} from 'gdc-common-utils-ts';
import { RelatedPersonClaim } from 'gdc-common-utils-ts/models/interoperable-claims/related-person-claims';

import { NodeHttpClient } from '../dist/index.js';

test('NodeHttpClient resolves app identity and defaults appVersion to v1.0', () => {
  const client = new NodeHttpClient({
    baseUrl: 'https://gw.example.org',
    appInfo: {
      appId: 'https://globaldatacare.es/backend',
      appType: 'Organization',
      sector: 'health-care',
    },
  });

  assert.deepEqual(client.getResolvedAppInfo(), {
    appId: 'es.globaldatacare',
    appVersion: 'v1.0',
    appType: 'Organization',
    sector: 'health-care',
  });

  assert.deepEqual(client.getAppHeaders(), {
    AppId: 'es.globaldatacare',
    AppVersion: 'v1.0',
  });
});

test('NodeHttpClient injects AppId and AppVersion headers in outgoing GW requests', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (url, init) => {
    requests.push([url, init]);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const client = new NodeHttpClient({
      baseUrl: 'https://gw.example.org',
      appInfo: {
        appId: 'portal.globaldatacare.es',
        appVersion: 'v2.0.0',
        appType: 'Organization',
        sector: 'health-care',
      },
    });

    await client.submitBatch('/test', { thid: 'thid-1', body: {} });

    assert.equal(requests.length, 1);
    assert.equal(requests[0][0], 'https://gw.example.org/test');
    assert.deepEqual(requests[0][1].headers, {
      AppId: 'es.globaldatacare.portal',
      AppVersion: 'v2.0.0',
      'Content-Type': 'application/didcomm-plain+json',
      Accept: 'application/json, application/didcomm-plain+json, */*',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('NodeHttpClient can reuse runtimeVpToken as the default Authorization Bearer header', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (url, init) => {
    requests.push([url, init]);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const client = new NodeHttpClient({
      baseUrl: 'https://gw.example.org',
      runtimeVpToken: 'vp-token-software-runtime-001',
    });

    assert.equal(client.getRuntimeVpToken(), 'vp-token-software-runtime-001');

    await client.submitBatch('/test', { thid: 'thid-runtime-vp-1', body: {} });

    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0][1].headers, {
      'Content-Type': 'application/didcomm-plain+json',
      Accept: 'application/json, application/didcomm-plain+json, */*',
      Authorization: 'Bearer vp-token-software-runtime-001',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('NodeHttpClient exposes current GW CORE lifecycle paths for individual and employee flows', () => {
  const client = new NodeHttpClient({
    baseUrl: 'https://gw.example.org',
    ctx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
  });

  assert.equal(
    client.hostRegistryOrganizationTransactionPath(cloneExample(EXAMPLE_HOST_ROUTE_CONTEXT)),
    '/host/cds-ES/v1/test/registry/org.schema/Organization/_transaction',
  );
  assert.equal(
    client.hostRegistryOrganizationTransactionPollPath(cloneExample(EXAMPLE_HOST_ROUTE_CONTEXT)),
    '/host/cds-ES/v1/test/registry/org.schema/Organization/_transaction-response',
  );
  assert.equal(
    client.hostRegistryOrganizationIssuePath(cloneExample(EXAMPLE_HOST_ROUTE_CONTEXT)),
    '/host/cds-ES/v1/test/registry/org.schema/Organization/_issue',
  );
  assert.equal(
    client.hostRegistryOrganizationIssuePollPath(cloneExample(EXAMPLE_HOST_ROUTE_CONTEXT)),
    '/host/cds-ES/v1/test/registry/org.schema/Organization/_issue-response',
  );
  assert.equal(
    client.individualFamilyOrganizationTransactionPath(),
    '/acme-id/cds-ES/v1/health-care/individual/org.schema/Organization/_transaction',
  );
  assert.equal(
    client.individualFamilyOrganizationDisablePath(),
    '/acme-id/cds-ES/v1/health-care/individual/org.schema/Organization/_disable',
  );
  assert.equal(
    client.individualFamilyOrganizationPurgePollPath(),
    '/acme-id/cds-ES/v1/health-care/individual/org.schema/Organization/_purge-response',
  );
  assert.equal(
    client.employeePurgePath(),
    '/acme-id/cds-ES/v1/health-care/entity/org.schema/Employee/_purge',
  );
  assert.equal(
    client.organizationLicenseSearchPath(),
    '/acme-id/cds-ES/v1/health-care/entity/org.schema/License/_search',
  );
  assert.equal(
    client.organizationDidBindingPath(),
    '/acme-id/cds-ES/v1/health-care/did/document/_binding',
  );
  assert.equal(
    client.organizationDidBindingPollPath(),
    '/acme-id/cds-ES/v1/health-care/did/document/_binding-response',
  );
  assert.equal(
    client.identityTokenExchangePath(cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT)),
    '/host/cds-ES/v1/health-care/acme-id/identity/auth/_exchange',
  );
  assert.equal(
    client.identityTokenExchangePollPath(cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT)),
    '/host/cds-ES/v1/health-care/acme-id/identity/auth/_exchange-response',
  );
  assert.equal(
    client.identityDeviceDcrPath(cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT)),
    '/host/cds-ES/v1/health-care/acme-id/identity/auth/_dcr',
  );
  assert.equal(
    client.identityDeviceDcrPollPath(cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT)),
    '/host/cds-ES/v1/health-care/acme-id/identity/auth/_dcr-response',
  );
  assert.equal(
    client.individualLicenseSearchPath(),
    '/acme-id/cds-ES/v1/health-care/individual/org.schema/License/_search',
  );
  assert.equal(
    client.individualCommunicationSearchPath(),
    '/acme-id/cds-ES/v1/health-care/individual/org.hl7.fhir.r4/Communication/_search',
  );
});

test('NodeHttpClient searches organization-owned license seats through License/_search', async () => {
  const client = new NodeHttpClient({
    baseUrl: 'https://gw.example.org',
    ctx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
  });

  const calls = [];
  client.submitAndPoll = async (...args) => {
    calls.push(args);
    return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
  };

  await client.searchOrganizationLicenses(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    { licenseQuery: { serialNumbers: [EXAMPLE_LICENSE_ACTIVE_RECORD.id] } },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/acme-id/cds-ES/v1/health-care/entity/org.schema/License/_search');
  assert.equal(calls[0][1], '/acme-id/cds-ES/v1/health-care/entity/org.schema/License/_search-response');
  assert.equal(calls[0][2].body.entry[0].type, 'License-search-request-v1.0');
});

test('NodeHttpClient submits the host legal-organization verification transaction through Organization/_transaction and polls _transaction-response', async () => {
  const client = new NodeHttpClient({
    baseUrl: 'https://gw.example.org',
  });

  const calls = [];
  client.submitAndPoll = async (...args) => {
    calls.push(args);
    return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
  };
  client.hostRegistryOrganizationTransactionPath = () => '/host/transaction';
  client.hostRegistryOrganizationTransactionPollPath = () => '/host/transaction-response';

  await client.submitLegalOrganizationVerificationTransaction(
    cloneExample(EXAMPLE_HOST_ROUTE_CONTEXT),
    {
      claims: cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.data[0].meta.claims),
      controller: cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.data[0].resource.controller),
      organization: cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.data[0].resource.organization),
      legalRepresentativePayload: cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.data[0].resource.legalRepresentativePayload),
      verification: cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.data[0].resource.verification),
      attachments: cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.attachments),
    },
    { timeoutMs: 20_000, intervalMs: 1_000 },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/host/transaction');
  assert.equal(calls[0][1], '/host/transaction-response');
  assert.equal(calls[0][2].type, 'application/api+json');
  assert.equal(calls[0][2].body.type, 'collection');
  assert.equal(calls[0][2].body.data[0].type, 'Organization-verification-transaction-request-v1.0');
  assert.equal(
    calls[0][2].body.data[0].resource.controller.publicKeyJwk.kid,
    EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.data[0].resource.controller.publicKeyJwk.kid,
  );
  assert.equal(
    calls[0][2].attachments[0].data.links[0],
    EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.attachments[0].data.links[0],
  );
  assert.equal(typeof calls[0][2].body.attachments, 'undefined');
  assert.deepEqual(calls[0][3], { timeoutMs: 20_000, intervalMs: 1_000 });
});

test('NodeHttpClient submits the host legal-organization reissue flow through Organization/_issue and polls _issue-response', async () => {
  const client = new NodeHttpClient({
    baseUrl: 'https://gw.example.org',
  });

  const calls = [];
  client.submitAndPoll = async (...args) => {
    calls.push(args);
    return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
  };
  client.hostRegistryOrganizationIssuePath = () => '/host/issue';
  client.hostRegistryOrganizationIssuePollPath = () => '/host/issue-response';

  await client.submitLegalOrganizationIssue(
    cloneExample(EXAMPLE_HOST_ROUTE_CONTEXT),
    {
      claims: cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.data[0].meta.claims),
      controller: cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.data[0].resource.controller),
      organization: cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.data[0].resource.organization),
      legalRepresentativePayload: cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.data[0].resource.legalRepresentativePayload),
      verification: cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.data[0].resource.verification),
      attachments: cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.attachments),
    },
    { timeoutMs: 10_000, intervalMs: 500 },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/host/issue');
  assert.equal(calls[0][1], '/host/issue-response');
  assert.equal(calls[0][2].type, 'application/api+json');
  assert.equal(calls[0][2].body.type, 'collection');
  assert.equal(calls[0][2].body.data[0].type, 'Organization-verification-transaction-request-v1.0');
  assert.equal(
    calls[0][2].body.data[0].resource.controller.publicKeyJwk.kid,
    EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.data[0].resource.controller.publicKeyJwk.kid,
  );
  assert.deepEqual(calls[0][3], { timeoutMs: 10_000, intervalMs: 500 });
});

test('NodeHttpClient submits the organization DID binding operation through did/document/_binding and polls _binding-response', async () => {
  const client = new NodeHttpClient({
    baseUrl: 'https://gw.example.org',
    ctx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
  });

  const calls = [];
  client.submitAndPoll = async (...args) => {
    calls.push(args);
    return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
  };

  await client.submitOrganizationDidBinding(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    cloneExample(EXAMPLE_ORGANIZATION_DID_BINDING_BUNDLE.data[0].resource),
    { timeoutMs: 30_000, intervalMs: 2_000 },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/acme-id/cds-ES/v1/health-care/did/document/_binding');
  assert.equal(calls[0][1], '/acme-id/cds-ES/v1/health-care/did/document/_binding-response');
  assert.equal(calls[0][2].type, 'application/api+json');
  assert.equal(calls[0][2].body.type, 'collection');
  assert.equal(calls[0][2].body.data[0].type, 'Organization-did-binding-request-v1.0');
  assert.deepEqual(
    calls[0][2].body.data[0].resource,
    EXAMPLE_ORGANIZATION_DID_BINDING_BUNDLE.data[0].resource,
  );
  assert.deepEqual(calls[0][3], { timeoutMs: 30_000, intervalMs: 2_000 });
});

test('NodeHttpClient searches organization-owned commercial offers through Offer/_search', async () => {
  const client = new NodeHttpClient({
    baseUrl: 'https://gw.example.org',
    ctx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
  });

  const calls = [];
  client.submitAndPoll = async (...args) => {
    calls.push(args);
    return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
  };

  await client.searchOrganizationLicenseOffers(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    { offerQuery: { offerIds: [EXAMPLE_LICENSE_ACTIVE_RECORD.offerId] } },
  );

  assert.equal(calls[0][0], '/acme-id/cds-ES/v1/health-care/entity/org.schema/Offer/_search');
  assert.equal(calls[0][1], '/acme-id/cds-ES/v1/health-care/entity/org.schema/Offer/_search-response');
  assert.equal(calls[0][2].body.data[0].type, 'Offer-search-request-v1.0');
});

test('NodeHttpClient searches organization-owned commercial orders through Order/_search', async () => {
  const client = new NodeHttpClient({
    baseUrl: 'https://gw.example.org',
    ctx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
  });

  const calls = [];
  client.submitAndPoll = async (...args) => {
    calls.push(args);
    return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
  };

  await client.searchOrganizationLicenseOrders(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    { orderQuery: { acceptedOfferIds: [EXAMPLE_LICENSE_ACTIVE_RECORD.offerId] } },
  );

  assert.equal(calls[0][0], '/acme-id/cds-ES/v1/health-care/entity/org.schema/Order/_search');
  assert.equal(calls[0][1], '/acme-id/cds-ES/v1/health-care/entity/org.schema/Order/_search-response');
  assert.equal(calls[0][2].body.data[0].type, 'Order-search-request-v1.0');
});

test('NodeHttpClient confirms organization-side extra license activation through host Order/_batch', async () => {
  const client = new NodeHttpClient({
    baseUrl: 'https://gw.example.org',
    ctx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
  });

  const calls = [];
  client.submitAndPoll = async (...args) => {
    calls.push(args);
    return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
  };

  await client.confirmOrganizationLicenseOrder(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    {
      offerId: EXAMPLE_LICENSE_ACTIVE_RECORD.offerId || 'urn:cds:offer:test',
      hostNetwork: 'test',
      additionalClaims: { 'Order.paymentMethod': 'invoice' },
    },
  );

  assert.equal(calls[0][0], '/host/cds-ES/v1/test/registry/org.schema/Order/_batch');
  assert.equal(calls[0][1], '/host/cds-ES/v1/test/registry/org.schema/Order/_batch-response');
  assert.equal(calls[0][2].body.data[0].meta.claims['Order.paymentMethod'], 'invoice');
});

test('NodeHttpClient searches subject-side commercial offers and orders through Offer/_search and Order/_search', async () => {
  const client = new NodeHttpClient({
    baseUrl: 'https://gw.example.org',
    ctx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
  });

  const calls = [];
  client.submitAndPoll = async (...args) => {
    calls.push(args);
    return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
  };

  await client.searchIndividualLicenseOffers(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    { offerQuery: { subjectIds: [EXAMPLE_LICENSE_ACTIVE_RECORD.subjectId] } },
  );
  await client.searchIndividualLicenseOrders(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    { orderQuery: { subjectIds: [EXAMPLE_LICENSE_ACTIVE_RECORD.subjectId] } },
  );

  assert.equal(calls[0][0], '/acme-id/cds-ES/v1/health-care/individual/org.schema/Offer/_search');
  assert.equal(calls[0][2].body.data[0].type, 'Offer-search-request-v1.0');
  assert.equal(calls[1][0], '/acme-id/cds-ES/v1/health-care/individual/org.schema/Order/_search');
  assert.equal(calls[1][2].body.data[0].type, 'Order-search-request-v1.0');
});

test('NodeHttpClient searches communication participants through Communication/_search', async () => {
  const client = new NodeHttpClient({
    baseUrl: 'https://gw.example.org',
    ctx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
  });

  const calls = [];
  client.submitAndPoll = async (...args) => {
    calls.push(args);
    return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
  };

  const input = buildExampleCommunicationParticipantSearchInput();
  await client.searchCommunicationParticipants(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    {
      searchParams: input.searchParams,
      subject: input.subject,
      userActorId: input.userActorId,
      targetActorId: input.targetActorId,
    },
  );

  assert.equal(calls[0][0], '/acme-id/cds-ES/v1/health-care/individual/org.hl7.fhir.r4/Communication/_search');
  assert.equal(calls[0][1], '/acme-id/cds-ES/v1/health-care/individual/org.hl7.fhir.r4/Communication/_search-response');
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

test('NodeHttpClient disables individual-member relationships through identifier-first RelatedPerson lifecycle resources', async () => {
  const client = new NodeHttpClient({
    baseUrl: 'https://gw.example.org',
    ctx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
  });

  const calls = [];
  client.submitAndPoll = async (...args) => {
    calls.push(args);
    return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
  };

  await client.disableIndividualMember(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    cloneExample(EXAMPLE_RELATED_PERSON_DISABLE_INPUT),
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/acme-id/cds-ES/v1/health-care/individual/org.hl7.fhir.r4/RelatedPerson/_batch');
  assert.equal(calls[0][1], '/acme-id/cds-ES/v1/health-care/individual/org.hl7.fhir.r4/RelatedPerson/_batch-response');
  assert.deepEqual(calls[0][2].body.entry[0], cloneExample(EXAMPLE_RELATED_PERSON_DISABLE_BUNDLE_ENTRY));
  assert.equal(calls[0][2].body.entry[0].resource.identifier[0].value, EXAMPLE_RELATED_PERSON_IDENTIFIER);
  assert.equal(calls[0][2].body.entry[0].resource.meta.status, InteroperableLifecycleStatuses.Inactive);
  assert.equal(calls[0][2].body.entry[0].meta.claims[RelatedPersonClaim.Active], undefined);
  assert.equal(calls[0][2].body.entry[0].resource.id, EXAMPLE_RELATED_PERSON_DISABLE_INPUT.resourceId);
});

test('NodeHttpClient purges individual-member relationships through explicit RelatedPerson purge paths', async () => {
  const client = new NodeHttpClient({
    baseUrl: 'https://gw.example.org',
    ctx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
  });

  const calls = [];
  client.submitAndPoll = async (...args) => {
    calls.push(args);
    return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
  };

  await client.purgeIndividualMember(
    cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    cloneExample(EXAMPLE_RELATED_PERSON_DISABLE_INPUT),
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/acme-id/cds-ES/v1/health-care/individual/org.hl7.fhir.r4/RelatedPerson/_purge');
  assert.equal(calls[0][1], '/acme-id/cds-ES/v1/health-care/individual/org.hl7.fhir.r4/RelatedPerson/_purge-response');
  assert.deepEqual(calls[0][2].body.entry[0], cloneExample(EXAMPLE_RELATED_PERSON_PURGE_BUNDLE_ENTRY));
  assert.equal(calls[0][2].body.entry[0].resource.identifier[0].value, EXAMPLE_RELATED_PERSON_IDENTIFIER);
  assert.equal(calls[0][2].body.entry[0].resource.meta.status, InteroperableLifecycleStatuses.Purged);
});

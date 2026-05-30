import assert from 'node:assert/strict';
import test from 'node:test';
import { DataspaceCoverageScope, DataspaceSectors, ServiceCapabilityToken } from 'gdc-common-utils-ts';
import {
  EXAMPLE_COVERAGE_SCOPE_EU,
  EXAMPLE_HOSTING_OPERATOR_CATALOG_URL,
  EXAMPLE_HOSTING_OPERATOR_DID,
  EXAMPLE_JURISDICTION,
  EXAMPLE_PROVIDER_PUBLISHED_ENDPOINT_URL,
  EXAMPLE_SECONDARY_TENANT_SERVICE_DID,
  EXAMPLE_TENANT_SERVICE_DID,
} from 'gdc-common-utils-ts/examples/shared';
import { HttpDataspaceResolver } from '../dist/index.js';

const EXAMPLE_OPERATOR_A_DID = EXAMPLE_HOSTING_OPERATOR_DID;
const EXAMPLE_OPERATOR_B_DID = 'did:web:host-b.example.org';
const EXAMPLE_OPERATOR_A_CATALOG_URL = EXAMPLE_HOSTING_OPERATOR_CATALOG_URL;
const EXAMPLE_OPERATOR_B_CATALOG_URL = 'https://host-b.example.org/.well-known/dcat3/catalog';

function buildHostingOperatorRecord({
  operatorDid,
  catalogUrl,
  serviceTypes,
  categories,
  areaServed,
  addressCountry,
  coverageScope,
}) {
  return {
    operatorDid,
    catalogUrl,
    record: {
      subjectId: operatorDid,
      serviceTypes,
      categories,
      areaServed,
      addressCountry,
      coverageScope,
    },
  };
}

function createJsonResponse(payload, init = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

function createFetchMock(routes) {
  const calls = [];
  const fetcher = async (url) => {
    const key = String(url);
    calls.push(key);
    const response = routes[key];
    if (!response) {
      return createJsonResponse({ error: 'not found' }, { ok: false, status: 404 });
    }
    return response;
  };
  return { calls, fetcher };
}

test('HttpDataspaceResolver resolves hosting operators from preloaded semantic records', async () => {
  const resolver = new HttpDataspaceResolver({
    hostingOperators: [
      buildHostingOperatorRecord({
        operatorDid: EXAMPLE_OPERATOR_A_DID,
        catalogUrl: EXAMPLE_OPERATOR_A_CATALOG_URL,
        serviceTypes: [ServiceCapabilityToken.IndexProvider],
        categories: [DataspaceSectors.AnimalCare],
        areaServed: [EXAMPLE_COVERAGE_SCOPE_EU, EXAMPLE_JURISDICTION],
        addressCountry: EXAMPLE_JURISDICTION,
        coverageScope: EXAMPLE_COVERAGE_SCOPE_EU,
      }),
      buildHostingOperatorRecord({
        operatorDid: EXAMPLE_OPERATOR_B_DID,
        catalogUrl: EXAMPLE_OPERATOR_B_CATALOG_URL,
        serviceTypes: [ServiceCapabilityToken.IndexReader],
        categories: [DataspaceSectors.AnimalCare],
        areaServed: [EXAMPLE_JURISDICTION],
        addressCountry: EXAMPLE_JURISDICTION,
      }),
    ],
  });

  const results = await resolver.resolveHostingOperators({
    sector: DataspaceSectors.AnimalCare,
    requiredCapabilities: [ServiceCapabilityToken.IndexProvider],
    jurisdiction: EXAMPLE_JURISDICTION,
    coverageScope: EXAMPLE_COVERAGE_SCOPE_EU,
  });

  assert.equal(results.length, 1);
  assert.equal(results[0]?.operatorDid, EXAMPLE_OPERATOR_A_DID);
  assert.deepEqual(results[0]?.matchedCapabilities, [ServiceCapabilityToken.IndexProvider]);
  assert.equal(results[0]?.catalogUrl, EXAMPLE_OPERATOR_A_CATALOG_URL);
});

test('HttpDataspaceResolver fetches host public catalogs and filters published providers', async () => {
  const { calls, fetcher } = createFetchMock({
    [EXAMPLE_OPERATOR_A_CATALOG_URL]: createJsonResponse({
      hostingOperatorDid: EXAMPLE_OPERATOR_A_DID,
      catalogUrl: EXAMPLE_OPERATOR_A_CATALOG_URL,
      providers: [
        {
          providerDid: EXAMPLE_TENANT_SERVICE_DID,
          serviceType: ServiceCapabilityToken.IndexProvider,
          category: DataspaceSectors.AnimalCare,
          areaServed: `${EXAMPLE_COVERAGE_SCOPE_EU},${EXAMPLE_JURISDICTION}`,
          endpointUrl: EXAMPLE_PROVIDER_PUBLISHED_ENDPOINT_URL,
          catalogUrl: 'https://provider.example.org/.well-known/dcat3/catalog',
        },
        {
          providerDid: EXAMPLE_SECONDARY_TENANT_SERVICE_DID,
          serviceType: ServiceCapabilityToken.IndexReader,
          category: DataspaceSectors.AnimalCare,
          areaServed: `${EXAMPLE_COVERAGE_SCOPE_EU},${EXAMPLE_JURISDICTION}`,
          endpointUrl: 'https://provider-reader.example.org/service',
        },
        {
          providerDid: 'did:web:provider-wrong.example.org',
          serviceType: ServiceCapabilityToken.IndexProvider,
          category: DataspaceSectors.HealthCare,
          areaServed: EXAMPLE_COVERAGE_SCOPE_EU,
          endpointUrl: 'https://provider-wrong.example.org/service',
        },
      ],
    }),
    [EXAMPLE_OPERATOR_B_CATALOG_URL]: createJsonResponse({
      hostingOperatorDid: EXAMPLE_OPERATOR_B_DID,
      catalogUrl: EXAMPLE_OPERATOR_B_CATALOG_URL,
      providers: [
        {
          providerDid: 'did:web:provider-b.example.org',
          serviceType: ServiceCapabilityToken.IndexProvider,
          category: DataspaceSectors.AnimalCare,
          areaServed: 'US',
          endpointUrl: 'https://provider-b.example.org/service',
        },
      ],
    }),
  });

  const resolver = new HttpDataspaceResolver({
    fetcher,
    hostingOperators: [
      buildHostingOperatorRecord({
        operatorDid: EXAMPLE_OPERATOR_A_DID,
        catalogUrl: EXAMPLE_OPERATOR_A_CATALOG_URL,
        serviceTypes: [ServiceCapabilityToken.IndexProvider, ServiceCapabilityToken.DigitalTwinProvider],
        categories: [DataspaceSectors.AnimalCare],
        areaServed: [EXAMPLE_COVERAGE_SCOPE_EU, EXAMPLE_JURISDICTION],
        addressCountry: EXAMPLE_JURISDICTION,
        coverageScope: EXAMPLE_COVERAGE_SCOPE_EU,
      }),
      buildHostingOperatorRecord({
        operatorDid: EXAMPLE_OPERATOR_B_DID,
        catalogUrl: EXAMPLE_OPERATOR_B_CATALOG_URL,
        serviceTypes: [ServiceCapabilityToken.IndexProvider],
        categories: [DataspaceSectors.AnimalCare],
        areaServed: [EXAMPLE_COVERAGE_SCOPE_EU, EXAMPLE_JURISDICTION],
        addressCountry: EXAMPLE_JURISDICTION,
        coverageScope: EXAMPLE_COVERAGE_SCOPE_EU,
      }),
    ],
  });

  const results = await resolver.resolvePublishedProviders({
    sector: DataspaceSectors.AnimalCare,
    providerCapability: ServiceCapabilityToken.IndexProvider,
    jurisdiction: EXAMPLE_JURISDICTION,
    coverageScope: EXAMPLE_COVERAGE_SCOPE_EU,
  });

  assert.equal(calls.length, 2);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.providerDid, EXAMPLE_TENANT_SERVICE_DID);
  assert.equal(results[0]?.hostingOperatorDid, EXAMPLE_OPERATOR_A_DID);
  assert.equal(results[0]?.record.serviceType, ServiceCapabilityToken.IndexProvider);
  assert.equal(results[0]?.record.endpointUrl, EXAMPLE_PROVIDER_PUBLISHED_ENDPOINT_URL);
  assert.equal(results[0]?.catalogUrl, 'https://provider.example.org/.well-known/dcat3/catalog');
  assert.equal(results[0]?.hostingOperator.coverageScope, DataspaceCoverageScope.EuropeanUnion);
});

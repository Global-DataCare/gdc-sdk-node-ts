import test from 'node:test';
import assert from 'node:assert/strict';
import { DataspaceSectors } from 'gdc-common-utils-ts/constants';
import { ServiceCapabilityToken } from 'gdc-common-utils-ts/constants';
import {
  EXAMPLE_COVERAGE_SCOPE_EU,
  EXAMPLE_HOSTING_OPERATOR_CATALOG_URL,
  EXAMPLE_HOSTING_OPERATOR_DID,
  EXAMPLE_JURISDICTION,
  EXAMPLE_PROVIDER_PUBLISHED_ENDPOINT_URL,
  EXAMPLE_TENANT_SERVICE_DID,
} from 'gdc-common-utils-ts/examples/shared';

import { DataspaceResolver } from '../dist/index.js';

class MemoryDataspaceResolver extends DataspaceResolver {
  async resolveHostingOperators(input) {
    return [{
      operatorDid: EXAMPLE_HOSTING_OPERATOR_DID,
      record: {
        subjectId: EXAMPLE_HOSTING_OPERATOR_DID,
        serviceTypes: [ServiceCapabilityToken.IndexProvider],
        categories: [input.sector],
        areaServed: [EXAMPLE_COVERAGE_SCOPE_EU],
        addressCountry: EXAMPLE_JURISDICTION,
        coverageScope: EXAMPLE_COVERAGE_SCOPE_EU,
      },
      matchedCapabilities: [ServiceCapabilityToken.IndexProvider],
      catalogUrl: EXAMPLE_HOSTING_OPERATOR_CATALOG_URL,
    }];
  }

  async resolvePublishedProviders(input) {
    return [{
      providerDid: EXAMPLE_TENANT_SERVICE_DID,
      record: {
        providerDid: EXAMPLE_TENANT_SERVICE_DID,
        serviceType: input.providerCapability,
        category: input.sector,
        areaServed: EXAMPLE_COVERAGE_SCOPE_EU,
        endpointUrl: EXAMPLE_PROVIDER_PUBLISHED_ENDPOINT_URL,
        catalogUrl: EXAMPLE_HOSTING_OPERATOR_CATALOG_URL,
      },
    }];
  }
}

test('DataspaceResolver can be specialized for hosting-operator resolution', async () => {
  const resolver = new MemoryDataspaceResolver();
  const results = await resolver.resolveHostingOperators({
    sector: DataspaceSectors.AnimalCare,
    requiredCapabilities: [ServiceCapabilityToken.IndexProvider],
    coverageScope: EXAMPLE_COVERAGE_SCOPE_EU,
  });

  assert.equal(results[0]?.operatorDid, EXAMPLE_HOSTING_OPERATOR_DID);
  assert.deepEqual(results[0]?.matchedCapabilities, [ServiceCapabilityToken.IndexProvider]);
  assert.equal(results[0]?.record.coverageScope, EXAMPLE_COVERAGE_SCOPE_EU);
});

test('DataspaceResolver can be specialized for published-provider resolution', async () => {
  const resolver = new MemoryDataspaceResolver();
  const results = await resolver.resolvePublishedProviders({
    sector: DataspaceSectors.AnimalCare,
    providerCapability: ServiceCapabilityToken.IndexProvider,
    coverageScope: EXAMPLE_COVERAGE_SCOPE_EU,
  });

  assert.equal(results[0]?.providerDid, EXAMPLE_TENANT_SERVICE_DID);
  assert.equal(results[0]?.record.serviceType, ServiceCapabilityToken.IndexProvider);
  assert.equal(results[0]?.record.category, DataspaceSectors.AnimalCare);
});

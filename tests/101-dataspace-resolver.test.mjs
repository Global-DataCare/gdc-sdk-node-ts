import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DataspaceCoverageScope,
  DataspaceSectors,
  ServiceCapabilityToken,
} from 'gdc-common-utils-ts';
import { HostNetworkTypes } from 'gdc-common-utils-ts/constants/network';
import {
  EXAMPLE_COVERAGE_SCOPE_EU,
  EXAMPLE_JURISDICTION,
  EXAMPLE_TENANT_SERVICE_DID,
} from 'gdc-common-utils-ts/examples/shared';
import {
  buildDefaultHostingOperatorDiscoveryCatalog,
  buildDefaultPublishedProviderCatalogRecord,
  createDiscoveryCatalogFetcher,
} from 'gdc-common-utils-ts/utils/dataspace-discovery';
import { buildDefaultHostingOperatorRegistrationFromAuthority } from 'gdc-common-utils-ts/utils/dataspace-discovery-defaults';
import { buildDspaceVersionMetadata } from 'gdc-common-utils-ts/utils/dataspace-protocol';
import { HttpDataspaceResolver } from '../dist/index.js';

const VERSION = 'v1';
const NETWORK_TYPE = HostNetworkTypes.Test;
const JURISDICTION = EXAMPLE_JURISDICTION;
const COVERAGE_SCOPE = DataspaceCoverageScope.EuropeanUnion;
const HOST_DISCOVERY_URL = `https://host.example.org/host/cds-${COVERAGE_SCOPE}/${VERSION}/${NETWORK_TYPE}/.well-known/dspace-version`;
const HOST_CATALOG_URL = `https://host.example.org/host/cds-${JURISDICTION}/${VERSION}/${NETWORK_TYPE}/dsp/catalog/dcat.json`;

const HOST = buildDefaultHostingOperatorRegistrationFromAuthority({
  authority: 'host.example.org',
  jurisdiction: JURISDICTION,
  version: VERSION,
  networkType: NETWORK_TYPE,
  title: 'Animal Care Host ES',
  sector: DataspaceSectors.AnimalCare,
  serviceTypes: [ServiceCapabilityToken.IndexProvider],
  areaServed: [EXAMPLE_COVERAGE_SCOPE_EU, JURISDICTION],
  coverageScope: COVERAGE_SCOPE,
});

test('101: HttpDataspaceResolver resolves one published index provider from one public host catalog', async () => {
  // Step 1.
  // Backend already knows one hosting operator semantic record.
  const hostingOperators = [HOST];

  // Step 2.
  // The resolver fetches the host DSP version document and then the public catalog.
  const transport = createDiscoveryCatalogFetcher({
    internetJsonByUrl: {
      [HOST_DISCOVERY_URL]: buildDspaceVersionMetadata(
        `/host/cds-${JURISDICTION}/${VERSION}/${NETWORK_TYPE}/dsp`,
      ),
    },
    internetCatalogs: {
      [HOST_CATALOG_URL]: buildDefaultHostingOperatorDiscoveryCatalog({
        hostingOperatorDid: HOST.operatorDid,
        discoveryUrl: HOST_DISCOVERY_URL,
        catalogUrl: HOST_CATALOG_URL,
        providers: [
          buildDefaultPublishedProviderCatalogRecord({
            providerDid: EXAMPLE_TENANT_SERVICE_DID,
            serviceType: ServiceCapabilityToken.IndexProvider,
            category: DataspaceSectors.AnimalCare,
            areaServed: [EXAMPLE_COVERAGE_SCOPE_EU, JURISDICTION],
            discoveryUrl: HOST_DISCOVERY_URL,
            catalogUrl: HOST_CATALOG_URL,
          }),
        ],
      }),
    },
  });

  // Step 3.
  // Runtime code resolves published providers by sector + jurisdiction.
  const resolver = new HttpDataspaceResolver({
    fetcher: transport.fetcher,
    hostingOperators,
  });
  const providers = await resolver.resolvePublishedProviders({
    sector: DataspaceSectors.AnimalCare,
    providerCapability: ServiceCapabilityToken.IndexProvider,
    jurisdiction: JURISDICTION,
    coverageScope: COVERAGE_SCOPE,
  });

  assert.equal(providers.length, 1);
  assert.equal(providers[0]?.providerDid, EXAMPLE_TENANT_SERVICE_DID);
  assert.equal(providers[0]?.hostingOperatorDid, HOST.operatorDid);
});

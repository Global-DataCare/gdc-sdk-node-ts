import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DataspaceCoverageScope,
  DataspaceSectors,
  ServiceCapabilityToken,
} from 'gdc-common-utils-ts';
import { HostNetworkTypes } from 'gdc-common-utils-ts/constants/network';
import {
  buildDefaultHostingOperatorDiscoveryCatalog,
  buildDefaultPublishedProviderCatalogRecord,
  createDiscoveryCatalogFetcher,
} from 'gdc-common-utils-ts/utils/dataspace-discovery';
import { buildDspaceVersionMetadata } from 'gdc-common-utils-ts/utils/dataspace-protocol';
import { createDefaultFirstDataspaceDiscovery } from '../dist/index.js';

const VERSION = 'v1';
const NETWORK_TYPE = HostNetworkTypes.Test;
const JURISDICTION = 'ES';
const COVERAGE_SCOPE = DataspaceCoverageScope.EuropeanUnion;

function buildHost(domain, title, sector, serviceTypes) {
  const operatorDid = `did:web:${domain}`;
  return {
    jurisdiction: JURISDICTION,
    version: VERSION,
    networkType: NETWORK_TYPE,
    title,
    operatorDid,
    discoveryUrl: `https://${domain}/host/cds-${JURISDICTION}/${VERSION}/${NETWORK_TYPE}/.well-known/dspace-version`,
    catalogUrl: `https://${domain}/host/cds-${JURISDICTION}/${VERSION}/${NETWORK_TYPE}/dsp/catalog/dcat.json`,
    record: {
      subjectId: operatorDid,
      serviceTypes,
      categories: [sector],
      areaServed: [COVERAGE_SCOPE, JURISDICTION],
      addressCountry: JURISDICTION,
      coverageScope: COVERAGE_SCOPE,
    },
  };
}

const HEALTH_CARE_HOST = buildHost(
  'host-health-care.example.org',
  'Health Care Host ES',
  DataspaceSectors.HealthCare,
  [ServiceCapabilityToken.IndexProvider],
);

const HEALTH_RESEARCH_HOST = buildHost(
  'host-health-research.example.org',
  'Health Research Host ES',
  DataspaceSectors.HealthResearch,
  [ServiceCapabilityToken.DigitalTwinProvider],
);

const ANIMAL_CARE_HOST = buildHost(
  'host-animal-care.example.org',
  'Animal Care Host ES',
  DataspaceSectors.AnimalCare,
  [ServiceCapabilityToken.IndexProvider],
);

const ANIMAL_RESEARCH_HOST = buildHost(
  'host-animal-research.example.org',
  'Animal Research Host ES',
  DataspaceSectors.AnimalResearch,
  [ServiceCapabilityToken.DigitalTwinProvider],
);

const DEFAULTS = {
  icas: [{
    jurisdiction: JURISDICTION,
    version: VERSION,
    networkType: NETWORK_TYPE,
    title: 'ICA ES Test',
    icaUrl: 'https://ica.example.org/.well-known/ica-configuration',
    icaDid: 'did:web:ica.example.org',
  }],
  hostingOperators: [
    HEALTH_CARE_HOST,
    HEALTH_RESEARCH_HOST,
    ANIMAL_CARE_HOST,
    ANIMAL_RESEARCH_HOST,
  ],
};

const ANIMAL_CARE_PROVIDER_DID = 'did:web:animal-care-provider.example.org';
const ANIMAL_RESEARCH_PROVIDER_DID = 'did:web:animal-research-provider.example.org';

const transport = createDiscoveryCatalogFetcher({
  internetJsonByUrl: {
    [ANIMAL_CARE_HOST.discoveryUrl]: buildDspaceVersionMetadata(`/host/cds-${JURISDICTION}/${VERSION}/${NETWORK_TYPE}/dsp`),
    [ANIMAL_RESEARCH_HOST.discoveryUrl]: buildDspaceVersionMetadata(`/host/cds-${JURISDICTION}/${VERSION}/${NETWORK_TYPE}/dsp`),
  },
  internetCatalogs: {
    [ANIMAL_CARE_HOST.catalogUrl]: buildDefaultHostingOperatorDiscoveryCatalog({
      hostingOperatorDid: ANIMAL_CARE_HOST.operatorDid,
      discoveryUrl: ANIMAL_CARE_HOST.discoveryUrl,
      catalogUrl: ANIMAL_CARE_HOST.catalogUrl,
      providers: [
        buildDefaultPublishedProviderCatalogRecord({
          providerDid: ANIMAL_CARE_PROVIDER_DID,
          serviceType: ServiceCapabilityToken.IndexProvider,
          category: DataspaceSectors.AnimalCare,
          areaServed: [COVERAGE_SCOPE, JURISDICTION],
          endpointUrl: 'https://animal-care-provider.example.org/dsp',
          discoveryUrl: ANIMAL_CARE_HOST.discoveryUrl,
          catalogUrl: ANIMAL_CARE_HOST.catalogUrl,
        }),
      ],
    }),
    [ANIMAL_RESEARCH_HOST.catalogUrl]: buildDefaultHostingOperatorDiscoveryCatalog({
      hostingOperatorDid: ANIMAL_RESEARCH_HOST.operatorDid,
      discoveryUrl: ANIMAL_RESEARCH_HOST.discoveryUrl,
      catalogUrl: ANIMAL_RESEARCH_HOST.catalogUrl,
      providers: [
        buildDefaultPublishedProviderCatalogRecord({
          providerDid: ANIMAL_RESEARCH_PROVIDER_DID,
          serviceType: ServiceCapabilityToken.DigitalTwinProvider,
          category: DataspaceSectors.AnimalResearch,
          areaServed: [COVERAGE_SCOPE, JURISDICTION],
          endpointUrl: 'https://animal-research-provider.example.org/dsp',
          discoveryUrl: ANIMAL_RESEARCH_HOST.discoveryUrl,
          catalogUrl: ANIMAL_RESEARCH_HOST.catalogUrl,
        }),
      ],
    }),
  },
});

test('101: default-first discovery returns configured hosts by sector and jurisdiction', async () => {
  const discovery = createDefaultFirstDataspaceDiscovery({
    version: VERSION,
    networkType: NETWORK_TYPE,
    defaults: DEFAULTS,
  });

  const hosts = await discovery.getHosts({
    sector: DataspaceSectors.AnimalCare,
    jurisdiction: JURISDICTION,
    coverageScope: COVERAGE_SCOPE,
    requiredCapabilities: [ServiceCapabilityToken.IndexProvider],
  });

  assert.equal(hosts.length, 1);
  assert.equal(hosts[0]?.operatorDid, ANIMAL_CARE_HOST.operatorDid);
});

test('101: default-first discovery returns index providers for the selected sector', async () => {
  const discovery = createDefaultFirstDataspaceDiscovery({
    version: VERSION,
    networkType: NETWORK_TYPE,
    defaults: DEFAULTS,
    fetcher: transport.fetcher,
  });

  const providers = await discovery.getIndexProviders({
    sector: DataspaceSectors.AnimalCare,
    jurisdiction: JURISDICTION,
    coverageScope: COVERAGE_SCOPE,
  });

  assert.equal(providers.length, 1);
  assert.equal(providers[0]?.providerDid, ANIMAL_CARE_PROVIDER_DID);
  assert.equal(providers[0]?.hostingOperatorDid, ANIMAL_CARE_HOST.operatorDid);
});

test('101: default-first discovery returns digital twin providers for the selected sector', async () => {
  const discovery = createDefaultFirstDataspaceDiscovery({
    version: VERSION,
    networkType: NETWORK_TYPE,
    defaults: DEFAULTS,
    fetcher: transport.fetcher,
  });

  const providers = await discovery.getDigitalTwinProviders({
    sector: DataspaceSectors.AnimalResearch,
    jurisdiction: JURISDICTION,
    coverageScope: COVERAGE_SCOPE,
  });

  assert.equal(providers.length, 1);
  assert.equal(providers[0]?.providerDid, ANIMAL_RESEARCH_PROVIDER_DID);
  assert.equal(providers[0]?.hostingOperatorDid, ANIMAL_RESEARCH_HOST.operatorDid);
});

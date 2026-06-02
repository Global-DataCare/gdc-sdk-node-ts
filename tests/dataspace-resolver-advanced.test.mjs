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
  EXAMPLE_HOSTING_OPERATOR_CATALOG_ARTIFACT_URL,
  EXAMPLE_HOSTING_OPERATOR_DSPACE_VERSION_URL,
  EXAMPLE_HOSTING_OPERATOR_DID,
  EXAMPLE_JURISDICTION,
  EXAMPLE_NON_EU_COUNTRY,
  EXAMPLE_SECONDARY_EU_COUNTRY,
  EXAMPLE_SECONDARY_PROVIDER_ALTERNATE_NAME,
  EXAMPLE_SECONDARY_TENANT_SERVICE_DID,
  EXAMPLE_TENANT_IDENTIFIER,
  EXAMPLE_TENANT_SERVICE_DID,
} from 'gdc-common-utils-ts/examples/shared';
import {
  buildDefaultHostingOperatorDiscoveryCatalog,
  buildDefaultPublishedProviderCatalogRecord,
  createDiscoveryCatalogFetcher,
  DiscoveryCatalogSource,
} from 'gdc-common-utils-ts/utils/dataspace-discovery';
import { buildDspaceVersionMetadata } from 'gdc-common-utils-ts/utils/dataspace-protocol';
import { buildOrganizationDidWeb, getBaseUrlFromDidWeb } from 'gdc-common-utils-ts/utils/did';
import { HttpDataspaceResolver } from '../dist/index.js';

/**
 * Canonical hosted/internal provider DID used by the hosting operator runtime.
 *
 * Important integration note:
 * - this is the internal hosted `did:web` registered and resolved by the host
 * - it is not the same shape as an external portal DID such as
 *   `did:web:<external-portal>:<sector>:organization:taxid:<VAT>`
 * - portal/BFF integrations may need an explicit mapping layer between the
 *   external organization identity shown to users and the internal hosted DID
 *   used by host discovery/runtime resolution
 */
const EXAMPLE_PRIMARY_PROVIDER_DID = buildOrganizationDidWeb({
  hostDidWeb: EXAMPLE_HOSTING_OPERATOR_DID,
  tenantId: EXAMPLE_TENANT_IDENTIFIER,
  jurisdiction: EXAMPLE_JURISDICTION,
  version: 'v1',
  sector: DataspaceSectors.AnimalCare,
});

/**
 * Reader-only hosted/internal provider DID used to verify that discovery for
 * individual provider selection excludes reader-only services.
 *
 * This is intentionally a hosted/internal `did:web`, not an external portal
 * DID. The distinction must remain visible to integrators because portal code
 * may otherwise assume that the displayed external organization DID is the same
 * value that the host catalog publishes internally.
 */
const EXAMPLE_READER_ONLY_PROVIDER_DID = buildOrganizationDidWeb({
  hostDidWeb: EXAMPLE_HOSTING_OPERATOR_DID,
  tenantId: EXAMPLE_SECONDARY_PROVIDER_ALTERNATE_NAME,
  jurisdiction: EXAMPLE_JURISDICTION,
  version: 'v1',
  sector: DataspaceSectors.AnimalCare,
});

const EXAMPLE_PRIMARY_PROVIDER_OPERATIONAL_URL = getBaseUrlFromDidWeb(EXAMPLE_PRIMARY_PROVIDER_DID);
const EXAMPLE_SECONDARY_PROVIDER_OPERATIONAL_URL = getBaseUrlFromDidWeb(EXAMPLE_SECONDARY_TENANT_SERVICE_DID);
const EXAMPLE_READER_ONLY_PROVIDER_OPERATIONAL_URL = getBaseUrlFromDidWeb(EXAMPLE_READER_ONLY_PROVIDER_DID);

/**
 * Host discovery record for a technical hosting runtime.
 *
 * Important path rule:
 * - for `host` routes, the segment after `cds-{jurisdiction}/{version}` is
 *   `hostNetwork`
 * - for the hosting runtime and ICA-style technical surfaces this normally
 *   uses the canonical host network labels from `HostNetworkTypes`
 * - it is not the tenant business sector such as `animal-care`
 */
/** @type {{ operatorDid: string, discoveryUrl: string, catalogUrl: string, record: import('gdc-common-utils-ts').HostingOperatorSemanticRecord }} */
const EXAMPLE_ANIMAL_CARE_HOST = {
  operatorDid: EXAMPLE_HOSTING_OPERATOR_DID,
  discoveryUrl: EXAMPLE_HOSTING_OPERATOR_DSPACE_VERSION_URL,
  catalogUrl: EXAMPLE_HOSTING_OPERATOR_CATALOG_ARTIFACT_URL,
  record: {
    subjectId: EXAMPLE_HOSTING_OPERATOR_DID,
    serviceTypes: [ServiceCapabilityToken.IndexReader, ServiceCapabilityToken.IndexProvider],
    categories: [DataspaceSectors.AnimalCare],
    areaServed: [EXAMPLE_COVERAGE_SCOPE_EU, EXAMPLE_JURISDICTION],
    addressCountry: EXAMPLE_JURISDICTION,
    coverageScope: EXAMPLE_COVERAGE_SCOPE_EU,
  },
};

const EXAMPLE_PORTUGAL_HOST_DID = 'did:web:pt-host.example.org';
const EXAMPLE_PT_HOST_DISCOVERY_URL = `https://pt-host.example.org/host/cds-PT/v1/${HostNetworkTypes.Test}/.well-known/dspace-version`;
const EXAMPLE_PT_HOST_CATALOG_ARTIFACT_URL = `https://pt-host.example.org/host/cds-PT/v1/${HostNetworkTypes.Test}/dsp/catalog/dcat.json`;

/** @type {{ operatorDid: string, discoveryUrl: string, catalogUrl: string, record: import('gdc-common-utils-ts').HostingOperatorSemanticRecord }} */
const EXAMPLE_PT_HOST = {
  operatorDid: EXAMPLE_PORTUGAL_HOST_DID,
  discoveryUrl: EXAMPLE_PT_HOST_DISCOVERY_URL,
  catalogUrl: EXAMPLE_PT_HOST_CATALOG_ARTIFACT_URL,
  record: {
    subjectId: EXAMPLE_PORTUGAL_HOST_DID,
    serviceTypes: [ServiceCapabilityToken.IndexProvider],
    categories: [DataspaceSectors.AnimalCare],
    areaServed: [EXAMPLE_COVERAGE_SCOPE_EU, EXAMPLE_SECONDARY_EU_COUNTRY],
    addressCountry: EXAMPLE_SECONDARY_EU_COUNTRY,
    coverageScope: EXAMPLE_COVERAGE_SCOPE_EU,
  },
};

/** @type {import('gdc-common-utils-ts').HostingOperatorDiscoveryCatalog} */
const EXAMPLE_ANIMAL_CARE_MIXED_PROVIDER_CATALOG = {
  ...buildDefaultHostingOperatorDiscoveryCatalog({
    hostingOperatorDid: EXAMPLE_HOSTING_OPERATOR_DID,
    discoveryUrl: EXAMPLE_HOSTING_OPERATOR_DSPACE_VERSION_URL,
    catalogUrl: EXAMPLE_HOSTING_OPERATOR_CATALOG_ARTIFACT_URL,
    providers: [
      buildDefaultPublishedProviderCatalogRecord({
        providerDid: EXAMPLE_PRIMARY_PROVIDER_DID,
        serviceType: ServiceCapabilityToken.IndexProvider,
        category: DataspaceSectors.AnimalCare,
        areaServed: [EXAMPLE_COVERAGE_SCOPE_EU, EXAMPLE_JURISDICTION],
        endpointUrl: EXAMPLE_PRIMARY_PROVIDER_OPERATIONAL_URL,
        discoveryUrl: EXAMPLE_HOSTING_OPERATOR_DSPACE_VERSION_URL,
        catalogUrl: EXAMPLE_HOSTING_OPERATOR_CATALOG_ARTIFACT_URL,
      }),
      buildDefaultPublishedProviderCatalogRecord({
        providerDid: EXAMPLE_SECONDARY_TENANT_SERVICE_DID,
        serviceType: ServiceCapabilityToken.DigitalTwinProvider,
        category: DataspaceSectors.AnimalCare,
        areaServed: [EXAMPLE_COVERAGE_SCOPE_EU, EXAMPLE_JURISDICTION],
        endpointUrl: EXAMPLE_SECONDARY_PROVIDER_OPERATIONAL_URL,
        discoveryUrl: EXAMPLE_HOSTING_OPERATOR_DSPACE_VERSION_URL,
        catalogUrl: EXAMPLE_HOSTING_OPERATOR_CATALOG_ARTIFACT_URL,
      }),
      buildDefaultPublishedProviderCatalogRecord({
        providerDid: EXAMPLE_READER_ONLY_PROVIDER_DID,
        serviceType: ServiceCapabilityToken.IndexReader,
        category: DataspaceSectors.AnimalCare,
        areaServed: [EXAMPLE_COVERAGE_SCOPE_EU, EXAMPLE_JURISDICTION],
        endpointUrl: EXAMPLE_READER_ONLY_PROVIDER_OPERATIONAL_URL,
        discoveryUrl: EXAMPLE_HOSTING_OPERATOR_DSPACE_VERSION_URL,
        catalogUrl: EXAMPLE_HOSTING_OPERATOR_CATALOG_ARTIFACT_URL,
      }),
    ],
  }),
};

/** @type {import('gdc-common-utils-ts').HostingOperatorDiscoveryCatalog} */
const EXAMPLE_DEFAULT_INDEX_PROVIDER_CATALOG = {
  ...buildDefaultHostingOperatorDiscoveryCatalog({
    hostingOperatorDid: EXAMPLE_HOSTING_OPERATOR_DID,
    discoveryUrl: EXAMPLE_HOSTING_OPERATOR_DSPACE_VERSION_URL,
    catalogUrl: EXAMPLE_HOSTING_OPERATOR_CATALOG_ARTIFACT_URL,
    providers: [
      buildDefaultPublishedProviderCatalogRecord({
        providerDid: EXAMPLE_PRIMARY_PROVIDER_DID,
        serviceType: ServiceCapabilityToken.IndexProvider,
        category: DataspaceSectors.AnimalCare,
        areaServed: [EXAMPLE_COVERAGE_SCOPE_EU, EXAMPLE_JURISDICTION],
        endpointUrl: EXAMPLE_PRIMARY_PROVIDER_OPERATIONAL_URL,
        discoveryUrl: EXAMPLE_HOSTING_OPERATOR_DSPACE_VERSION_URL,
        catalogUrl: EXAMPLE_HOSTING_OPERATOR_CATALOG_ARTIFACT_URL,
      }),
    ],
  }),
};

const EXAMPLE_HEALTH_CARE_PROVIDER_DID = buildOrganizationDidWeb({
  hostDidWeb: EXAMPLE_HOSTING_OPERATOR_DID,
  tenantId: 'acme-health',
  jurisdiction: EXAMPLE_JURISDICTION,
  version: 'v1',
  sector: DataspaceSectors.HealthCare,
});

const EXAMPLE_HEALTH_CARE_PROVIDER_OPERATIONAL_URL = getBaseUrlFromDidWeb(EXAMPLE_HEALTH_CARE_PROVIDER_DID);

/** @type {import('gdc-common-utils-ts').HostingOperatorDiscoveryCatalog} */
const EXAMPLE_MIXED_SECTOR_PROVIDER_CATALOG = {
  ...buildDefaultHostingOperatorDiscoveryCatalog({
    hostingOperatorDid: EXAMPLE_HOSTING_OPERATOR_DID,
    discoveryUrl: EXAMPLE_HOSTING_OPERATOR_DSPACE_VERSION_URL,
    catalogUrl: EXAMPLE_HOSTING_OPERATOR_CATALOG_ARTIFACT_URL,
    providers: [
      ...EXAMPLE_ANIMAL_CARE_MIXED_PROVIDER_CATALOG.providers,
      buildDefaultPublishedProviderCatalogRecord({
        providerDid: EXAMPLE_HEALTH_CARE_PROVIDER_DID,
        serviceType: ServiceCapabilityToken.IndexProvider,
        category: DataspaceSectors.HealthCare,
        areaServed: [EXAMPLE_COVERAGE_SCOPE_EU, EXAMPLE_JURISDICTION],
        endpointUrl: EXAMPLE_HEALTH_CARE_PROVIDER_OPERATIONAL_URL,
        discoveryUrl: EXAMPLE_HOSTING_OPERATOR_DSPACE_VERSION_URL,
        catalogUrl: EXAMPLE_HOSTING_OPERATOR_CATALOG_ARTIFACT_URL,
      }),
    ],
  }),
};

test('101: resolves hosting operators by capability and jurisdiction', async () => {
  const resolver = new HttpDataspaceResolver({
    hostingOperators: [EXAMPLE_ANIMAL_CARE_HOST, EXAMPLE_PT_HOST],
  });

  const results = await resolver.resolveHostingOperators({
    sector: DataspaceSectors.AnimalCare,
    jurisdiction: EXAMPLE_JURISDICTION,
    coverageScope: DataspaceCoverageScope.EuropeanUnion,
    requiredCapabilities: [ServiceCapabilityToken.IndexProvider],
  });

  assert.equal(results.length, 2);
  assert.equal(results[0]?.operatorDid, EXAMPLE_HOSTING_OPERATOR_DID);
  assert.equal(results[1]?.operatorDid, EXAMPLE_PORTUGAL_HOST_DID);
});

test('101: resolves EU hosting operators by country within EU coverage', async () => {
  const resolver = new HttpDataspaceResolver({
    hostingOperators: [EXAMPLE_ANIMAL_CARE_HOST, EXAMPLE_PT_HOST],
  });

  const results = await resolver.resolveHostingOperators({
    sector: DataspaceSectors.AnimalCare,
    jurisdiction: EXAMPLE_SECONDARY_EU_COUNTRY,
    coverageScope: DataspaceCoverageScope.EuropeanUnion,
    requiredCapabilities: [ServiceCapabilityToken.IndexProvider],
  });

  assert.equal(results.length, 2);
  assert.equal(results[0]?.operatorDid, EXAMPLE_HOSTING_OPERATOR_DID);
  assert.equal(results[1]?.operatorDid, EXAMPLE_PORTUGAL_HOST_DID);
});

test('101: resolves published index providers for the requested jurisdiction', async () => {
  const transport = createDiscoveryCatalogFetcher({
    internetJsonByUrl: {
      [EXAMPLE_HOSTING_OPERATOR_DSPACE_VERSION_URL]: buildDspaceVersionMetadata(`/host/cds-ES/v1/${HostNetworkTypes.Test}/dsp`),
      [EXAMPLE_PT_HOST_DISCOVERY_URL]: buildDspaceVersionMetadata(`/host/cds-PT/v1/${HostNetworkTypes.Test}/dsp`),
    },
    internetCatalogs: {
      [EXAMPLE_HOSTING_OPERATOR_CATALOG_ARTIFACT_URL]: EXAMPLE_ANIMAL_CARE_MIXED_PROVIDER_CATALOG,
    },
  });

  const resolver = new HttpDataspaceResolver({
    fetcher: transport.fetcher,
    hostingOperators: [{
      ...EXAMPLE_ANIMAL_CARE_HOST,
      record: {
        ...EXAMPLE_ANIMAL_CARE_HOST.record,
        categories: [DataspaceSectors.AnimalCare, DataspaceSectors.HealthCare],
      },
    }],
  });

  const results = await resolver.resolvePublishedProviders({
    sector: DataspaceSectors.AnimalCare,
    jurisdiction: EXAMPLE_JURISDICTION,
    coverageScope: DataspaceCoverageScope.EuropeanUnion,
    providerCapability: ServiceCapabilityToken.IndexProvider,
  });

  assert.equal(results.length, 1);
  assert.equal(results[0]?.providerDid, EXAMPLE_PRIMARY_PROVIDER_DID);
  assert.equal(results[0]?.record.serviceType, ServiceCapabilityToken.IndexProvider);
  assert.equal(transport.sources.get(EXAMPLE_HOSTING_OPERATOR_DSPACE_VERSION_URL), DiscoveryCatalogSource.Internet);
  assert.equal(transport.sources.get(EXAMPLE_HOSTING_OPERATOR_CATALOG_ARTIFACT_URL), DiscoveryCatalogSource.Internet);
});

test('101: resolves published digital twin providers for the requested jurisdiction', async () => {
  const transport = createDiscoveryCatalogFetcher({
    internetJsonByUrl: {
      [EXAMPLE_HOSTING_OPERATOR_DSPACE_VERSION_URL]: buildDspaceVersionMetadata(`/host/cds-ES/v1/${HostNetworkTypes.Test}/dsp`),
    },
    internetCatalogs: {
      [EXAMPLE_HOSTING_OPERATOR_CATALOG_ARTIFACT_URL]: EXAMPLE_ANIMAL_CARE_MIXED_PROVIDER_CATALOG,
    },
  });

  const resolver = new HttpDataspaceResolver({
    fetcher: transport.fetcher,
    hostingOperators: [{
      ...EXAMPLE_ANIMAL_CARE_HOST,
      record: {
        ...EXAMPLE_ANIMAL_CARE_HOST.record,
        serviceTypes: [ServiceCapabilityToken.DigitalTwinReader, ServiceCapabilityToken.DigitalTwinProvider],
      },
    }],
  });

  const results = await resolver.resolvePublishedProviders({
    sector: DataspaceSectors.AnimalCare,
    jurisdiction: EXAMPLE_JURISDICTION,
    coverageScope: DataspaceCoverageScope.EuropeanUnion,
    providerCapability: ServiceCapabilityToken.DigitalTwinProvider,
  });

  assert.equal(results.length, 1);
  assert.equal(results[0]?.providerDid, EXAMPLE_SECONDARY_TENANT_SERVICE_DID);
  assert.equal(results[0]?.record.serviceType, ServiceCapabilityToken.DigitalTwinProvider);
});

test('101: excludes reader-only catalog entries from individual provider selection', async () => {
  const transport = createDiscoveryCatalogFetcher({
    internetJsonByUrl: {
      [EXAMPLE_HOSTING_OPERATOR_DSPACE_VERSION_URL]: buildDspaceVersionMetadata(`/host/cds-ES/v1/${HostNetworkTypes.Test}/dsp`),
    },
    internetCatalogs: {
      [EXAMPLE_HOSTING_OPERATOR_CATALOG_ARTIFACT_URL]: EXAMPLE_ANIMAL_CARE_MIXED_PROVIDER_CATALOG,
    },
  });

  const resolver = new HttpDataspaceResolver({
    fetcher: transport.fetcher,
    hostingOperators: [{
      ...EXAMPLE_ANIMAL_CARE_HOST,
      record: {
        ...EXAMPLE_ANIMAL_CARE_HOST.record,
        categories: [DataspaceSectors.AnimalCare, DataspaceSectors.HealthCare],
      },
    }],
  });

  const results = await resolver.resolvePublishedProviders({
    sector: DataspaceSectors.AnimalCare,
    jurisdiction: EXAMPLE_JURISDICTION,
    coverageScope: DataspaceCoverageScope.EuropeanUnion,
    providerCapability: ServiceCapabilityToken.IndexProvider,
  });

  assert.equal(
    results.some((entry) => entry.record.serviceType === ServiceCapabilityToken.IndexReader),
    false,
  );
});

test('101: filters mixed animal-care and health-care catalogs by sector', async () => {
  const transport = createDiscoveryCatalogFetcher({
    internetJsonByUrl: {
      [EXAMPLE_HOSTING_OPERATOR_DSPACE_VERSION_URL]: buildDspaceVersionMetadata(`/host/cds-ES/v1/${HostNetworkTypes.Test}/dsp`),
    },
    internetCatalogs: {
      [EXAMPLE_HOSTING_OPERATOR_CATALOG_ARTIFACT_URL]: EXAMPLE_MIXED_SECTOR_PROVIDER_CATALOG,
    },
  });

  const resolver = new HttpDataspaceResolver({
    fetcher: transport.fetcher,
    hostingOperators: [{
      ...EXAMPLE_ANIMAL_CARE_HOST,
      record: {
        ...EXAMPLE_ANIMAL_CARE_HOST.record,
        categories: [DataspaceSectors.AnimalCare, DataspaceSectors.HealthCare],
      },
    }],
  });

  const animalCareResults = await resolver.resolvePublishedProviders({
    sector: DataspaceSectors.AnimalCare,
    jurisdiction: EXAMPLE_JURISDICTION,
    coverageScope: DataspaceCoverageScope.EuropeanUnion,
    providerCapability: ServiceCapabilityToken.IndexProvider,
  });

  const healthCareResults = await resolver.resolvePublishedProviders({
    sector: DataspaceSectors.HealthCare,
    jurisdiction: EXAMPLE_JURISDICTION,
    coverageScope: DataspaceCoverageScope.EuropeanUnion,
    providerCapability: ServiceCapabilityToken.IndexProvider,
  });

  assert.equal(animalCareResults.length, 1);
  assert.equal(animalCareResults[0]?.providerDid, EXAMPLE_PRIMARY_PROVIDER_DID);
  assert.equal(healthCareResults.length, 1);
  assert.equal(healthCareResults[0]?.providerDid, EXAMPLE_HEALTH_CARE_PROVIDER_DID);
});

test('101: returns no providers when the jurisdiction does not match EU catalog coverage', async () => {
  const transport = createDiscoveryCatalogFetcher({
    internetJsonByUrl: {
      [EXAMPLE_HOSTING_OPERATOR_DSPACE_VERSION_URL]: buildDspaceVersionMetadata(`/host/cds-ES/v1/${HostNetworkTypes.Test}/dsp`),
    },
    internetCatalogs: {
      [EXAMPLE_HOSTING_OPERATOR_CATALOG_ARTIFACT_URL]: EXAMPLE_DEFAULT_INDEX_PROVIDER_CATALOG,
    },
  });

  const resolver = new HttpDataspaceResolver({
    fetcher: transport.fetcher,
    hostingOperators: [{
      ...EXAMPLE_ANIMAL_CARE_HOST,
      record: {
        ...EXAMPLE_ANIMAL_CARE_HOST.record,
        serviceTypes: [ServiceCapabilityToken.IndexProvider],
      },
    }],
  });

  const results = await resolver.resolvePublishedProviders({
    sector: DataspaceSectors.AnimalCare,
    jurisdiction: EXAMPLE_NON_EU_COUNTRY,
    providerCapability: ServiceCapabilityToken.IndexProvider,
  });

  assert.equal(results.length, 0);
});

test('101: falls back to cached catalog when a later HTTP request fails', async () => {
  const transport = createDiscoveryCatalogFetcher({
    internetJsonByUrl: {
      [EXAMPLE_HOSTING_OPERATOR_DSPACE_VERSION_URL]: buildDspaceVersionMetadata(`/host/cds-ES/v1/${HostNetworkTypes.Test}/dsp`),
    },
    internetCatalogs: {
      [EXAMPLE_HOSTING_OPERATOR_CATALOG_ARTIFACT_URL]: EXAMPLE_ANIMAL_CARE_MIXED_PROVIDER_CATALOG,
    },
  });

  const resolver = new HttpDataspaceResolver({
    fetcher: transport.fetcher,
    hostingOperators: [{
      ...EXAMPLE_ANIMAL_CARE_HOST,
      record: {
        ...EXAMPLE_ANIMAL_CARE_HOST.record,
        serviceTypes: [ServiceCapabilityToken.IndexProvider, ServiceCapabilityToken.DigitalTwinProvider],
      },
    }],
  });

  const firstResults = await resolver.resolvePublishedProviders({
    sector: DataspaceSectors.AnimalCare,
    jurisdiction: EXAMPLE_JURISDICTION,
    coverageScope: DataspaceCoverageScope.EuropeanUnion,
    providerCapability: ServiceCapabilityToken.IndexProvider,
  });

  assert.equal(firstResults.length, 1);
  assert.equal(transport.sources.get(EXAMPLE_HOSTING_OPERATOR_CATALOG_ARTIFACT_URL), DiscoveryCatalogSource.Internet);

  transport.setInternetFailure(
    EXAMPLE_HOSTING_OPERATOR_CATALOG_ARTIFACT_URL,
    503,
    { error: 'temporary failure' },
  );

  const secondResults = await resolver.resolvePublishedProviders({
    sector: DataspaceSectors.AnimalCare,
    jurisdiction: EXAMPLE_JURISDICTION,
    coverageScope: DataspaceCoverageScope.EuropeanUnion,
    providerCapability: ServiceCapabilityToken.IndexProvider,
  });

  assert.equal(secondResults.length, 1);
  assert.equal(secondResults[0]?.providerDid, EXAMPLE_PRIMARY_PROVIDER_DID);
  assert.equal(transport.sources.get(EXAMPLE_HOSTING_OPERATOR_CATALOG_ARTIFACT_URL), DiscoveryCatalogSource.Cache);
});

test('101: falls back to a configured default catalog when HTTP fails and cache is empty', async () => {
  const transport = createDiscoveryCatalogFetcher({
    internetJsonByUrl: {
      [EXAMPLE_HOSTING_OPERATOR_DSPACE_VERSION_URL]: buildDspaceVersionMetadata(`/host/cds-ES/v1/${HostNetworkTypes.Test}/dsp`),
    },
    defaultCatalogs: {
      [EXAMPLE_HOSTING_OPERATOR_CATALOG_ARTIFACT_URL]: EXAMPLE_DEFAULT_INDEX_PROVIDER_CATALOG,
    },
  });

  const resolver = new HttpDataspaceResolver({
    fetcher: transport.fetcher,
    hostingOperators: [EXAMPLE_ANIMAL_CARE_HOST],
  });

  const results = await resolver.resolvePublishedProviders({
    sector: DataspaceSectors.AnimalCare,
    jurisdiction: EXAMPLE_JURISDICTION,
    coverageScope: DataspaceCoverageScope.EuropeanUnion,
    providerCapability: ServiceCapabilityToken.IndexProvider,
  });

  assert.equal(results.length, 1);
  assert.equal(results[0]?.providerDid, EXAMPLE_PRIMARY_PROVIDER_DID);
  assert.equal(transport.sources.get(EXAMPLE_HOSTING_OPERATOR_CATALOG_ARTIFACT_URL), DiscoveryCatalogSource.Default);
});

test.todo(
  'TODO: hosted tenant DID Documents should keep the hosted/internal DID as primary `id` and publish external portal or vanity identities in `alsoKnownAs`.',
);

test.todo(
  'TODO: portal integrations should prove they can map an external organization DID such as did:web:<portal>:<sector>:organization:taxid:<VAT> to the hosted/internal DID published by the hosting operator catalog.',
);

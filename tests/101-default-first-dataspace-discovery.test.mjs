import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DataspaceCoverageScope,
  DataspaceSectors,
  ServiceCapabilityToken,
} from 'gdc-common-utils-ts';
import { HostNetworkTypes } from 'gdc-common-utils-ts/constants/network';
import {
  buildDefaultHostingOperatorRegistrationFromAuthority,
  buildDefaultIcaRegistrationFromAuthority,
  buildDefaultPublishedProviderRecordFromTenant,
} from 'gdc-common-utils-ts/utils/dataspace-discovery-defaults';
import { createDefaultFirstDataspaceDiscovery } from '../dist/index.js';

const VERSION = 'v1';
const NETWORK_TYPE = HostNetworkTypes.Test;
const JURISDICTION = 'ES';
const COVERAGE_SCOPE = DataspaceCoverageScope.EuropeanUnion;

const HEALTH_CARE_HOST = buildDefaultHostingOperatorRegistrationFromAuthority({
  authority: 'host-health-care.example.org',
  jurisdiction: JURISDICTION,
  version: VERSION,
  networkType: NETWORK_TYPE,
  title: 'Health Care Host ES',
  sector: DataspaceSectors.HealthCare,
  serviceTypes: [ServiceCapabilityToken.IndexProvider],
  areaServed: [COVERAGE_SCOPE, JURISDICTION],
  coverageScope: COVERAGE_SCOPE,
});

const HEALTH_RESEARCH_HOST = buildDefaultHostingOperatorRegistrationFromAuthority({
  authority: 'host-health-research.example.org',
  jurisdiction: JURISDICTION,
  version: VERSION,
  networkType: NETWORK_TYPE,
  title: 'Health Research Host ES',
  sector: DataspaceSectors.HealthResearch,
  serviceTypes: [ServiceCapabilityToken.DigitalTwinProvider],
  areaServed: [COVERAGE_SCOPE, JURISDICTION],
  coverageScope: COVERAGE_SCOPE,
});

const DEFAULTS = {
  icas: [
    buildDefaultIcaRegistrationFromAuthority({
      authority: 'ica.example.org',
      jurisdiction: JURISDICTION,
      version: VERSION,
      networkType: NETWORK_TYPE,
      title: 'ICA ES Test',
    }),
  ],
  hostingOperators: [
    {
      ...HEALTH_CARE_HOST,
      publishedProviders: [
        buildDefaultPublishedProviderRecordFromTenant({
          hostAuthority: 'host-health-care.example.org',
          tenantId: 'acme-id',
          jurisdiction: JURISDICTION,
          version: VERSION,
          sector: DataspaceSectors.HealthCare,
          providerCapability: ServiceCapabilityToken.IndexProvider,
          areaServed: [COVERAGE_SCOPE, JURISDICTION],
        }),
      ],
    },
    {
      ...HEALTH_RESEARCH_HOST,
      publishedProviders: [
        buildDefaultPublishedProviderRecordFromTenant({
          hostAuthority: 'host-health-research.example.org',
          tenantId: 'acme-id',
          jurisdiction: JURISDICTION,
          version: VERSION,
          sector: DataspaceSectors.HealthResearch,
          providerCapability: ServiceCapabilityToken.DigitalTwinProvider,
          areaServed: [COVERAGE_SCOPE, JURISDICTION],
        }),
      ],
    },
  ],
};

test('101: default-first discovery returns configured hosts by sector and jurisdiction', async () => {
  const discovery = createDefaultFirstDataspaceDiscovery({
    version: VERSION,
    networkType: NETWORK_TYPE,
    defaults: DEFAULTS,
  });

  const hosts = await discovery.getHosts({
    sector: DataspaceSectors.HealthCare,
    jurisdiction: JURISDICTION,
    coverageScope: COVERAGE_SCOPE,
    requiredCapabilities: [ServiceCapabilityToken.IndexProvider],
  });

  assert.equal(hosts.length, 1);
  assert.equal(hosts[0]?.operatorDid, HEALTH_CARE_HOST.operatorDid);
});

test('101: default-first discovery returns index providers from nested host defaults', async () => {
  const discovery = createDefaultFirstDataspaceDiscovery({
    version: VERSION,
    networkType: NETWORK_TYPE,
    defaults: DEFAULTS,
  });

  const providers = await discovery.getIndexProviders({
    sector: DataspaceSectors.HealthCare,
    jurisdiction: JURISDICTION,
    coverageScope: COVERAGE_SCOPE,
  });

  assert.equal(providers.length, 1);
  assert.equal(providers[0]?.providerDid, 'did:web:host-health-care.example.org:acme-id:cds-ES:v1:health-care');
  assert.equal(providers[0]?.hostingOperatorDid, HEALTH_CARE_HOST.operatorDid);
});

test('101: default-first discovery returns digital twin providers from nested host defaults', async () => {
  const discovery = createDefaultFirstDataspaceDiscovery({
    version: VERSION,
    networkType: NETWORK_TYPE,
    defaults: DEFAULTS,
  });

  const providers = await discovery.getDigitalTwinProviders({
    sector: DataspaceSectors.HealthResearch,
    jurisdiction: JURISDICTION,
    coverageScope: COVERAGE_SCOPE,
  });

  assert.equal(providers.length, 1);
  assert.equal(providers[0]?.providerDid, 'did:web:host-health-research.example.org:acme-id:cds-ES:v1:health-research');
  assert.equal(providers[0]?.hostingOperatorDid, HEALTH_RESEARCH_HOST.operatorDid);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DataspaceCoverageScope,
  DataspaceSectors,
  ServiceCapabilityToken,
} from 'gdc-common-utils-ts';
import { HostNetworkTypes } from 'gdc-common-utils-ts/constants/network';
import { buildOrganizationDidWeb, getBaseUrlFromDidWeb } from 'gdc-common-utils-ts/utils/did';
import { createDefaultFirstDataspaceDiscovery } from '../dist/index.js';

const VERSION = 'v1';
const NETWORK_TYPE = HostNetworkTypes.Test;
const JURISDICTION = 'ES';
const COVERAGE_SCOPE = DataspaceCoverageScope.EuropeanUnion;

function buildPublishedProviderFromTenant(hostAuthority, tenantId, sector, providerCapability) {
  const providerDid = buildOrganizationDidWeb({
    hostDidWeb: `did:web:${hostAuthority}`,
    tenantId,
    jurisdiction: JURISDICTION,
    version: VERSION,
    sector,
  });
  const endpointUrl = getBaseUrlFromDidWeb(providerDid);
  return {
    providerDid,
    serviceType: providerCapability,
    category: sector,
    areaServed: `${COVERAGE_SCOPE},${JURISDICTION}`,
    endpointUrl,
    discoveryUrl: new URL('.well-known/dspace-version', endpointUrl).toString(),
    catalogUrl: new URL('dsp/catalog/dcat.json', endpointUrl).toString(),
  };
}

function buildIcaDefault(authority, title) {
  return {
    jurisdiction: JURISDICTION,
    version: VERSION,
    networkType: NETWORK_TYPE,
    title,
    icaUrl: `https://${authority}/.well-known/ica-configuration`,
    icaDid: `did:web:${authority}`,
  };
}

function buildHostDefault(authority, title, sector, serviceTypes) {
  return {
    jurisdiction: JURISDICTION,
    version: VERSION,
    networkType: NETWORK_TYPE,
    title,
    operatorDid: `did:web:${authority}`,
    discoveryUrl: `https://${authority}/host/cds-${JURISDICTION}/${VERSION}/${NETWORK_TYPE}/.well-known/dspace-version`,
    record: {
      subjectId: `did:web:${authority}`,
      serviceTypes,
      categories: [sector],
      areaServed: [COVERAGE_SCOPE, JURISDICTION],
      addressCountry: JURISDICTION,
      coverageScope: COVERAGE_SCOPE,
    },
  };
}

const HEALTH_CARE_HOST = buildHostDefault(
  'host-health-care.example.org',
  'Health Care Host ES',
  DataspaceSectors.HealthCare,
  [ServiceCapabilityToken.IndexProvider],
);

const HEALTH_RESEARCH_HOST = buildHostDefault(
  'host-health-research.example.org',
  'Health Research Host ES',
  DataspaceSectors.HealthResearch,
  [ServiceCapabilityToken.DigitalTwinProvider],
);

const DEFAULTS = {
  icas: [
    buildIcaDefault('ica.example.org', 'ICA ES Test'),
  ],
  hostingOperators: [
    {
      ...HEALTH_CARE_HOST,
      publishedProviders: [
        buildPublishedProviderFromTenant(
          'host-health-care.example.org',
          'acme-id',
          DataspaceSectors.HealthCare,
          ServiceCapabilityToken.IndexProvider,
        ),
      ],
    },
    {
      ...HEALTH_RESEARCH_HOST,
      publishedProviders: [
        buildPublishedProviderFromTenant(
          'host-health-research.example.org',
          'acme-id',
          DataspaceSectors.HealthResearch,
          ServiceCapabilityToken.DigitalTwinProvider,
        ),
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

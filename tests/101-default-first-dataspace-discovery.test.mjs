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
  EXAMPLE_HOST_PUBLIC_HOSTNAME,
  EXAMPLE_JURISDICTION,
  EXAMPLE_TENANT_IDENTIFIER,
} from 'gdc-common-utils-ts/examples/shared';
import {
  buildDefaultHostingOperatorRegistrationFromAuthority,
  buildDefaultIcaRegistrationFromAuthority,
  buildDefaultPublishedProviderRecordFromTenant,
} from 'gdc-common-utils-ts/utils/dataspace-discovery-defaults';
import { createDefaultFirstDataspaceDiscovery } from '../dist/index.js';

const VERSION = 'v1';
const NETWORK_TYPE = HostNetworkTypes.Test;
const JURISDICTION = EXAMPLE_JURISDICTION;
const COVERAGE_SCOPE = DataspaceCoverageScope.EuropeanUnion;
const HOST_AUTHORITY = EXAMPLE_HOST_PUBLIC_HOSTNAME;

test('101: default-first discovery returns the default index provider for one sector and jurisdiction', async () => {
  // Step 1.
  // Backend startup config already knows one ICA default and one host default.
  const defaults = {
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
        ...buildDefaultHostingOperatorRegistrationFromAuthority({
          authority: HOST_AUTHORITY,
          jurisdiction: JURISDICTION,
          version: VERSION,
          networkType: NETWORK_TYPE,
          title: 'Health Care Host ES',
          sector: DataspaceSectors.HealthCare,
          serviceTypes: [ServiceCapabilityToken.IndexProvider],
          areaServed: [EXAMPLE_COVERAGE_SCOPE_EU, JURISDICTION],
          coverageScope: COVERAGE_SCOPE,
        }),
        publishedProviders: [
          buildDefaultPublishedProviderRecordFromTenant({
            hostAuthority: HOST_AUTHORITY,
            tenantId: EXAMPLE_TENANT_IDENTIFIER,
            jurisdiction: JURISDICTION,
            version: VERSION,
            sector: DataspaceSectors.HealthCare,
            providerCapability: ServiceCapabilityToken.IndexProvider,
            areaServed: [EXAMPLE_COVERAGE_SCOPE_EU, JURISDICTION],
          }),
        ],
      },
    ],
  };

  // Step 2.
  // Build the discovery facade once with those startup defaults.
  const discovery = createDefaultFirstDataspaceDiscovery({
    version: VERSION,
    networkType: NETWORK_TYPE,
    defaults,
  });

  // Step 3.
  // Runtime code asks for hosts or providers by sector + jurisdiction.
  const hosts = await discovery.getHosts({
    sector: DataspaceSectors.HealthCare,
    jurisdiction: JURISDICTION,
    coverageScope: COVERAGE_SCOPE,
    requiredCapabilities: [ServiceCapabilityToken.IndexProvider],
  });
  const providers = await discovery.getIndexProviders({
    sector: DataspaceSectors.HealthCare,
    jurisdiction: JURISDICTION,
    coverageScope: COVERAGE_SCOPE,
  });

  assert.equal(hosts.length, 1);
  assert.equal(providers.length, 1);
  assert.equal(hosts[0]?.operatorDid, defaults.hostingOperators[0]?.operatorDid);
  assert.equal(providers[0]?.hostingOperatorDid, defaults.hostingOperators[0]?.operatorDid);
});

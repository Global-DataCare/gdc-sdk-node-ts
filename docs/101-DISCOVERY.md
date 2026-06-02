# Discovery 101 for Node Backends

This guide explains the current dataspace discovery contract for a Node backend
that needs to resolve:

- eligible hosting operators
- published `IndexProvider` services
- published `DigitalTwinProvider` services

It also explains where HTTP fallback and cache belong in the integration.

## 1. What the resolver already does

The current Node resolver already supports:

- filtering by `sector`
- filtering by `jurisdiction`
- filtering by provider capability
- excluding reader-only capabilities from published-provider results

The relevant public capability tokens are:

- `ServiceCapabilityToken.IndexProvider`
- `ServiceCapabilityToken.DigitalTwinProvider`

Use `resolveHostingOperators(...)` when you need matching hosts.

Use `resolvePublishedProviders(...)` when you need actual published providers
for:

- indexing
- digital twins

## 2. Reader vs Provider semantics

An organization can publish reader and/or provider capabilities.

Typical examples:

- `ServiceCapabilityToken.IndexReader`
- `ServiceCapabilityToken.IndexProvider`
- `ServiceCapabilityToken.DigitalTwinReader`
- `ServiceCapabilityToken.DigitalTwinProvider`

This means a hosting operator or tenant-service organization may advertise
reader-only, provider-only, or mixed capability sets.

However, the common individual selection flow is different:

- individuals choosing where to publish or manage indexed data should discover
  `IndexProvider`
- individuals choosing where to request digital twin generation should discover
  `DigitalTwinProvider`
- reader-only capabilities should not be treated as selectable provider
  offerings in that flow

`resolvePublishedProviders(...)` already enforces that provider-only rule for
published provider discovery.

## 3. What the resolver does not own

`HttpDataspaceResolver` does not own:

- registry bootstrap from ICA or another source
- HTTP retry policy
- HTTP fallback policy
- cache storage
- transport observability

Those concerns belong to the backend integrator.

The resolver already exposes the correct extension point: `fetcher`.

## 4. Mental model

The runtime flow is:

1. preload hosting-operator semantic records
2. instantiate `HttpDataspaceResolver`
3. resolve eligible hosts for a sector, jurisdiction, and capability set
4. fetch each host DSP version-discovery entrypoint
5. derive the participant-scoped catalog artifact path from the returned DSP base path
6. filter published providers by:
   - provider capability
   - sector
   - jurisdiction

Important terminology:

- ICA may be the source of the semantic hosting-operator records
- the resolver itself operates on normalized `HostingOperatorSemanticRecord`
- provider discovery happens from host public catalogs, not from private tenant
  data

Path-segment rule:

- tenant/provider routes use `businessSector`
- host/ICA/defaults routes use `networkType`
- for technical host/runtime paths this uses the canonical
  `HostNetworkTypes` values, for example:
  - `HostNetworkTypes.Test`
  - `HostNetworkTypes.TestNetwork`
  - `HostNetworkTypes.Network`

## 4.1 Internal hosted DID vs external portal DID

This distinction must be explicit in backend and portal integrations.

For published providers discovered from host catalogs, the provider identifier
may be an internal hosted tenant DID such as:

- `did:web:<hosting-operator>:<tenantId>:cds-<jurisdiction>:v1:<sector>`

That internal hosted DID is not necessarily the same shape as an external
portal-facing organization DID such as:

- `did:web:<external-portal>:<sector>:organization:taxid:<VAT>`

Current discovery guidance:

- host catalogs and host resolution should be expected to return the hosted or
  otherwise host-registered internal DID
- portal/BFF integrations may need an explicit mapping layer from the external
  organization identity shown to users to the hosted/internal DID used by the
  hosting runtime
- this can be a real integration gap if the portal assumes both identifiers are
  interchangeable

Related future direction, documented here but not enforced by this 101 flow:

- hosted tenant DID Documents may use the hosted/internal DID as the primary
  `id`
- externally visible portal or vanity identities may appear in `alsoKnownAs`
- portal integration tests should eventually prove that external-to-internal DID
  resolution works end to end

## 5. Shared types and constants

Always reuse shared contracts from `gdc-common-utils-ts`.

Use:

- `DataspaceDiscoveryFilter`
- `HostingOperatorSemanticRecord`
- `HostingOperatorDiscoveryCatalog`
- `PublishedProviderCatalogRecord`
- `ServiceCapabilityToken`

Do not hardcode:

- capability strings
- sector strings
- jurisdictions
- example DIDs
- example URLs

Reuse shared examples whenever possible.

## 6. Basic initialization

For the current portal phase, the intended usage is:

1. configure defaults once at backend startup
2. then make simple calls by `sector + jurisdiction`
3. do not make app code deal with bootstrap plans or low-level resolvers

If matching hosting defaults already exist, `default-first` uses those
immediately. That lets the backend answer host-discovery requests without
depending on live ICA/internet resolution.

There are two different concerns here:

- startup seed
  - load one ICA default and one or more host defaults into the backend
- runtime query
  - ask for hosts or providers by `sector + jurisdiction`

Most integrators should focus on the runtime query part first.

### 6.1 Runtime query

This is the main example that backend developers should copy first:

```ts
import { createDefaultFirstDataspaceDiscovery } from 'gdc-sdk-node-ts';
import {
  DataspaceSectors,
  ServiceCapabilityToken,
} from 'gdc-common-utils-ts';
import { HostNetworkTypes } from 'gdc-common-utils-ts/constants/network';
import {
  buildDefaultHostingOperatorRegistrationFromAuthority,
  buildDefaultIcaRegistrationFromAuthority,
  buildDefaultPublishedProviderRecordFromTenant,
} from 'gdc-common-utils-ts/utils/dataspace-discovery-defaults';

const JURISDICTION = 'ES';
const VERSION = 'v1';
const NETWORK_TYPE = HostNetworkTypes.Test;
const COVERAGE_SCOPE = 'EU';

// Configure defaults once when the backend starts.
const discovery = createDefaultFirstDataspaceDiscovery({
  version: VERSION,
  networkType: NETWORK_TYPE,
  defaults: {
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
          authority: 'host-health-care.example.org',
          jurisdiction: JURISDICTION,
          version: VERSION,
          networkType: NETWORK_TYPE,
          title: 'Health Care Host ES',
          sector: DataspaceSectors.HealthCare,
          serviceTypes: [ServiceCapabilityToken.IndexProvider],
          areaServed: [COVERAGE_SCOPE, JURISDICTION],
          coverageScope: COVERAGE_SCOPE,
        }),
        publishedProviders: [
          buildDefaultPublishedProviderRecordFromTenant({
            hostAuthority: 'host-health-care.example.org',
            tenantId: 'acme-id',
            jurisdiction: JURISDICTION,
            version: VERSION,
            sector: DataspaceSectors.HealthCare,
            providerCapability: ServiceCapabilityToken.IndexProvider,
            areaServed: [COVERAGE_SCOPE, JURISDICTION],
            // Future optional public domain:
            // externalDomain: 'acme-health.example.org',
          }),
        ],
      },
      {
        ...buildDefaultHostingOperatorRegistrationFromAuthority({
          authority: 'host-health-research.example.org',
          jurisdiction: JURISDICTION,
          version: VERSION,
          networkType: NETWORK_TYPE,
          title: 'Health Research Host ES',
          sector: DataspaceSectors.HealthResearch,
          serviceTypes: [ServiceCapabilityToken.DigitalTwinProvider],
          areaServed: [COVERAGE_SCOPE, JURISDICTION],
          coverageScope: COVERAGE_SCOPE,
        }),
        publishedProviders: [
          buildDefaultPublishedProviderRecordFromTenant({
            hostAuthority: 'host-health-research.example.org',
            tenantId: 'acme-id',
            jurisdiction: JURISDICTION,
            version: VERSION,
            sector: DataspaceSectors.HealthResearch,
            providerCapability: ServiceCapabilityToken.DigitalTwinProvider,
            areaServed: [COVERAGE_SCOPE, JURISDICTION],
            // Future optional public domain:
            // externalDomain: 'acme-health.example.org',
          }),
        ],
      },
    ],
  },
});

// Ask for the hosts that can serve one sector in one jurisdiction.
const hosts = await discovery.getHosts({
  sector: DataspaceSectors.HealthCare,
  jurisdiction: JURISDICTION,
  coverageScope: COVERAGE_SCOPE,
  requiredCapabilities: [ServiceCapabilityToken.IndexProvider],
});

// Ask for published index providers for one sector in one jurisdiction.
const indexProviders = await discovery.getIndexProviders({
  sector: DataspaceSectors.HealthCare,
  jurisdiction: JURISDICTION,
  coverageScope: COVERAGE_SCOPE,
});

// Ask for published digital twin providers for one sector in one jurisdiction.
const digitalTwinProviders = await discovery.getDigitalTwinProviders({
  sector: DataspaceSectors.HealthResearch,
  jurisdiction: JURISDICTION,
  coverageScope: COVERAGE_SCOPE,
});
```

What each call does:

- `getHosts(...)`
  - returns the matching hosting operators from the configured defaults
- `getIndexProviders(...)`
  - starts from the matching default hosts for that `sector + jurisdiction`
  - then reads each selected host public catalog
  - returns published `IndexProvider` services
- `getDigitalTwinProviders(...)`
  - same flow, but returning published `DigitalTwinProvider` services

Important notes:

- the backend chooses `networkType`; the frontend should not need to know it
- the example uses `authority` such as a domain or IP as the primary input
  because that is usually what integrators know at startup
- the helpers derive `did:web` and `discoveryUrl` automatically
- nested `publishedProviders` can be seeded with `tenantId` when you want the
  portal/backend to work before depending on host catalog crawling
- `catalogUrl` is intentionally omitted from the startup seed because integrators
  normally do not need to know it up front
- `title` is available today for ICA and host defaults and can already help a
  portal/backend build selection DTOs
- `description`, `infoUrl`, and `termsUrl` are not part of the shared
  defaults-registry shape yet, so they are not shown in this copy/paste
  example
- the canonical host entrypoint is:
  `/host/cds-{jurisdiction}/{version}/${HostNetworkTypes.Test}/.well-known/dspace-version`
- the derived host catalog artifact is:
  `/host/cds-{jurisdiction}/{version}/${HostNetworkTypes.Test}/dsp/catalog/dcat.json`

Executable references:

- [`tests/101-dataspace-resolver.test.mjs`](../tests/101-dataspace-resolver.test.mjs)
- [`tests/dataspace-resolver.test.mjs`](../tests/dataspace-resolver.test.mjs)

## 7. Resolving hosting operators

Use `resolveHostingOperators(...)` when the backend needs to know which hosts
are eligible before resolving concrete providers.

```ts
const hosts = await resolver.resolveHostingOperators({
  sector,
  jurisdiction,
  requiredCapabilities: [ServiceCapabilityToken.IndexProvider],
});
```

This returns matching hosts only.

Because host resolution works from the semantic host record, an organization may
match if it advertises provider and/or reader capabilities depending on the
requested filter.

## 8. Resolving index providers

Use `resolvePublishedProviders(...)` with
`ServiceCapabilityToken.IndexProvider`.

```ts
const indexProviders = await resolver.resolvePublishedProviders({
  sector,
  jurisdiction,
  providerCapability: ServiceCapabilityToken.IndexProvider,
});
```

Use this when the backend needs a provider endpoint that can publish or manage
indexing capabilities.

This is the normal discovery path when an individual needs to choose an index
provider.

## 9. Resolving digital twin providers

Use `resolvePublishedProviders(...)` with
`ServiceCapabilityToken.DigitalTwinProvider`.

```ts
const digitalTwinProviders = await resolver.resolvePublishedProviders({
  sector,
  jurisdiction,
  providerCapability: ServiceCapabilityToken.DigitalTwinProvider,
});
```

Use this when the backend needs a provider endpoint for digital twin
generation.

## 10. Fallback policy

Fallback belongs in the optional injected Node `fetcher`, not inside business code that
calls the resolver.

Recommended policy:

1. try internet
2. if internet discovery succeeds, refresh cache and return fresh catalog
3. if internet discovery fails, return last known good cached catalog when available
4. if cache is unavailable, return a configured default catalog
5. always record whether the result came from:
   - `network`
   - `cache`
   - `default`

This keeps the resolver contract stable while letting each backend choose its
own operational behavior.

## 11. How callers know fallback happened

`HttpDataspaceResolver` currently returns discovery matches only.

It does not return fetch metadata.

Because of that, the integration should track fallback state outside the
resolver.

Typical approaches:

- structured logs
- metrics counters
- per-catalog in-memory status map
- wrapper service that returns:
  - `results`
  - `source`
  - `lastError`

The important rule is:

fallback must not be invisible operationally, even if it is transparent
functionally.

## 12. Cache policy

Cache also belongs to the integrator.

Recommended cache entry shape:

```ts
type CachedCatalogEntry = Readonly<{
  catalogUrl: string;
  catalog: HostingOperatorDiscoveryCatalog;
  fetchedAt: number;
  expiresAt: number;
  source: 'internet' | 'cache' | 'default';
  lastError?: string;
}>;
```

Recommended behavior:

- short TTL for successful network responses
- shorter retry window for errors
- `stale-if-error` support
- default catalog only when neither network nor prior cache is available

## 13. Default catalogs

Default catalogs should also use shared types.

A default catalog must still be a valid `HostingOperatorDiscoveryCatalog`.

That means:

- no ad hoc local shape
- no custom fallback-only schema
- no capability strings inline

When the backend needs to construct defaults programmatically, prefer the
neutral builders from `gdc-common-utils-ts/utils/dataspace-discovery`:

- `buildDefaultPublishedProviderCatalogRecord(...)`
- `buildDefaultHostingOperatorDiscoveryCatalog(...)`

Those builders are intended for backend-owned fallback/default discovery data.
They are not example fixtures.

## 14. Test expectations for integrators

A backend integration test should verify at least these scenarios:

1. resolves hosting operators by jurisdiction and capability
2. resolves `IndexProvider` by jurisdiction
3. resolves `DigitalTwinProvider` by jurisdiction
4. excludes reader-only entries from individual provider selection
5. filters mixed `animal-care` and `health-care` catalogs by sector
6. uses only `EU` and EU country examples such as `ES` and `PT` in the 101 suite
7. uses network response when available
8. uses cached catalog when network later fails
9. uses configured default when network fails and cache is empty

## 15. Source of truth

Use shared examples and shared contracts as the only source of truth for test
data and capability strings.

If a new shared type is needed, add it to `gdc-common-utils-ts` first.

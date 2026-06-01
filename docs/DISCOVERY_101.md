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

Typical default-first initialization looks like this:

```ts
import { HttpDataspaceResolver } from 'gdc-sdk-node-ts';
import {
  DataspaceDiscoverySourceMode,
  DataspaceSectors,
  ServiceCapabilityToken,
  createDataspaceDiscoveryDefaultsRegistry,
} from 'gdc-common-utils-ts';
import { HostNetworkTypes } from 'gdc-common-utils-ts/constants/network';
import { buildExampleHostingOperatorCredentialSubject } from 'gdc-common-utils-ts/examples/dataspace-discovery';
import { extractHostingOperatorSemanticRecord } from 'gdc-common-utils-ts/utils/dataspace-discovery';

const defaults = createDataspaceDiscoveryDefaultsRegistry({
  icas: [{
    jurisdiction: 'ES',
    version: 'v1',
    networkType: HostNetworkTypes.Test,
    icaUrl: 'https://ica.example.org/.well-known/ica-configuration',
    icaDid: 'did:web:ica.example.org',
  }],
  hostingOperators: [
    buildHost('did:web:host-health-care.example.org', DataspaceSectors.HealthCare),
    buildHost('did:web:host-health-research.example.org', DataspaceSectors.HealthResearch),
    buildHost('did:web:host-animal-care.example.org', DataspaceSectors.AnimalCare),
    buildHost('did:web:host-animal-research.example.org', DataspaceSectors.AnimalResearch),
  ],
});

const bootstrapPlan = defaults.buildBootstrapPlan({
  jurisdiction: 'ES',
  version: 'v1',
  networkType: HostNetworkTypes.Test,
  sector: DataspaceSectors.HealthCare,
  coverageScope: 'EU',
  requiredCapabilities: [ServiceCapabilityToken.IndexProvider],
  sourceMode: DataspaceDiscoverySourceMode.DefaultFirst,
});

const resolver = new HttpDataspaceResolver({
  hostingOperators: bootstrapPlan.hostingOperators,
});

const hosts = await resolver.resolveHostingOperators({
  sector: DataspaceSectors.HealthCare,
  jurisdiction: 'ES',
  coverageScope: 'EU',
  requiredCapabilities: [ServiceCapabilityToken.IndexProvider],
});

function buildHost(operatorDid: string, sector: string) {
  const hostName = operatorDid.replace('did:web:', '');
  return {
    jurisdiction: 'ES',
    version: 'v1',
    networkType: HostNetworkTypes.Test,
    operatorDid,
    discoveryUrl: `https://${hostName}/host/cds-ES/v1/test/.well-known/dspace-version`,
    catalogUrl: `https://${hostName}/host/cds-ES/v1/test/dsp/catalog/dcat.json`,
    record: extractHostingOperatorSemanticRecord({
      credentialSubject: buildExampleHostingOperatorCredentialSubject({
        did: operatorDid,
        serviceTypes: [ServiceCapabilityToken.IndexProvider],
        categories: [sector],
        areaServed: ['EU', 'ES'],
      }),
    }),
  };
}
```

Where:

- `bootstrapPlan.hostingOperators` is the preloaded list of normalized hosting
  operators for the current request
- `bootstrapPlan` is the current `default-first` plan returned by
  `gdc-common-utils-ts`
- `fetcher` is optional if you also need live HTTP discovery fallback
- when omitted, `HttpDataspaceResolver` uses `globalThis.fetch` from the Node runtime
- inject `discoveryFetch` only when you need transport control such as tests,
  retries, cache/default fallback, custom agents, or extra observability
- the canonical host entrypoint is the participant-scoped DSP well-known URL:
  `/host/cds-{jurisdiction}/{version}/${HostNetworkTypes.Test}/.well-known/dspace-version`
- the read-only catalog artifact is derived from the advertised DSP base path:
  `/host/cds-{jurisdiction}/{version}/${HostNetworkTypes.Test}/dsp/catalog/dcat.json`
- tenant/provider discovery URLs should normally look like:
  `/{tenantId}/cds-{jurisdiction}/{version}/{businessSector}/.well-known/dspace-version`

Executable references:

- [`tests/dataspace-resolver.101.test.mjs`](../tests/dataspace-resolver.101.test.mjs)
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

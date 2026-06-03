# Discovery 101 for Node Backends

This guide is intentionally short.

Teaching rule for this `101`:

- start from the simplest backend discovery surface first
- explain one discovery strategy at a time
- keep advanced resolver details at the end

If you are integrating discovery for the first time, copy one of these two
tests and stop there:

1. `default-first`
2. `HttpDataspaceResolver`

## 1. Start here: `default-first`

Use `default-first` when your backend already knows:

- one ICA default
- one or more hosting operator defaults

This is the simplest portal/backend setup.

Open this test first:

- [`tests/101-default-first-dataspace-discovery.test.mjs`](../tests/101-default-first-dataspace-discovery.test.mjs)

That 101 shows:

- one ICA default
- one host default
- one published `IndexProvider`
- one call to `getHosts(...)`
- one call to `getIndexProviders(...)`

The mental model is:

1. configure defaults once at backend startup
2. create the discovery facade once
3. ask for hosts or providers by `sector + jurisdiction`

## 2. Next: `HttpDataspaceResolver`

Use `HttpDataspaceResolver` when the backend must:

- start from a hosting operator semantic record
- fetch the host `/.well-known/dspace-version`
- fetch the host public catalog
- return matching published providers

Open this test next:

- [`tests/101-dataspace-resolver.test.mjs`](../tests/101-dataspace-resolver.test.mjs)

That 101 shows:

- one hosting operator semantic record
- one host DSP version document
- one host public catalog
- one published `IndexProvider`

The mental model is:

1. preload hosting operator records
2. build the resolver
3. let it fetch DSP metadata and the host catalog
4. ask for published providers by `sector + jurisdiction`

## 3. Provider vs reader

For normal user-facing discovery, use provider capabilities:

- `ServiceCapabilityToken.IndexProvider`
- `ServiceCapabilityToken.DigitalTwinProvider`

Do not treat reader-only capabilities as selectable published providers in that
flow.

## 4. Technical path rule

For host discovery routes, use `networkType` in the path, not business sector.

Examples:

- `HostNetworkTypes.Test`
- `HostNetworkTypes.TestNetwork`
- `HostNetworkTypes.Network`

## 5. Advanced references

The 101 files are for copy/paste onboarding only.

If you need more cases, use these as advanced references:

- [`tests/dataspace-resolver-advanced.test.mjs`](../tests/dataspace-resolver-advanced.test.mjs)
- [`tests/dataspace-resolver.test.mjs`](../tests/dataspace-resolver.test.mjs)

Those cover:

- multiple hosts
- multiple jurisdictions
- reader vs provider filtering
- fetcher-level fallback and cache harnesses

## 6. Shared builders only

Reuse shared builders and fixtures from `gdc-common-utils-ts`.

The 101 tests already do that. Copy their imports instead of rebuilding
discovery DTOs by hand.

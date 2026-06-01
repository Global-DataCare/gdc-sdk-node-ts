# Dataspace Resolver Notes

Version:
- Planned runtime release: `0.6.0`
- Depends on: `gdc-common-utils-ts@1.12.0`
- Branch baseline: `feat/dataspace-discovery-foundation`
- Date: `2026-05-29`

## Purpose

This document defines the node-runtime discovery contract that must sit on top
of the semantic/common parsing added in `gdc-common-utils-ts`.

The node package is the place for the backend/BFF-facing resolver abstraction.
It must not redefine Schema.org parsing rules already owned by common-utils.

Status:

- `src/discovery/DataspaceResolver.ts`
- `src/discovery/types.ts`
- `src/discovery/index.ts`
- `tests/dataspace-resolver.test.mjs`
- `tests/dataspace-resolver.101.test.mjs`

The items below are kept as design notes and maintenance guidance for the
implemented resolver.

## Public API

Add a new discovery module under:

- `src/discovery/DataspaceResolver.ts`
- `src/discovery/types.ts`
- `src/discovery/index.ts`

Expected public surface:

- `abstract class DataspaceResolver`
- `type ResolveHostingOperatorsInput`
- `type ResolvePublishedProvidersInput`
- `type HostingOperatorMatch`
- `type PublishedProviderMatch`

Required methods:

- `resolveHostingOperators(input)`
- `resolvePublishedProviders(input)`

## Resolution Rules

### resolveHostingOperators(input)

Input dimensions:

- `sector`
- `requiredCapabilities`
- optional `jurisdiction`
- optional `coverageScope`

Behavior:

- uses semantic parsing from `gdc-common-utils-ts`
- reads hosting-operator VC content or preloaded semantic DTOs
- filters by sector from `category`
- filters by capability from `serviceType`
- filters by country/coverage from `address.addressCountry` and `areaServed`

### resolvePublishedProviders(input)

Input dimensions:

- `sector`
- `providerCapability`
- optional `jurisdiction`
- optional `coverageScope`

Behavior:

- starts from eligible hosting operators
- loads each host public catalog
- resolves only published provider offerings
- excludes reader-only capabilities
- returns records ready for portal/BFF consumption

## JSDoc To Generate

Required JSDoc targets:

- `DataspaceResolver`
- all public input/output DTOs
- every constructor or factory added around resolver dependencies

Each JSDoc block must state:

- node-runtime responsibility
- dependency on common-utils semantic parsing
- default integration path: backend/BFF
- note that tenant-host linkage is resolved from host catalogs, not tenant VCs

## Tests

Coverage minimum:

- hosting-operator filtering by capability and sector
- provider resolution through host catalogs
- exclusion of `IndexReader` and `DigitalTwinReader` from published providers
- country-to-coverage filtering via common-utils EU helper

## Example DTO Rules

Do not hardcode production identities in test fixtures or docs.

Allowed examples:

- `did:web:host.example.org`
- `did:web:provider.example.org`
- `https://host.example.org/host/cds-ES/v1/test/.well-known/dspace-version`
- `https://host.example.org/host/cds-ES/v1/test/dsp/catalog/dcat.json`

Avoid:

- real company names
- real tax IDs
- real deployment domains

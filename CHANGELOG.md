# Changelog

All notable changes to this project will be documented in this file.

## [0.9.1] - 2026-06-11

### Changed
- Updated shared dependency targets to:
  - `gdc-common-utils-ts@^1.20.1`
  - `gdc-sdk-core-ts@^0.9.1`

### Testing
- `npm run build`

## [0.9.0] - 2026-06-10

### Changed
- Updated shared dependency targets to:
  - `gdc-common-utils-ts@^1.20.0`
  - `gdc-sdk-core-ts@^0.9.0`
- Reworked the node discovery layer into a thin compatibility facade that
  re-exports the shared dataspace discovery implementation from
  `gdc-sdk-core-ts`.
- Clarified in the README and `docs/101-DISCOVERY.md` that the canonical GW
  hosting discovery entrypoint is the contextualized hosting-operator
  `/.well-known/dspace-version` URL, not the host root.
- Clarified that the host-scoped GW path segment represents
  `hostCoverageScope + networkType`, not the host legal jurisdiction.

### Testing
- `node --test tests/101-dataspace-resolver.test.mjs tests/101-default-first-dataspace-discovery.test.mjs tests/dataspace-resolver.test.mjs tests/dataspace-resolver-advanced.test.mjs`
- `npm run build`

## [0.8.2] - 2026-06-04

### Changed
- Updated shared dependency targets to:
  - `gdc-common-utils-ts@^1.17.0`
  - `gdc-sdk-core-ts@^0.8.2`

### Testing
- `npm run type-check`
- `npm test`

## [0.8.1] - 2026-06-04

### Changed
- Updated shared dependency targets to:
  - `gdc-common-utils-ts@^1.16.0`
  - `gdc-sdk-core-ts@^0.8.1`
- Tightened node actor-facade enforcement so:
  - `OrganizationControllerSdk` keeps only controller-scoped employee flows
  - `IndividualControllerSdk` enforces consent, ingestion, related-person, and
    digital-twin capabilities
  - `OrganizationEmployeeSdk` enforces its own runtime capabilities
- Updated node actor-session bridge tests to stay aligned with the expanded
  capability split defined in `sdk-core`.

### Testing
- `node --test tests/gdc-session-bridge.test.mjs tests/orchestration.test.mjs`
- `npm run build`

## [0.8.0] - 2026-06-04

### Changed
- Updated shared dependency targets to:
  - `gdc-common-utils-ts@^1.16.0`
  - `gdc-sdk-core-ts@^0.8.0`
- Kept the node runtime aligned with the new shared entry-level employee
  editing model exposed by `sdk-core`.

### Testing
- `npm run build`

## [0.7.0] - 2026-06-04

### Changed
- Updated shared dependency targets to:
  - `gdc-common-utils-ts@^1.15.0`
  - `gdc-sdk-core-ts@^0.7.0`
- Kept the node runtime aligned with the new shared bundle-editing foundation
  used by the employee flow in `sdk-core`.

### Testing
- `npm run build`

## [0.6.6] - 2026-06-02

### Changed
- Updated shared dependency targets to:
  - `gdc-common-utils-ts@^1.14.10`
  - `gdc-sdk-core-ts@^0.6.9`
- Clarified the backend discovery and live GW runtime examples around the
  current default-first and IPS ingestion flows.
- Extended the live GW runtime coverage so the backend example path can ingest
  and validate two medication statements coming from two different IPS bundle
  communications.

### Testing
- `npm test`
- `npm run build`

## [0.6.4] - 2026-06-01

### Changed
- Simplified the `default-first` discovery docs further so integrators seed
  defaults from:
  - ICA authority/domain
  - host authority/domain
  - published provider `tenantId` nested under each host
- Updated the shared dependency target to `gdc-common-utils-ts@^1.14.3` so the
  node runtime can use the new authority-based and tenant-based discovery
  builders.

### Testing
- `npm run type-check`
- `npm test`

## [0.6.3] - 2026-06-01

### Added
- Added a high-level default-first discovery facade for portal/backend usage:
  - `createDefaultFirstDataspaceDiscovery(...)`
  - `DefaultFirstDataspaceDiscovery`
  - `getHosts({ sector, jurisdiction, ... })`
  - `getIndexProviders({ sector, jurisdiction, ... })`
  - `getDigitalTwinProviders({ sector, jurisdiction, ... })`
- Added executable 101 coverage in:
  - `tests/101-default-first-dataspace-discovery.test.mjs`

### Changed
- Rewrote `docs/101-DISCOVERY.md` so the primary integration path is the
  simple portal/backend API rather than the lower-level bootstrap plumbing.
- Updated `README.md` to point integrators at the new default-first discovery
  facade and 101 test.

### Testing
- `npm run type-check`
- `npm test`

## [0.6.1] - 2026-06-01

### Changed
- Updated shared dependency targets to:
  - `gdc-common-utils-ts@^1.14.0`
  - `gdc-sdk-core-ts@^0.6.1`
- Kept the node resolver/docs aligned with the shared `default-first`
  bootstrap guidance added in `gdc-common-utils-ts`.

### Testing
- `npm test`

## [0.6.0] - 2026-05-29

### Added
- Added the first backend/BFF-facing dataspace discovery runtime surface:
  - `src/discovery/DataspaceResolver.ts`
  - `src/discovery/types.ts`
  - `src/discovery/index.ts`
- Added public root exports for the dataspace discovery abstraction.
- Added focused resolver tests covering:
  - hosting-operator resolution contract specialization
  - published-provider resolution contract specialization

### Changed
- Updated the shared dependency targets to:
  - `gdc-common-utils-ts@^1.13.0`
  - `gdc-sdk-core-ts@^0.6.0`
  so the
  node runtime can consume the new dataspace discovery semantic DTOs and EU
  coverage helpers.
- Updated `TODO.md` and `docs/101-DISCOVERY.md` to document the staged
  implementation path:
  - common-utils semantic parsing first
  - node resolver orchestration second
  - host catalog publication later in gateway/ICA repos
- Clarified that the resolver `fetcher` dependency is optional and defaults to
  the Node runtime `globalThis.fetch`, while remaining injectable for tests,
  fallback/cache, and transport control.

### Testing
- `npm test -- tests/dataspace-resolver.test.mjs`

## [0.5.2] - 2026-05-28

### Changed
- Updated shared dependency target to `gdc-common-utils-ts@^1.11.0`.
- Clarified backend onboarding documentation around `Organization.hasCredential.material`, `Person.hasCredential.material`, and `SoftwareApplication.material`, including RFC 7638 / RFC 9278 key-id guidance.

### Testing
- `npm test`

## [0.5.2] - 2026-05-28

### Changed
- Updated `docs/101-SDK_END_TO_END.md` so legal-organization and
  software-application trust examples explain the key-binding semantics for:
  - `Organization.hasCredential.material`
  - `Person.hasCredential.material`
  - `SoftwareApplication.material`
- Clarified RFC 7638 JWK thumbprints and RFC 9278 URN representation in the
  backend onboarding/bootstrap narrative.
- Updated the shared `101-VP_TOKEN.md` link to GitHub.

## [0.5.1] - 2026-05-27

### Changed
- Updated shared dependency targets to:
  - `gdc-common-utils-ts@^1.10.0`
  - `gdc-sdk-core-ts@^0.5.1`
- Clarified onboarding capability examples to use the clearer `IndexProvider`
  / `IndexReader` naming.
- Clarified runtime bootstrap documentation around mockable
  `SoftwareApplication` VC input versus optional compact `runtimeVpToken`
  reuse in demo/bootstrap mode.

### Testing
- `npm test`

## [0.3.3] - 2026-05-27

### Changed
- Clarified `docs/101-SDK_END_TO_END.md` so host onboarding examples separate:
  - tenant business sector
  - legacy `HostRouteContext.sector` naming
  - host trust/network selection semantics
- Added explicit runtime-proof guidance for ICA-issued software/runtime
  `vp_token` usage during SDK initialization.
- Extended `NodeHttpClient` so `runtimeVpToken` can be wired as the default
  `Authorization: Bearer ...` value in demo/compat deployments when no explicit
  transport bearer is provided.

### Testing
- `npm test`

## [0.3.2] - 2026-05-26

### Changed
- Reduced `docs/101-SDK_INTEGRATION.md` from a duplicated tutorial into a short runtime/API map that points beginners to `docs/101-SDK_END_TO_END.md` for the full copy/paste flow.
- Kept the integration guide focused on:
  - package/facade selection
  - method-to-flow mapping
  - shared builder references
  - contract notes and discovery status

### Testing
- Doc-only change; no runtime surface change.

## [0.3.1] - 2026-05-26

### Changed
- Updated the public host/professional activation surface so `activateOrganizationInGatewayFromIcaProof(...)` documents the typed `service` activation block instead of a reduced inline shape.
- Aligned onboarding docs with the canonical activation naming and capability rules:
  - `organizationActivation` as the example variable name
  - legal-organization activation always includes `service.url` and `service.capabilities`
- Updated dependency targets to `gdc-common-utils-ts@^1.7.0` and `gdc-sdk-core-ts@^0.3.2`.

### Testing
- `npm run build`
- `npm test`

## [0.3.0] - 2026-05-25

### Changed
- Switched published runtime imports from workspace-relative `../../gdc-sdk-core-ts/dist/...` paths to the package import `gdc-sdk-core-ts`, so the npm artifact works outside the monorepo checkout.
- Aligned shared dependencies to `gdc-common-utils-ts@^1.6.0` and `gdc-sdk-core-ts@^0.3.0`.
- Kept the SDK documentation linked to the canonical shared lifecycle and `101` docs instead of package-local duplicated examples.

### Testing
- `npm run build` passes.
- `npm test` passes.

## [0.2.1] - 2026-05-24

### Changed
- Updated README and `101-SDK_INTEGRATION.md` to document the shared consent-access model, missing-permission evaluation flow, canonical permission-request `Communication`, and subject-scoped lookup by identifier, thread id, or linked CID.

### Testing
- `npm run type-check` passes after the consent-access documentation and re-export alignment.

## 0.2.0 - 2026-05-23

### Added
- Promoted the node runtime alignment with shared bootstrap, VP, SMART, and activation contracts to the first minor release line.
- Added live GW trace support, canonical host activation/controller binding flow coverage, and owner-vs-legal-representative documentation updates.

### Changed
- Aligned the shared dependency to `gdc-common-utils-ts@^1.5.0`.
- Kept the neutral runtime naming (`ActorSession`, `RuntimeClient`, etc.) while preserving legacy aliases for migration.

### Testing
- `npm test` passes against the packaged `gdc-common-utils-ts` artifact, with live GW tests kept as explicit opt-in.

## 0.1.2 - 2026-05-21

### Added
- Expanded TDD coverage for lifecycle-oriented node helpers and facades, including create/update/search flows, polling not-found and timeout paths, direct-client versus fallback submit-and-poll orchestration, and missing-data handling in device activation and SMART token exchanges.
- SDK contract examples are now consumed from `gdc-common-utils-ts/examples` instead of package-local test fixtures.

### Changed
- Added temporary legacy compatibility exports in `legacy-compat.ts` so downstream packages still importing legacy `Gdc*` symbols and `*Simple*` helpers can run while migrating.
- Kept `NodeHttpClient` focused on generic runtime transport/orchestration concerns.
- README, `101-SDK_INTEGRATION.md`, and JSDoc now point to shared request/response contract examples in `gdc-common-utils-ts`.

## 0.1.1 - 2026-05-20

### Changed
- Removed `Gdc` prefixes from Node runtime public surface and aligned imports with renamed core contracts.
- Rebuilt runtime artifacts so `dist` matches the neutral naming used in `src`.
- Rebased Node clinical search/channel typing on core contracts to reduce drift:
  - `CommunicationIngestionInput.communicationPayload` now uses core `CommunicationInput`
  - `ClinicalDateRange` now aliases core `DateRange`
  - `ClinicalBundleSearchInput` now derives from core `BundleSearchQuery` (keeping Node-only polling/request extensions)
- Removed `Simple` suffixes from public runtime contracts/methods where names are already explicit:
  - `GrantProfessionalAccessInput/Result`, `grantProfessionalAccess(...)`, `grantProfessionalAccessWithDeps(...)`
  - `SmartTokenRequestInput`, `requestSmartToken(...)`, `requestSmartTokenWithDeps(...)`
  - `IndividualOrganizationBootstrapInput`, `IndividualOrganizationStartResult`, `startIndividualOrganization(...)`, `startIndividualOrganizationWithDeps(...)`
  - `IndividualOrganizationConfirmOrderInput`, `confirmIndividualOrganizationOrder(...)`, `confirmIndividualOrganizationOrderWithDeps(...)`
  - `LegalOrganizationOrderInput`, `confirmLegalOrganizationOrder(...)`, `confirmLegalOrganizationOrderWithDeps(...)`
  - `EmployeeDeviceActivationRequestInput`, `activateEmployeeDeviceWithActivationRequest(...)`, `activateEmployeeDeviceWithActivationRequestWithDeps(...)`
  - `resolvePollOptionsFromSeconds(...)`
- Renamed internal module filenames to remove `simple-*` path names:
  - `simple-poll-options.ts` -> `poll-options.ts`
  - `simple-smart-token.ts` -> `smart-token.ts`
  - `simple-individual-start.ts` -> `individual-start.ts`
  - `simple-individual-onboarding.ts` -> `individual-onboarding.ts`
  - `simple-host-onboarding.ts` -> `host-onboarding.ts`
  - `simple-device-activation.ts` -> `device-activation.ts`
  - matching test file renames under `tests/`
- Moved neutral polling contracts to `gdc-sdk-core-ts` and consume/re-export them from node runtime seams:
  - `SubmitPayload`, `AsyncPollRequest`, `SubmitResponse`, `PollOptions`, `PollResult`, `SubmitAndPollResult`
- `poll-options.ts` now reuses core `resolvePollOptionsFromSeconds(...)` implementation.

### Testing
- `npm run type-check` passes.
- `npm run build` passes.

## 0.1.0 - 2026-05-18

### Added
- Created `gdc-sdk-node-ts` as the target Node runtime package in the converged `gdc-*` SDK family.
- Added `GdcNodeActorSession` as the first Node-side runtime session primitive.
- Added Node bridge helpers:
  - `createNodeActorSessionsFromDescriptor`
  - `createNodeActorSessionsFromFacades`
  - `createNodeActorSessionFromFacade`
- Wired the package to consume actor/capability contracts from `gdc-sdk-core-ts`.
- Added first runtime orchestration layer in the target package:
  - `GdcHostOnboardingSdk`
  - `GdcOrganizationControllerSdk`
  - `GdcOrganizationEmployeeSdk`
  - `GdcIndividualControllerSdk`
  - `GdcIndividualMemberSdk`
  - `GdcProfessionalSdk`
- Added `GdcNodeRuntimeClient` as the migration seam between the legacy SDK implementation and the new runtime package.
- Added shared polling/runtime types and `submitAndPollWithClient` / `submitAndPollWithMethods` helpers so actor facades can depend on a package-owned async orchestration primitive instead of legacy inline implementation.
- Added `resolveSimplePollOptions` as the converged seconds-to-milliseconds helper for simple runtime flows.
- Added target-package helpers for simple onboarding order confirmations:
  - `confirmLegalOrganizationOrderSimpleWithDeps`
  - `confirmIndividualOrganizationOrderSimpleWithDeps`
- Added `startIndividualOrganizationSimpleWithDeps` as the converged explicit registration step for individual/family onboarding.
- Added `requestSmartTokenSimpleWithDeps` as converged runtime helper for SMART token exchange and `openid-smart` token acquisition.
- Added `activateEmployeeDeviceWithActivationCodeWithDeps` and `activateEmployeeDeviceWithActivationCodeSimpleWithDeps` as converged runtime helpers for exchange + DCR device activation.
- Added converged resource-operation helpers for:
  - organization employee creation
  - IPS/FHIR import
  - RelatedPerson upsert
  - Communication ingestion
  - professional access consent grant
  - digital twin generation
- Added `.gitignore` with `test-results/` excluded from git.
- Added first live GW E2E suite in `tests/live-gw-node-runtime.e2e.test.mjs`.
- Added `test:e2e:live-gw` script and JSONL artifact convention for:
  - `test-results/live-gw-node-runtime-debug-*.jsonl`
  - `test-results/live-gw-http-trace-*.jsonl`
- Added `confirmIndividualOrganizationOrderSimple` to the `GdcNodeRuntimeClient` seam and `GdcIndividualControllerSdk` facade.

### Changed
- Node-side actor session creation now defensively filters capabilities per actor, even when a facade is manually over-populated.
- Node actor-scoped facades now resolve `submitAndPoll` through the target runtime helper, falling back to `submitBatch + pollUntilComplete` when the runtime client does not implement `submitAndPoll` directly.
- Node runtime ownership now includes simple polling option normalization and canonical order-confirmation payload construction for both host legal onboarding and family/individual order confirmation.
- Node target facades now expose `startIndividualOrganizationSimple` as an explicit E2E-faithful onboarding step while continuing to exclude `bootstrapIndividualOrganizationSimple`.
- Removed `bootstrapIndividualOrganizationSimple` from the target Node actor-facade surface; it remains legacy compatibility only in `dataspace-client-sdk-node`.
- Node target runtime now owns explicit post-onboarding steps for SMART token acquisition and device activation.
- Node target runtime now owns most explicit business operations previously concentrated in `dataspace-client-sdk-node/src/client.ts`, leaving the legacy package increasingly as transport/path compatibility.

### Security
- Documented `dataspace-client-sdk-node` as a legacy migration source, not the final package target.
- Established the rule that actor-scoped Node sessions must never inherit foreign capabilities from a malformed facade descriptor.

### Testing
- Added package-level tests for:
  - Family descriptor expansion into scoped node sessions
  - defensive filtering of facade capabilities
  - actor facade delegation through `GdcNodeRuntimeClient`
  - actor-session materialization of role-scoped facades
  - `submitAndPoll` fallback through `submitBatch + pollUntilComplete`
  - canonical legal-order and family-order simple helper payload generation
  - canonical SMART token and device activation helper flows
  - canonical employee/consent/ingestion/digital-twin helper flows
  - migration target status
  - first live GW validation of actor-scoped facades through `GdcNodeActorSession`

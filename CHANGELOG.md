# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed
- Updated README and `SDK_INTEGRATION_101.md` to document the shared consent-access model, missing-permission evaluation flow, canonical permission-request `Communication`, and subject-scoped lookup by identifier, thread id, or linked CID.

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
- README, `SDK_INTEGRATION_101.md`, and JSDoc now point to shared request/response contract examples in `gdc-common-utils-ts`.

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

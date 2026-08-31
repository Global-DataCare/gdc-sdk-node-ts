# 101 Profile Orchestration Map

> 101 note
> - Teach here: the highest-level `sdk-node` actor/profile/runtime surface after shared authoring in `gdc-common-utils-ts`.
> - Reuse lower-layer contracts from `sdk-core` and `common-utils` instead of re-teaching raw claims or low-level editors.
> - The runtime story is `loadProfile(...) -> workspace/session -> actor facade -> submit/poll`; the lower-layer payload path remains document `Bundle` with `Composition` first -> `Communication` -> DIDComm/plain, and backend search stays on FHIR params such as `Composition.section`.
> - Read [101-README.md](./101-README.md) for the ordered path and keep actor role plus submit/poll explicit.


## Purpose

This repo should not re-teach every editor/builder already documented in
`gdc-common-utils-ts`.

The job of `gdc-sdk-node-ts` `101` tests is different:

- show how one protected profile is loaded and unlocked
- show how one loaded workspace/session exposes one role facade
- show how several role profiles depend on each other in one real lifecycle
- reuse the shared high-level editors/readers from `gdc-common-utils-ts`
- keep frontend/web, backend/BFF, and other systems aligned on the same
  programming model

Canonical top-level contract:

`ProfileRuntime -> loadProfile(...) -> workspace/session -> actor facade -> submit/poll`

Naming rule:

- keep `ProfileRuntime` as the public name for the unlocked user profile flow
- keep runtime-specific naming in the injected adapters or factories
- keep tenant/service wallets separate from the end-user profile runtime

Important reading order:

- new integrators should start from public actor SDKs first
- this document is a technical orchestration map for runtime/profile slices
- do not treat `BackendProfileRuntime` or `IndividualControllerBackendRuntime`
  as the first app-facing API to teach

Public actor surfaces to teach first:

- `HostOnboardingSdk`
- `OrganizationControllerSdk`
- `OrganizationEmployeeSdk`
- `IndividualControllerSdk`
- `IndividualMemberSdk`
- `PersonalSdk`
- `ProfessionalSdk`

## Layer rule

- `gdc-common-utils-ts`
  Owns the canonical step-by-step editors/readers, viewers, search helpers,
  and semantic examples.
- `gdc-sdk-core-ts`
  Owns neutral actor/sector facade contracts.
- `gdc-sdk-node-ts`
  Owns runtime orchestration for BFF/backend:
  profile loading, route binding, submit/poll, and actor-to-actor lifecycle.

## Common-Utils 101 Map

These tests already explain the high-level building blocks. Node/backend `101`
tests should reuse their authoring surface instead of rebuilding claim maps.

### Individual / family onboarding

- `gdc-common-utils-ts/__tests__/101-individual-onboarding-claims.test.ts`
- Main helper surface:
  - `createIndividualOnboardingEditor()`
  - `mergeIndividualOrganizationClaims(...)`
- Use from node/BFF when:
  - one controller/assistant collects KYC + missing form fields
  - one backend needs final individual onboarding claims before transport

### Legal organization onboarding

- `gdc-common-utils-ts/__tests__/101-legal-organization-onboarding-editor.test.ts`
- Main helper surface:
  - `createLegalOrganizationOnboardingEditor()`
  - `buildDraft()`
  - `buildGatewayVerificationRequest(...)`
  - `buildGatewayActivationRequest(...)`
- Use from node/BFF when:
  - one organization controller or portal builds tenant activation requests

### Employee lifecycle and directory

- `gdc-common-utils-ts/__tests__/101-employee-examples.test.ts`
- Main helper surface:
  - `buildExampleEmployeeClaims(...)`
  - `buildEmployeeBatchEntry(...)`
  - `buildEmployeeSearchBundle(...)`
  - `buildEmployeePurgeBundle(...)`
  - `readEmployeeSearchResults(...)`
  - `findEmployeeSearchResult(...)`
- Use from node/BFF when:
  - one organization controller creates, lists, disables, or purges employees
  - one shared email maps to several active technical employee profiles
  - lifecycle cleanup should first read the current employee `resourceId`
    from create/search results, then call disable/purge with that technical id
    while preserving the exportable employee `identifier` in claims

### Vital signs / add clinical data

- `gdc-common-utils-ts/__tests__/101-vital-sign-entry-editor.test.ts`
- Main helper surface:
  - `new BundleEditor().newEntry().asVitalSign()...`
  - `asObservation()...`
- Use from web/expo/BFF when:
  - one controller or assistant captures a new vital sign
  - one app wants chainable `get/set` editing instead of hand-building FHIR claims

Guidance for high-frequency measurements:

- do not force every smartwatch/device reading onto blockchain immediately
- group measurements into a day-level or session-level vital-signs batch first
- project that batch into the IPS when the user, professional, or system
  decides it is meaningful
- anchor the batch hash/CID on-chain only when the bundle becomes a committed
  clinical artifact, using the ledger certification path instead of the
  Communication indexing path
- individual `Observation` samples remain the atomic facts, but the day-level
  batch is the atomic transport and certification unit
- if the same actor has several day batches, treat the full set as a
  collection of atomic batch artifacts, similar to consent or appointment
  bundles

### Consent authoring

- `gdc-common-utils-ts/__tests__/101-consent-template-bundle-editor.test.ts`
- Main helper surface:
  - `resolvePermissionTemplate(...)`
  - `importPermissionTemplate(...)`
  - `createConsentAccessEditor(...)`
  - `exportConsentClaims(...)`
- Use from node/BFF when:
  - one controller grants or revokes professional access
  - one app must persist and reopen consent entries for editing

### Invoice / administrative employee actions

- `gdc-common-utils-ts/__tests__/101-invoice-claims.test.ts`
- Main helper surface:
  - `createInvoiceBundleEditor()`
  - invoice getters such as `getInvoiceIdentifier(...)`
  - charge-item getters such as `getChargeItemList(...)`
- Use from node/BFF when:
  - one non-clinical employee role prepares billing/invoice payloads
  - one app needs administrative flows separate from SMART/clinical access

## Profile-Oriented Story

This is the intended runtime story across channels.

### 1. Organization controller profile

Use one protected organization-controller profile to:

- inspect contracted license seats
- inspect commercial offers/orders
- create employee profiles
- search employees by email/identifier/role
- disable/purge employees
- disable/purge the tenant after all descendants are already cleaned up

Common-utils inputs usually reused here:

- legal-organization onboarding editor
- employee examples/builders/readers
- invoice editor for administrative employee workflows

### 2. Individual controller profile

Use one protected individual-controller profile to:

- resume or create the family/individual registration
- choose one managed profile from a neutral list
- inspect consent summaries and clinical summaries
- add new clinical data through editors
- grant/revoke professional access
- disable/purge the individual after cleanup

Common-utils inputs usually reused here:

- individual onboarding editor/claims merger
- consent template bundle editor
- vital-sign / observation entry editors
- clinical bundle viewers/summaries

### 3. Professional profile

Use one protected professional profile to:

- present employee proof / obtain SMART token
- search the latest IPS/clinical bundle via FHIR params such as `Composition.section`
- render section summaries, XHTML, and section counts
- respect consent/role-based denial when scopes do not match

Common-utils inputs usually reused here:

- professional SMART examples
- employee examples for role identity disambiguation
- clinical viewers and bundle summary helpers

## Channel interpretation

The actor story above is the same for all channels.

### Frontend / web / Expo

- captures form fields
- captures PIN or local secret
- uses the same editors before transport
- may send prepared DTOs to its own backend wrapper

### Backend / BFF / node

- loads and unlocks protected profiles
- enrolls a profile through `ServerProfileSessionManager.enroll(...)`; the BFF
  supplies the authorized activation grant and application details, while the
  SDK owns exchange, device registration and secure message formatting
- never asks the browser or product UI to construct token-exchange or DIDComm
  payloads
- selects actor facade
- performs submit/poll against GW
- orchestrates several actor profiles in one business flow


## What this repo should teach

`tests/101-backend-profile-runtime.test.mjs` should be the orchestration guide
for technical runtime composition only:

- not the place where claim paths are invented
- not the place where generic editors are re-explained in full
- yes the place where several role profiles are chained in one end-to-end story
- yes the place where each step points back to the owning `common-utils`
  authoring test

## Immediate rewrite rule

When one new backend/BFF use case is added:

1. Find the existing `gdc-common-utils-ts` `101` that already teaches the
   editor/reader/viewer.
2. Reuse that helper surface in the node test.
3. Only add runtime/profile orchestration in `gdc-sdk-node-ts`.
4. If no `common-utils` `101` exists yet, create it there first.

# 101 Profile Orchestration Map

## Purpose

This repo should not re-teach every editor/builder already documented in
`gdc-common-utils-ts`.

The job of `gdc-sdk-node-ts` `101` tests is different:

- show how one protected profile is loaded and unlocked
- show how one actor session exposes one role facade
- show how several role profiles depend on each other in one real lifecycle
- reuse the shared high-level editors/readers from `gdc-common-utils-ts`
- keep frontend/web, backend/BFF, and voice/call-center aligned on the same
  programming model

Canonical top-level contract:

`loadProfile(...) -> unlock PIN/secret -> session -> actor facade -> common-utils helper`

## Layer rule

- `gdc-common-utils-ts`
  Owns business editors, readers, viewers, search helpers, and semantic
  examples.
- `gdc-sdk-core-ts`
  Owns neutral actor/sector facade contracts.
- `gdc-sdk-node-ts`
  Owns runtime orchestration for BFF/backend/voice:
  profile loading, route binding, submit/poll, and actor-to-actor lifecycle.

## Common-Utils 101 Map

These tests already explain the high-level building blocks. Node/backend `101`
tests should reuse their helpers instead of reauthoring claim plumbing.

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

### Vital signs / add clinical data

- `gdc-common-utils-ts/__tests__/101-vital-sign-entry-editor.test.ts`
- Main helper surface:
  - `new BundleEditor().newEntry().asVitalSign()...`
  - `asObservation()...`
- Use from web/expo/BFF/voice when:
  - one controller or assistant captures a new vital sign
  - one app wants chainable `get/set` editing instead of raw FHIR claims

### Clinical IPS high-level reading

- `gdc-common-utils-ts/docs/101-CLINICAL-IPS.md`
- Main helper surface:
  - `ipsBundleReader.getSections()`
  - `ipsBundleReader.getSectionSummary(...)`
  - `ipsBundleReader.getResources(...)`
  - `ipsBundleReader.getAllergies(...)`
  - `ipsBundleReader.getConditions(...)`
  - `ipsBundleReader.getMedications(...)`
  - `ipsBundleReader.getVitalSigns(...)`
  - `ipsBundleReader.getLocalTextAndIntDisplay(...)`
  - `ipsBundleReader.getXhtmlOrDerived(...)`
  - `ipsBundleReader.getNarrative(...)`
- Use from node/BFF when:
  - one professional or app receives one IPS and must read it immediately at
    high level
  - one backend should avoid reauthoring clinical bundle plumbing

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
- search or read the latest IPS/clinical bundle
- render section summaries, XHTML, and section counts
- query one or more canonical sections with shared pagination/count semantics
- keep `undefined` or `[]` section selectors equivalent to "all sections"
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
- selects actor facade
- performs submit/poll against GW
- orchestrates several actor profiles in one business flow

### Voice / call center / node

- same as backend/BFF
- only input/output modality changes:
  menu prompts, alias selection, PIN capture by voice, and narrated summaries

## What this repo should teach

`tests/101-backend-profile-runtime.test.mjs` should be the orchestration guide:

- not the place where claim paths are invented
- not the place where generic editors are re-explained in full
- yes the place where several role profiles are chained in one end-to-end story
- yes the place where each step points back to the owning `common-utils` helper

## Immediate rewrite rule

When one new backend/BFF/voice use case is added:

1. Find the existing `gdc-common-utils-ts` `101` that already teaches the
   editor/reader/viewer.
2. Reuse that helper surface in the node test.
3. Only add runtime/profile orchestration in `gdc-sdk-node-ts`.
4. If no `common-utils` `101` exists yet, create it there first.

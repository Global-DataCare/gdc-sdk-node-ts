# SDK Integration 101 for Node Backends

This file is no longer the main tutorial.

If you want the full copy/paste onboarding flow, start here:

- [SDK_END_TO_END_101.md](./SDK_END_TO_END_101.md)

This document is the short technical map:

- which package owns what
- which class to instantiate
- which SDK method maps to each GW CORE flow
- which shared docs explain the contract details

## Rules

- Do not start a beginner tutorial from raw GW wire payloads.
- Always use shared constants and helpers instead of hardcoded claim keys.
- Legal-organization activation always includes:
  - `service.url`
  - `service.capabilities`
- Teach `orgControllerDid` for the legal-organization controller DID.
- Teach `organizationActivation` as the local activation variable name.

## Package Map

- `gdc-common-utils-ts`
  - shared constants
  - shared examples
  - healthcare codings
  - DID/DIDComm/FHIR helpers
- `gdc-sdk-core-ts`
  - runtime-neutral builders
  - activation builder
  - communication draft/outbox helpers
  - consent-access helpers
- `gdc-sdk-node-ts`
  - Node runtime transport
  - submit/poll orchestration
  - role-oriented SDK facades

Canonical shared examples:

- [gdc-common-utils-ts/src/examples/organization-controller.ts](https://github.com/Global-DataCare/gdc-common-utils-ts/blob/main/src/examples/organization-controller.ts)
- [gdc-common-utils-ts/src/examples/individual-controller.ts](https://github.com/Global-DataCare/gdc-common-utils-ts/blob/main/src/examples/individual-controller.ts)
- [gdc-common-utils-ts/src/examples/professional.ts](https://github.com/Global-DataCare/gdc-common-utils-ts/blob/main/src/examples/professional.ts)
- [gdc-common-utils-ts/src/examples/shared.ts](https://github.com/Global-DataCare/gdc-common-utils-ts/blob/main/src/examples/shared.ts)

## Runtime Initialization

Typical initialization order:

1. Prepare app identity and base URL.
2. Create `NodeHttpClient`.
3. Materialize the role facade you need.
4. Execute the flow from that facade.

Main runtime classes:

- `NodeHttpClient`
- `HostOnboardingSdk`
- `ProfessionalSdk`
- `OrganizationControllerSdk`
- `IndividualControllerSdk`
- `IndividualMemberSdk`

Related shared builder:

- `createBootstrapFacade()` from `gdc-sdk-core-ts`

## Facade Map

### Host onboarding

Use:

- `HostOnboardingSdk`

Main methods:

- `activateOrganizationInGatewayFromIcaProof(...)`
- `confirmLegalOrganizationOrder(...)`

### Professional

Use:

- `ProfessionalSdk`

Main methods:

- `activateOrganizationInGatewayFromIcaProof(...)`
- `createOrganizationEmployee(...)`
- `activateEmployeeDeviceWithActivationRequest(...)`
- `grantProfessionalAccess(...)`
- `requestSmartToken(...)`
- `ingestCommunicationAndUpdateIndex(...)`

### Individual controller

Use:

- `IndividualControllerSdk`

Main methods:

- `startIndividualOrganization(...)`
- `confirmIndividualOrganizationOrder(...)`
- `grantProfessionalAccess(...)`
- `importIpsOrFhirAndUpdateIndex(...)`
- `requestSmartToken(...)`

### Individual member / caregiver

Use:

- `IndividualMemberSdk`

Main methods:

- `requestSmartToken(...)`

## Flow Map

### Legal organization activation

SDK:

- `ProfessionalSdk.activateOrganizationInGatewayFromIcaProof(...)`
- or `HostOnboardingSdk.activateOrganizationInGatewayFromIcaProof(...)`

Shared builder:

- `createBootstrapFacade().createOrganizationActivation(...)`

GW CORE:

- `POST /host/cds-{jurisdiction}/v1/{sector}/registry/org.schema/Organization/_activate`
- `POST /host/cds-{jurisdiction}/v1/{sector}/registry/org.schema/Organization/_activate-response`

Additional contract notes:

- capabilities are mandatory business input
- SDK capability vocabulary is `service.capabilities`
- persisted GW claim is `org.schema.Service.serviceType`
- discovery/DCAT3 is derived from that persisted claim

Deep reference:

- [gwtemplate-node-ts/docs/API_CORE_INTEGRATION.md](https://github.com/Global-DataCare/gwtemplate-node-ts/blob/main/docs/API_CORE_INTEGRATION.md)

### Legal organization order confirmation

SDK:

- `confirmLegalOrganizationOrder(...)`

GW CORE:

- `POST /host/cds-{jurisdiction}/v1/{sector}/registry/org.schema/Order/_batch`
- `POST /host/cds-{jurisdiction}/v1/{sector}/registry/org.schema/Order/_batch-response`

### Employee / professional creation

SDK:

- `createOrganizationEmployee(...)`

### Individual organization bootstrap

SDK:

- `startIndividualOrganization(...)`
- `confirmIndividualOrganizationOrder(...)`

GW CORE:

- `POST /{tenantId}/cds-{jurisdiction}/v1/{sector}/individual/org.schema/Organization/_batch`
- `POST /{tenantId}/cds-{jurisdiction}/v1/{sector}/individual/org.schema/Order/_batch`

Note:

- The practical signed-PDF story is explained in the gateway docs and tests.
- Use the end-to-end guide for the user journey, not this file.

### Consent grant

SDK:

- `grantProfessionalAccess(...)`

Shared consent model:

- `gdc-sdk-core-ts/src/consent-access.ts`
- `gdc-common-utils-ts/docs/CONSENT_ACCESS_101.md`

### SMART token

SDK:

- `requestSmartToken(...)`

### IPS/FHIR ingestion

SDK:

- `importIpsOrFhirAndUpdateIndex(...)`
- `ingestCommunicationAndUpdateIndex(...)`

### Related person

SDK:

- `upsertRelatedPersonAndPoll(...)`

## Shared Builders And Helpers

Use `gdc-sdk-core-ts` when you need to prepare payloads before runtime submission:

- `createBootstrapFacade()`
- `createCommunicationDraft(...)`
- `addFhirResourceToDraft(...)`
- `createOutboxJobFromDraft(...)`
- `createCommunicationFacade(...)`
- consent-access helpers in `src/consent-access.ts`

Use `gdc-common-utils-ts` for shared constants and semantic helpers:

- `buildControllerBindingInput(...)`
- `buildOrganizationDidWeb(...)`
- `buildProfessionalDidWeb(...)`
- `buildIndividualDidWeb(...)`
- healthcare constants and codings

## Discovery Status

What already exists:

- direct GW runtime use from a known provider/operator base URL
- shared provider DID/service endpoint resolution contracts
- capability-driven GW discovery and DCAT3 publication

What is still converging:

- first-class ICA discovery APIs
- first-class typed DCAT3 client helpers
- a single demo helper for fetching ICA proof automatically

## Use This File For

- finding the right facade quickly
- checking the real method name
- seeing which GW route family the method targets
- locating the deeper source-of-truth document

## Do Not Use This File For

- learning the whole onboarding journey from zero
- copy/pasting the main happy path
- understanding every payload field in order

For those, use:

- [SDK_END_TO_END_101.md](./SDK_END_TO_END_101.md)

# SDK Integration 101 for Node Backends

This file is no longer the main tutorial.

If you want the full copy/paste onboarding flow, start here:

- [101-SDK_END_TO_END.md](./101-SDK_END_TO_END.md)
- [101-LIVE_GW_LOCAL.md](./101-LIVE_GW_LOCAL.md)

This document is the short technical map:

- which package owns what
- which class to instantiate
- which SDK method maps to each GW CORE flow
- which shared docs explain the contract details

Teaching rule for this `101`:

- start from the highest-level runtime surface a new developer should call
- then point to the shared/core document for the lower-level model
- do not start from GW wire payloads, raw claims maps, or low-level bundle
  internals

Employee lifecycle/search semantics and the runtime-neutral employee bundle
contract are documented centrally in:

- [gdc-sdk-core-ts/docs/101-EMPLOYEES.md](https://github.com/Global-DataCare/gdc-sdk-core-ts/blob/main/docs/101-EMPLOYEES.md)

If you are confused about DIDComm envelope vs batch body vs entry type vs FHIR
resource vs `CommMsgExtended`, read first:

- [gdc-common-utils-ts/docs/101-COMMUNICATION_LAYERING.md](https://github.com/Global-DataCare/gdc-common-utils-ts/blob/main/docs/101-COMMUNICATION_LAYERING.md)

If you need the exact local GW commands, TTY order, tenant bootstrap, Docker
variant, and port-stop commands, use:

- [101-LIVE_GW_LOCAL.md](./101-LIVE_GW_LOCAL.md)

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

## Actor Map

- `gdc-common-utils-ts`
  - pure helpers, constants, and reusable examples
- `gdc-sdk-core-ts`
  - shared actor/capability model and runtime-neutral bundle builders
- `gdc-sdk-node-ts`
  - runtime client plus actor-scoped facades

Employee management belongs to:

- `OrganizationControllerSdk`
  - create/search/disable/purge employee

It does not belong to:

- `ProfessionalSdk`
  - professional flows such as employee device activation, SMART, consent, and communication

## Onboarding Order

For new developers, teach these layers in this order:

1. actor-scoped runtime facade
2. shared high-level editor/session object from `sdk-core`
3. lower-level shared builders only if needed
4. raw bundle shapes only for debugging or advanced integration work

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
- `activateEmployeeDeviceWithActivationRequest(...)`
- `grantProfessionalAccess(...)`
- `requestSmartToken(...)`
- `ingestCommunicationAndUpdateIndex(...)`

### Organization controller

Use:

- `OrganizationControllerSdk`

Main methods:

- `createOrganizationEmployee(...)`
- `searchOrganizationEmployees(...)`
- `disableEmployee(...)`
- `purgeEmployee(...)`

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
- discovery/DSP publication is derived from that persisted claim

Deep reference:

- [gwtemplate-node-ts/docs/API_CORE_INTEGRATION.md](https://github.com/Global-DataCare/gwtemplate-node-ts/blob/main/docs/API_CORE_INTEGRATION.md)

### Legal organization order confirmation

SDK:

- `confirmLegalOrganizationOrder(...)`

GW CORE:

- `POST /host/cds-{jurisdiction}/v1/{sector}/registry/org.schema/Order/_batch`
- `POST /host/cds-{jurisdiction}/v1/{sector}/registry/org.schema/Order/_batch-response`

### Employee create

SDK:

- `createOrganizationEmployee(...)`

Allowed actor/capability:

- `OrganizationControllerSdk`
- `organization.create_employee`
- when the facade comes from `ActorSession` / `NodeActorSession`, the SDK enforces the required capability before calling the runtime client

GW CORE current contract:

- `POST /{tenantId}/cds-{jurisdiction}/v1/{sector}/entity/org.schema/Employee/_batch`
  current create path

### Employee search

SDK:

- `searchOrganizationEmployees(...)`

Allowed actor/capability:

- `OrganizationControllerSdk`
- same organization-admin surface as employee management

GW CORE current contract:

- `POST /{tenantId}/cds-{jurisdiction}/v1/{sector}/entity/org.schema/Employee/_search`
  canonical search path using `POST + Parameters`

### Employee lifecycle

SDK:

- `disableEmployee(...)`
- `purgeEmployee(...)`

Allowed actor/capability:

- `OrganizationControllerSdk`
- `organization.disable_employee`
- `organization.purge_employee`
- when the facade comes from `ActorSession` / `NodeActorSession`, the SDK enforces those lifecycle capabilities before calling the runtime client

GW CORE current contract:

- `POST /{tenantId}/cds-{jurisdiction}/v1/{sector}/entity/org.schema/Employee/_batch`
  current disable path with `body.data[0].request.method = DELETE`
- `POST /{tenantId}/cds-{jurisdiction}/v1/{sector}/entity/org.schema/Employee/_purge`
  explicit purge path

Current semantic notes:

- disable marks the employee inactive
- disable does not release licenses
- purge requires inactive status first
- purge releases/disassociates licenses and preserves traceability
- purge keeps the previous employee as historical identity; a later create for the same `email + role` creates a new employee identity instead of reactivating the purged one
- TODO `gw-core-lifecycle-target-patch-employee-disable`: migrate to `_batch + PATCH` only after GW CORE deploys it

Local GW smoke note:

- When using the default local bootstrap values (`TENANT_ID=acme-id`, `ADMIN_EMAIL=admin1@acme.org`, and the rest of the script defaults), `EMPLOYEE_COUNT=2` leaves only one additional employee seat because the controller/admin already consumes one seat.
- Use `EMPLOYEE_COUNT=3` only if you want to run the exact two-employee lifecycle smoke after bootstrap (`create employee 1`, `create employee 2`, `disable employee 2`, `purge both`).
- If you continue with a later doctor/professional-access smoke after purging one employee, that released seat can be reused by the doctor employee flow.

### Individual organization bootstrap

SDK:

- `startIndividualOrganization(...)`
- `confirmIndividualOrganizationOrder(...)`
- `disableIndividual(...)`
- `purgeIndividual(...)`
- `disableIndividualMember(...)`
- `purgeIndividualMember(...)`

Allowed actor/capability:

- `IndividualControllerSdk`
- `individual.bootstrap`
- `individual.disable`
- `individual.purge`
- `individual_member.disable`
- `individual_member.purge`
- when the facade comes from `ActorSession` / `NodeActorSession`, the SDK now enforces those lifecycle capabilities before calling the runtime client

GW CORE:

- `POST /{tenantId}/cds-{jurisdiction}/v1/{sector}/individual/org.schema/Organization/_transaction`
- `POST /{tenantId}/cds-{jurisdiction}/v1/{sector}/individual/org.schema/Order/_batch`
- `POST /{tenantId}/cds-{jurisdiction}/v1/{sector}/individual/org.schema/Organization/_disable`
- `POST /{tenantId}/cds-{jurisdiction}/v1/{sector}/individual/org.schema/Organization/_purge`

Note:

- The practical signed-PDF story is explained in the gateway docs and tests.
- Use the end-to-end guide for the user journey, not this file.
- `startIndividualOrganization(...)` now targets the current `_transaction` alias instead of the legacy `_batch` path.
- disable does not release licenses.
- purge requires inactive status first and then releases/disassociates licenses while preserving traceability.
- TODO `gw-core-lifecycle-target-patch-individual-disable`: migrate to `_batch + PATCH` only after GW CORE deploys it.
- `disableIndividualMember(...)` and `purgeIndividualMember(...)` are controller-only placeholders today; the runtime intentionally throws `not supported` until GW CORE exposes the stable `RelatedPerson` lifecycle contract.

### Consent grant

SDK:

- `grantProfessionalAccess(...)`

Shared consent model:

- `gdc-sdk-core-ts/src/consent-access.ts`
- `gdc-common-utils-ts/docs/101-CONSENT_ACCESS.md`

Lifecycle note:

- In the current shared SDK teaching model, operations on individual index data,
  including consent-related data, travel through `Communication`.
- `Communication` is the auditable exchange envelope; the attached `Bundle`
  carries the real `Consent` resources.
- Do not teach `Consent/_batch` as the primary envelope for index-oriented
  flows in new SDK material.

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

Lifecycle note:

- `RelatedPerson` models member/caregiver relationship data, not employee lifecycle.
- Current SDK support is upsert/search/token-oriented. No extra lifecycle contract is fabricated here.

## Lifecycle 101

Use this mental model for current GW CORE:

- `employee`:
  `createOrganizationEmployee(...)` creates or reactivates.
  `disableEmployee(...)` uses `_batch` plus entry `DELETE`.
  `purgeEmployee(...)` uses explicit `/_purge`.
  only `OrganizationControllerSdk` should expose these operations.
- `individual/org.schema/Organization`:
  `startIndividualOrganization(...)` uses `_transaction`.
  `confirmIndividualOrganizationOrder(...)` confirms the returned order/offer.
  `disableIndividual(...)` uses explicit `/_disable`.
  `purgeIndividual(...)` uses explicit `/_purge`.
  only `IndividualControllerSdk` should expose these operations.
- `member`:
  `upsertRelatedPersonAndPoll(...)` manages the caregiver/family relationship record.
  `requestSmartToken(...)` is the runtime access step after that relationship exists.
  `disableIndividualMember(...)` and `purgeIndividualMember(...)` are exposed only on `IndividualControllerSdk` as forward-looking placeholders and currently fail fast until GW CORE adds the stable contract.
- `consent`:
  `grantProfessionalAccess(...)` creates the consent record used by SMART/data access.
  index-oriented consent data is transported through `Communication`, not taught
  as a standalone primary envelope.

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
- capability-driven GW discovery and DSP catalog publication

What is still converging:

- first-class ICA discovery APIs
- first-class typed DSP discovery client helpers
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

- [101-SDK_END_TO_END.md](./101-SDK_END_TO_END.md)

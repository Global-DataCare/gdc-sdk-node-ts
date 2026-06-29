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

Important boundary for live tests:

- `gdc-sdk-node-ts` is not the product BFF
- the live E2E suite simulates one controlled `virtual API` with a BFF-like
  role only for testing
- that test harness encapsulates GW CORE `submit + poll` so lifecycle journeys
  can be validated end to end against a real gateway
- the current harness runs with the future `user job manager` queue disabled,
  so all high-level facade calls go directly through the controlled `virtual API`
- future app-side job management, vault persistence, read models, and retry
  state machines are separate concerns and are not the goal of this runtime
  guide

Current execution-mode rule:

- `LIVE_GW_E2E_EXECUTION_MODE=direct` is the supported live-test mode today
- queued execution is reserved for a later `user job manager` phase

Canonical portal/BFF functional mapping over GW CORE lives in:

- [gwtemplate-node-ts/docs/PORTAL_API_TO_GW_CORE.md](https://github.com/Global-DataCare/gwtemplate-node-ts/blob/main/docs/PORTAL_API_TO_GW_CORE.md)

Use that GW CORE document when you need the product-facing distinction between:

- `employees`
- `related persons`
- `members`
- `access consents`

Teaching rule for this `101`:

- start from the highest-level runtime surface a new developer should call
- then point to the shared/core document for the lower-level model
- do not start from GW wire payloads, raw claims maps, or low-level bundle
  internals

Employee lifecycle/search semantics and the runtime-neutral employee bundle
contract are documented centrally in:

- [gdc-sdk-core-ts/docs/101-EMPLOYEES.md](https://github.com/Global-DataCare/gdc-sdk-core-ts/blob/main/docs/101-EMPLOYEES.md)

When teaching employee flows in this runtime guide, keep this order:

1. create
2. search
3. lifecycle

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

Current canonical facades:

- `OrganizationController`
- `OrganizationEmployee`
- `IndividualController`
- `IndividualMember`
- `Professional`

Research-access teaching rule:

- in developer-facing 101 material, teach inter-tenant twin search under the
  product/domain name `DigitalTwinSdk`
- current runtime implementation still maps that capability to
  `ProfessionalSdk`
- do not teach `DigitalTwinControllerSdk`

Treat domain labels such as `OrgProfHealthCare`, `OrgProfVet`,
`OrgProfAdministrative`, or `OrgProfFirstResponder` as specializations over the
canonical `Professional` actor until the shared actor/capability contract is
extended centrally in `sdk-core`.

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

- `submitLegalOrganizationVerificationTransaction(...)`
- `confirmLegalOrganizationOrder(...)`
- `activateOrganizationInGatewayFromIcaProof(...)` (legacy compatibility)

Naming rule for new developers:

- teach `submitLegalOrganizationVerificationTransaction(...)` as the canonical
  host/onboarding method
- if you need one business sentence, explain it as:
  - “register organization in gateway with digitally signed PDF and controller
    binding”
- do not teach `activateOrganizationInGatewayFromIcaProof(...)` as the normal
  onboarding path

Legacy compatibility:

- `activateOrganizationInGatewayFromIcaProof(...)`
  remains the older compatibility path around `_activate`
- keep it visible in the 101 set until the remaining legacy references are
  cleaned in the other SDK lifecycle documents
- do not present it as the preferred path for new integrations

### Professional

Use:

- `ProfessionalSdk`

Main methods:

- `activateEmployeeDeviceWithActivationRequest(...)`
- `grantProfessionalAccess(...)`
- `requestSmartToken(...)`
- `ingestCommunicationAndUpdateIndex(...)`

Do not teach legal-organization onboarding here:

- `activateOrganizationInGatewayFromIcaProof(...)` may still exist on some
  runtime surfaces for compatibility
- but it is not the canonical onboarding method for new integrations
- the canonical legal-organization path is
  `OrganizationControllerSdk.submitLegalOrganizationVerificationTransaction(...)`
  or the corresponding host-onboarding façade

Research-access note:

- when the business flow is “request SMART token, search digital twins, open
  IPS”, teach that journey as `DigitalTwinSdk`
- today, in `gdc-sdk-node-ts`, the executable actor façade that already owns
  those methods is still `ProfessionalSdk`
- use `ProfessionalSdk` in code until a dedicated public alias is published

### Organization controller

Use:

- `OrganizationControllerSdk`

Main methods:

- `createOrganizationEmployee(...)`
- `searchOrganizationEmployees(...)`
- `disableEmployee(...)`
- `purgeEmployee(...)`

Research-access governance note:

- `OrganizationControllerSdk` is the canonical backend/BFF façade for:
  - contract/governance preparation
  - employee/member lifecycle
  - later provider/consumer-side authorization administration
- for closeout and 101 material, this is the façade that should be shown next
  to `DigitalTwinSdk`

## Inter-Tenant Research Access 101

Use this mental split for new developers:

- `OrganizationControllerSdk`
  - prepares or resolves the provider tenant
  - prepares or resolves the consumer tenant
  - formalizes or retrieves the inter-tenant contract VC
  - ensures provider-side permit rules exist
  - optionally ensures consumer-side researcher/member delegation exists
- `DigitalTwinSdk`
  - builds or forwards the VP carrying the contract VC
  - requests the SMART token from the provider tenant
  - searches `digitaltwin/.../Composition/_search`
  - opens one IPS or downloads selected IPS results

Current implementation honesty:

- the current GW runtime behavior is already proven end to end
- the current node façade that executes the search/read half is
  `ProfessionalSdk`
- the 101 should still present the business capability as `DigitalTwinSdk`
  because that is what developers and product teams understand

Canonical didactic example:

- provider tenant: `acme-id`
- consumer tenant: `lab-id`
- provider subjects:
  - `Doraemon` with one IPS imported
  - `Novita` with medication-only demo bundles
- search terms:
  - `ibuprofen`
  - `paracetamol`

Expected behavior:

- requesting a SMART token without the contract VC proof is rejected
- requesting it with the matching contract VC proof succeeds
- searching `ibuprofen` returns exactly one digital twin
- searching `paracetamol` returns exactly one digital twin
- both matches correspond to `Novita`

What the backend/BFF owns:

- route context
- polling
- GW credentials and transport
- contract/VP forwarding
- error handling

What the frontend or caller should not own here:

- raw GW queue polling logic
- smart-contract or ledger plumbing
- direct knowledge of GW internal persistence

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
- for disable/purge, callers must pass the current GW `resource.id`
  returned by create/search as `resourceId`; the SDK now rejects calls that do
  not provide it
  keep
  `org.schema.Person.identifier` in `employeeClaims` as the exportable
  business/interoperable identifier, not as the primary technical locator
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
- `disableIndividualMember(...)` now emits the shared identifier-first lifecycle resource contract over the current `RelatedPerson/_batch` runtime path:
  - `resource.identifier` is the interoperable locator
  - `resource.id` is optional internal metadata
  - `resource.meta.claims` is the canonical processing shape
  - `resource.meta.status = inactive` carries lifecycle state without overloading `RelatedPerson.active`
- `purgeIndividualMember(...)` now uses the explicit `RelatedPerson/_purge`
  runtime path with the same shared identifier-first lifecycle resource
  contract used by the SDK tests and examples.
- Shared contract reference: `gdc-common-utils-ts/docs/101-RESOURCE_IDENTIFIER_AND_OPERATIONS.md`

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
- `upsertRelatedPersonAndPoll(...)` reuses the shared bundle fixture style from
  `gdc-common-utils-ts/src/examples/related-person.ts`.
- `disableIndividualMember(...)` now emits the shared identifier-first lifecycle
  resource contract over the current `RelatedPerson/_batch` runtime path.
- `purgeIndividualMember(...)` now uses the explicit
  `RelatedPerson/_purge` runtime path and the shared identifier-first
  lifecycle resource contract.

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
  `disableIndividualMember(...)` is supported through the current
  `RelatedPerson/_batch` runtime path using the shared identifier-first
  lifecycle resource contract.
  `purgeIndividualMember(...)` uses the explicit `RelatedPerson/_purge`
  runtime path and the same shared identifier-first lifecycle resource
  contract.
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

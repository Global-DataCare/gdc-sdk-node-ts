# gdc-sdk-node-ts

See [ARCHITECTURE.md](./ARCHITECTURE.md) and
[CONTRIBUTING.md](./CONTRIBUTING.md) before adding node runtime facades,
execution adapters, or orchestration tests.

Short rule:

- `101` tests must read like executable tutorials
- shared fixtures/types belong in `gdc-common-utils-ts`, not as local literals
  in node runtime tests

Node runtime package for consuming the shared GDC SDK contracts against real
gateway backends.

Use this package when your backend needs to:

- call GW APIs
- submit/poll async operations
- orchestrate onboarding, consent, communication, and search flows
- consume the shared relationship invitation/acceptance contracts from
  `gdc-sdk-core-ts`

This package is for runtime execution. It is not the place where the canonical
business contract is defined.

Important test-harness boundary:

- `gdc-sdk-node-ts` is not the product BFF
- the live E2E suite simulates a controlled `virtual API` with a BFF-like role
  only to validate GW CORE lifecycles end to end
- the current live suites run with the future `user job manager` queue disabled,
  so every high-level call goes directly through that controlled `virtual API`
- app-side job queues, offline retry, local vault/read models, and the future
  user job manager are separate follow-up concerns

Important live-run rule:

- the canonical live E2E result must come from the user's real terminal/TTY
- do not assume an AI agent sandbox has equivalent localhost, Docker, DNS, or
  GCP connectivity
- if sandboxed runs disagree with the user's terminal, trust the user's
  terminal for live GW validation

Required live validation order:

1. local process E2E from real TTY
2. local Docker image/container E2E
3. staging E2E
4. production image/deploy only after staging is green

Architectural rule:

- shared contracts and actor boundaries come from `gdc-sdk-core-ts`
- this package executes those flows against GW
- this package should not widen an actor facade just because the runtime client
  happens to expose the underlying method

## Start Here

If you are integrating this package for the first time, open these in order:

1. [gdc-sdk-core-ts/docs/101-SDK_PACKAGE_BOUNDARIES.md](https://github.com/Global-DataCare/gdc-sdk-core-ts/blob/main/docs/101-SDK_PACKAGE_BOUNDARIES.md)
   Why `core`, `node`, and `front` are separate packages, what belongs in each
   one, and why actor-scoped facades must stay aligned across runtimes.
1. [tests/101-live-full-cycle-bff-runtime.e2e.test.mjs](./tests/101-live-full-cycle-bff-runtime.e2e.test.mjs)
   Canonical live backend/BFF walkthrough on a fresh local GW lifecycle:
   host/tenant activation, employee provisioning, individual bootstrap,
   consent grant, professional SMART token, clinical read, and final cleanup.
1. [tests/101-backend-profile-runtime.test.mjs](./tests/101-backend-profile-runtime.test.mjs)
   Minimal backend-generic walkthrough for loading one actor profile,
   registering one trusted device/runtime context, connecting to one subject
   index, reading one subject index composition, and then materializing the
   `IndividualController` facade from the loaded backend session.
   That walkthrough now uses the concrete direct backend runtime over the
   injected `RuntimeClient`, not only one abstract adapter mock, and now also
   demonstrates in-memory `JobManager` usage plus `closeProfile(...)`.
1. [tests/101-individual-controller-backend-runtime.test.mjs](./tests/101-individual-controller-backend-runtime.test.mjs)
   First pragmatic backend wrapper over the generic profile runtime for the
   current individual-controller CORE baseline:
   load profile, start registration, confirm order, and search the clinical
   index.
1. [docs/V2_INDIVIDUAL_REGISTRATION_RECONCILIATION.md](./docs/V2_INDIVIDUAL_REGISTRATION_RECONCILIATION.md)
   Reconciles the old consumer flow with the current CORE registration baseline
   and separates the stable registration base from later product extensions.
1. [docs/101-SDK_END_TO_END.md](./docs/101-SDK_END_TO_END.md)
  Ordered onboarding guide with end-to-end journeys, copy/paste snippets, and
  the recommended reading path for new backend integrators.
2. [docs/101-SDK_INTEGRATION.md](./docs/101-SDK_INTEGRATION.md)
   Real backend setup, imports, `initializeCommunicationIdentity(...)`,
   `new NodeHttpClient(...)`, route context, facade selection, and live method
   usage.
3. [docs/101-LIVE_GW_LOCAL.md](./docs/101-LIVE_GW_LOCAL.md)
   Exact TTY/local/Docker commands for running the SDK against a real local GW
   CORE, including tenant bootstrap and employee-seat setup.
4. [docs/101-DISCOVERY.md](./docs/101-DISCOVERY.md)
   Node/BFF dataspace discovery, hosting-operator resolution, provider
   resolution, and the correct integration boundary for fallback and cache.
5. [gdc-sdk-core-ts/docs/101-SDK_FLOWS.md](https://github.com/Global-DataCare/gdc-sdk-core-ts/blob/main/docs/101-SDK_FLOWS.md)
   Actor split and business-flow map across organization, individual,
   permissions, invitation, import, and SMART flows.
6. [gwtemplate-node-ts/docs/PORTAL_API_TO_GW_CORE.md](https://github.com/Global-DataCare/gwtemplate-node-ts/blob/main/docs/PORTAL_API_TO_GW_CORE.md)
   Canonical portal/BFF functional map over GW CORE, including the domain
   split between `employees`, `related persons`, `members`, and `consents`.
7. [gdc-common-utils-ts/src/examples/](https://github.com/Global-DataCare/gdc-common-utils-ts/tree/main/src/examples)
   Shared payload values used by the docs and tests.
8. [gdc-common-utils-ts/docs/101-LIFECYCLE.md](https://github.com/Global-DataCare/gdc-common-utils-ts/blob/main/docs/101-LIFECYCLE.md)
   Canonical `enable/disable/delete` semantics and copy/paste placeholders.
9. [docs/NEXT_STEPS.md](./docs/NEXT_STEPS.md)
   Follow-up scope after GW CORE live validation, including the future user job
   manager boundary.

If you need the shortest path:

- main onboarding guide:
  [docs/101-SDK_END_TO_END.md](./docs/101-SDK_END_TO_END.md)
- GW CORE app identity:
  `appId` mandatory, `appVersion` optional with default `v1.0`
- backend technical identity:
  [`initializeCommunicationIdentity(...)`](./docs/101-SDK_INTEGRATION.md)
  for the technical channel/runtime identity, not the legal organization id
- runtime client:
  [`NodeHttpClient`](src/node-runtime-client.ts)
- step-by-step runtime usage:
  [docs/101-SDK_INTEGRATION.md](./docs/101-SDK_INTEGRATION.md)
- dataspace discovery and fallback/cache boundary:
  [docs/101-DISCOVERY.md](./docs/101-DISCOVERY.md)

Current live teaching target:

- the main executable tutorial for integrators is now:
  [tests/101-live-full-cycle-bff-runtime.e2e.test.mjs](tests/101-live-full-cycle-bff-runtime.e2e.test.mjs)
- the standalone actor-profile suites still exist as focused technical slices:
  - [tests/live-profile-runtime-individual.e2e.test.mjs](tests/live-profile-runtime-individual.e2e.test.mjs)
  - [tests/live-profile-runtime-professional.e2e.test.mjs](tests/live-profile-runtime-professional.e2e.test.mjs)
- the larger runtime suite remains the regression-oriented environment proof:
  [tests/live-gw-node-runtime.e2e.test.mjs](tests/live-gw-node-runtime.e2e.test.mjs)

## Executable Usage Examples

Open these tests when you want to see exact method calls and exact inputs:

- [tests/host-onboarding.test.mjs](tests/host-onboarding.test.mjs)
  Organization activation and order confirmation.
- [tests/individual-start.test.mjs](tests/individual-start.test.mjs)
  Individual organization start flow.
- [tests/individual-onboarding.test.mjs](tests/individual-onboarding.test.mjs)
  Individual order/offer confirmation flow.
- [tests/device-activation.test.mjs](tests/device-activation.test.mjs)
  Employee activation code and activation request flows.
- [tests/resource-operations.test.mjs](tests/resource-operations.test.mjs)
  Related person upsert, communication ingestion, search, and access grants.
- [tests/smart-token.test.mjs](tests/smart-token.test.mjs)
  SMART token request flow.
- [tests/live-gw-node-runtime.e2e.test.mjs](tests/live-gw-node-runtime.e2e.test.mjs)
  End-to-end runtime wiring against a real GW environment.
- [tests/101-live-full-cycle-bff-runtime.e2e.test.mjs](tests/101-live-full-cycle-bff-runtime.e2e.test.mjs)
  Single live BFF-oriented `101` that chains tenant, professional, individual,
  consent, SMART, read, and cleanup in one executable conversation.
- [tests/live-profile-runtime-individual.e2e.test.mjs](tests/live-profile-runtime-individual.e2e.test.mjs)
  Standalone actor-profile E2E for the individual controller on an already
  operational tenant, including scenario-owned cleanup.
- [tests/101-dataspace-resolver.test.mjs](tests/101-dataspace-resolver.test.mjs)
  Minimal `HttpDataspaceResolver` 101 with one host and one published provider.
- [tests/101-default-first-dataspace-discovery.test.mjs](tests/101-default-first-dataspace-discovery.test.mjs)
  Minimal `default-first` discovery with one host and one published
  `IndexProvider`.

## Live GW CORE Flow

Use [tests/101-live-full-cycle-bff-runtime.e2e.test.mjs](tests/101-live-full-cycle-bff-runtime.e2e.test.mjs)
as the canonical live `101` for backend/BFF integrators.

Use [tests/live-gw-node-runtime.e2e.test.mjs](tests/live-gw-node-runtime.e2e.test.mjs)
as the broader runtime-regression suite.

Before running that suite, read:

- [docs/101-LIVE_GW_LOCAL.md](./docs/101-LIVE_GW_LOCAL.md)

Execution requirement:

- run the live suite from a real user terminal/TTY
- if an AI agent is assisting, it should prefer a long-lived TTY process and
  avoid treating sandbox-local connectivity failures as product failures

Teaching rule:

- defaults come from `gdc-common-utils-ts/examples`
- override with env vars only when your tenant, bearer, or route is different
- local GW default is `http://127.0.0.1:3000`
- Docker-exposed GW can be overridden with `BASE_URL=http://127.0.0.1:8000`
- `LIVE_GW_E2E_EXECUTION_MODE=direct` is the current and only supported mode
  for live validation; queued app-side job management is a later phase

Current live `101` flow covered by the test suite:

1. activate one hosted tenant / legal organization
2. provision one professional employee through the organization controller
3. load the individual-controller profile and bootstrap one hosted individual
4. confirm the returned order and verify the invoice bundle projection
5. ingest one IPS/clinical `Communication` through the individual controller
6. grant professional consent for one patient-summary section
7. load the professional profile and request one SMART token
8. read the allowed IPS bundle as the professional actor
9. clean up consent, individual, employee, tenant, and host state

Run the main live `101`:

```bash
npm run test:e2e:101:live-full-cycle
```

What is still not fully covered as one single root lifecycle:

- initial organization license listing
- extra-seat activation after the portal-side fictitious payment confirmation
- relisting licenses after seat activation
- one employee bundle with employee `A` and employee `B`
- selective disable/purge validation across both employees
- consent escalation from partial IPS access to broader IPS access
- final cleanup of consent, individual, remaining employees, and tenant

Current invoice/readback behavior:

- both host and individual `Order/_batch-response` flows now return the flat
  compatibility claims and an embedded invoice `Bundle`
- the invoice bundle contains one FHIR `Invoice`, one PDF
  `DocumentReference`, and one structured JSON/XML `DocumentReference`
- live suites can read that bundle back through the same high-level response
  body that the virtual API exposes to the simulated front

Current runtime boundary:

- `OrganizationControllerSdk.confirmOrganizationLicenseOrder(...)` now uses the
  public host `Order/_batch` route used by GW CORE for portal-managed
  post-payment seat activation
- the long root lifecycle is still not fully closed because the suite does not
  yet orchestrate the whole `license list -> pay -> confirm -> relist -> two
  employees -> selective purge -> cleanup` dialogue as one single test

The exact pending release-readiness checklist lives in:

- [docs/NEXT_STEPS.md](./docs/NEXT_STEPS.md)

Optional live lifecycle extension:

- set `RUN_LIVE_GW_E2E_INDIVIDUAL_LIFECYCLE=1` to extend the same suite with
  `disableIndividual(...)` + `purgeIndividual(...)` against the real
  `gwtemplate-node-ts` runtime contract
- this extra block is intentionally separate from the default happy path
  because it changes lifecycle state and should only run when that tenant/test
  subject is disposable

Shared example source of truth:

- tenant/route/controller/professional defaults:
  [gdc-common-utils-ts/src/examples/shared.ts](https://github.com/Global-DataCare/gdc-common-utils-ts/blob/main/src/examples/shared.ts)
- live employee defaults:
  [gdc-common-utils-ts/src/examples/organization-controller.ts](https://github.com/Global-DataCare/gdc-common-utils-ts/blob/main/src/examples/organization-controller.ts)
- live consent defaults:
  [gdc-common-utils-ts/src/examples/individual-controller.ts](https://github.com/Global-DataCare/gdc-common-utils-ts/blob/main/src/examples/individual-controller.ts)

The two medication defaults used by the live test are intentionally reusable:

- `Ibuprofen 400 mg`
- `Paracetamol 600 mg`
- both every `8` hours
- both `PRN` / `dosage-asneeded = true`
- note text keeps the `4` hour gap in English

Run the full live runtime baseline:

```bash
npm run test:e2e:live-gw
```

Select one live transport profile from the same Node entrypoint:

```bash
npm run test:e2e:live-gw:didcomm-plain
npm run test:e2e:live-gw:legacy-fhir
npm run test:e2e:live-gw:all
```

Profile note:

- `didcomm-plain` is the current live baseline implemented by the Node runtime client
- `legacy-fhir` exercises raw `application/fhir+json` async batch submission for `org.hl7.fhir.*`
- `all` runs every implemented profile from the same suite file

Run the IPS ingestion/search branch as well:

```bash
RUN_LIVE_GW_E2E_IPS_INGESTION=1 \
npm run test:e2e:live-gw
```

Implementation note:

- the public runtime contract is still `Bundle/_search`
- `gdc-sdk-node-ts` submits that request as-is
- GW CORE resolves it internally from indexed subject sections and returns the
  consolidated IPS bundle document

Common overrides:

```bash
BASE_URL=http://127.0.0.1:3000 \
AUTH_BEARER=... \
TENANT_ID=VATES-B00112233 \
TENANT_ROUTE_ID=acme-live \
JURISDICTION=ES \
SECTOR=health-care \
SUBJECT_DID=did:web:api.acme.org:individual:123 \
RUN_LIVE_GW_E2E_IPS_INGESTION=1 \
LIVE_GW_NODE_E2E_DEBUG=1 \
npm run test:e2e:live-gw
```

Docker-exposed GW example:

```bash
BASE_URL=http://127.0.0.1:8000 \
RUN_LIVE_GW_E2E_IPS_INGESTION=1 \
npm run test:e2e:live-gw
```

Documentation consistency rule for this repo family:

- scripts, README examples, Swagger examples, and internal tests must reuse the
  same example data and flow order
- if a new request/response example is added, add it first to
  `gdc-common-utils-ts/examples` and consume it from there instead of
  re-hardcoding values locally

## Dataspace Discovery Quick Map

Use the Node discovery layer when your backend or BFF needs to:

- start from preloaded hosting-operator semantics
- fetch the canonical host-scoped
  `/<hosting-operator-network-context>/.well-known/dspace-version` entrypoint
- derive the participant-scoped `/dsp/catalog/dcat.json` artifact
- return normalized provider/operator matches to portal or app backends

Primary references:

- [docs/101-DISCOVERY.md](./docs/101-DISCOVERY.md)
- [tests/101-default-first-dataspace-discovery.test.mjs](tests/101-default-first-dataspace-discovery.test.mjs)
- [tests/101-dataspace-resolver.test.mjs](tests/101-dataspace-resolver.test.mjs)
- [tests/dataspace-resolver-advanced.test.mjs](tests/dataspace-resolver-advanced.test.mjs)
- [tests/dataspace-resolver.test.mjs](tests/dataspace-resolver.test.mjs)

Architecture note:

- the reusable discovery resolver logic lives in `gdc-sdk-core-ts`
- `gdc-sdk-node-ts` re-exports it and supplies the Node runtime surface

Copy/paste starting point:

```ts
import { createDefaultFirstDataspaceDiscovery } from 'gdc-sdk-node-ts';
import { DataspaceSectors } from 'gdc-common-utils-ts';
import { HostNetworkTypes } from 'gdc-common-utils-ts/constants/network';

const discovery = createDefaultFirstDataspaceDiscovery({
  version: 'v1',
  networkType: HostNetworkTypes.Test,
  defaults,
});

const providers = await discovery.getIndexProviders({
  sector: DataspaceSectors.AnimalCare,
  jurisdiction: 'ES',
});
```

## Actor Split And Runtime Scope

This package must be understandable from the same actor split used by the
shared contracts:

- organization controller
- organization employee / professional member
- individual controller
- individual member / self
- related person
- professional with consented access

The Node runtime layer is where those shared flows are executed against GW.
That includes organization onboarding, employee creation, individual bootstrap,
permission grants, `RelatedPerson` upserts, SMART token requests, and clinical
data ingestion/search.

## Flow Families

- organization activation and order/offer confirmation
- employee creation and employee activation
- individual organization start and order confirmation
- related person upsert
- professional access grant
- invitation / OTP / relationship PIN runtime wiring
- permission-request `Communication`
- communication ingestion and search
- SMART token retrieval

## Main Flows

### 1. Controller invites a related person or professional

Typical backend sequence:

1. build shared invitation payload with `gdc-sdk-core-ts`
2. send it through the node runtime client or your backend adapter
3. persist or return the invitation state to portal/app

What matters here:

- this package executes the runtime call
- `gdc-sdk-core-ts` defines the payload shape
- callers should not hardcode route families in app code

### 2. Invitee accepts the relationship

Typical backend sequence:

1. start OTP challenge
2. confirm OTP
3. set relationship PIN if required
4. activate the relationship channel

Shared contract builders come from `gdc-sdk-core-ts`; this package is where a
Node backend wires them to real runtime operations.

### 3. Consent-aware communication and search

Use this package when your backend needs to:

- ingest `Communication`
- search clinical bundles
- request SMART tokens
- grant access
- create or update `RelatedPerson`

## What This Package Owns

- Node runtime client
- submit/poll orchestration
- actor-scoped node sessions
- backend-facing orchestration helpers

## What This Package Does Not Own

- the canonical invitation/OTP/PIN contract
- UNID-specific reminder runtime semantics
- frontend session UX

Those belong to:

- `gdc-sdk-core-ts` for shared contracts
- runtime extensions such as UNID/UHC for product-specific behavior
- `gdc-sdk-front-ts` for frontend-facing consumption

## Minimal Examples

### Use shared invitation contract from Node

```ts
import {
  createRelationshipChannelInvitationInput,
  RelationshipAccessActorKinds,
  RelationshipEnrollmentChannels,
  type RelationshipChannelInvitationInput,
} from 'gdc-sdk-core-ts';
import {
  buildIndividualDidWeb,
  HealthcareActorRoles,
  HealthcareConsentPurposes,
} from 'gdc-common-utils-ts';

const tenantId = 'acme-id';
const jurisdiction = 'ES';
const sector = 'health-care';
const providerOrganizationDid = subjectProfile.organizationDid;
const subjectLocalId = subjectProfile.subjectId;
const subjectId = buildIndividualDidWeb({
  organizationDidWeb: providerOrganizationDid,
  subjectId: subjectLocalId,
});
const professionalEmail = invitedProfessional.email;

const invitationInput: RelationshipChannelInvitationInput = {
  tenantId,
  jurisdiction,
  sector,
  subjectId,
  subjectKind: 'person',
  actorKind: RelationshipAccessActorKinds.Professional,
  actorIdentifier: professionalEmail,
  actorRole: HealthcareActorRoles.Physician,
  deliveryChannel: RelationshipEnrollmentChannels.Email,
  deliveryTarget: professionalEmail,
  purpose: HealthcareConsentPurposes.Treatment,
  relationshipLabel: 'primary-physician',
  phonePinOptional: false,
};

const invitation = createRelationshipChannelInvitationInput(invitationInput);
```

The backend should obtain those variables from:

- tenant route selection
- target subject identifier
- invited actor identity
- selected enrollment channel
- intended purpose/relationship label

### Request SMART token and search bundle

```ts
import { NodeHttpClient } from 'gdc-sdk-node-ts';
import {
  EXAMPLE_LATEST_IPS_SEARCH_INPUT,
} from 'gdc-common-utils-ts/examples/individual-controller';
import { HealthcareBasicSections } from 'gdc-common-utils-ts/constants/healthcare';
import { buildSmartCompositionReadScope } from 'gdc-common-utils-ts/utils/smart-scope';

const client = new NodeHttpClient({ baseUrl: process.env.BASE_URL! });

const subjectDid = EXAMPLE_LATEST_IPS_SEARCH_INPUT.subject;

const token = await client.requestSmartToken({
  ctx,
  actorDid: 'did:web:doctor.example.org:employee:001',
  subjectDid,
  scopes: [
    buildSmartCompositionReadScope({
      subjectDid,
      sections: HealthcareBasicSections.PatientSummaryDocument.claim,
    }),
  ],
  idToken: '...',
});

const result = await client.searchClinicalBundle(ctx, {
  subject: subjectDid,
});
```

Teaching rule:

- start with the composition read scope when the actor only needs subject-scoped read access
- add `SmartGatewayScopesFhirR4.ConsentCruds` only if the backend also needs consent management operations

## Shared Contract Sources

- [gdc-sdk-core-ts/README.md](https://github.com/Global-DataCare/gdc-sdk-core-ts/blob/main/README.md)
- [gdc-common-utils-ts/docs/101-CONSENT_ACCESS.md](https://github.com/Global-DataCare/gdc-common-utils-ts/blob/main/docs/101-CONSENT_ACCESS.md)

Reusable payload examples:

- [gdc-common-utils-ts/src/examples/organization-controller.ts](https://github.com/Global-DataCare/gdc-common-utils-ts/blob/main/src/examples/organization-controller.ts)
- [gdc-common-utils-ts/src/examples/individual-controller.ts](https://github.com/Global-DataCare/gdc-common-utils-ts/blob/main/src/examples/individual-controller.ts)
- [gdc-common-utils-ts/src/examples/professional.ts](https://github.com/Global-DataCare/gdc-common-utils-ts/blob/main/src/examples/professional.ts)
- [gdc-common-utils-ts/src/examples/shared.ts](https://github.com/Global-DataCare/gdc-common-utils-ts/blob/main/src/examples/shared.ts)
- [gdc-common-utils-ts/src/examples/lifecycle.ts](https://github.com/Global-DataCare/gdc-common-utils-ts/blob/main/src/examples/lifecycle.ts)
- [gdc-common-utils-ts/src/examples/api-flow-examples.ts](https://github.com/Global-DataCare/gdc-common-utils-ts/blob/main/src/examples/api-flow-examples.ts)

## API Index

## Full Public Surface

This package exports the full `gdc-sdk-core-ts` surface plus the Node runtime
modules below.

- [`src/runtime-contracts.ts`](src/runtime-contracts.ts)
  - types/constants: `LegacyNodeSourcePackage`, `NodeRuntimeMode`, `NodeInteropMode`, `TenantContext`, `NodeOperatorContext`, `NodeFetchLike`, `NodeRuntimeConfig`, `NodePackageStatus`, `GDC_SDK_NODE_STATUS`
- [`src/identity-bootstrap.ts`](src/identity-bootstrap.ts)
  - function: `initializeCommunicationIdentity(...)`
- [`src/async-polling.ts`](src/async-polling.ts)
  - types: `AcceptedPollResponse`
  - function: `pollUntilCompleteWithMethod(...)`
- [`src/poll-options.ts`](src/poll-options.ts)
  - re-export: `resolvePollOptionsFromSeconds(...)`
- [`src/host-onboarding.ts`](src/host-onboarding.ts)
  - types: `HostRouteContext`, `LegalOrganizationOrderInput`
  - function: `confirmLegalOrganizationOrderWithDeps(...)`
- [`src/individual-start.ts`](src/individual-start.ts)
  - types: `IndividualOrganizationBootstrapInput`, `OfferPreview`, `IndividualOrganizationStartResult`
  - function: `startIndividualOrganizationWithDeps(...)`
- [`src/individual-onboarding.ts`](src/individual-onboarding.ts)
  - types: `RouteContext`, `IndividualOrganizationConfirmOrderInput`
  - function: `confirmIndividualOrganizationOrderWithDeps(...)`
- [`src/device-activation.ts`](src/device-activation.ts)
  - types: `EmployeeDeviceActivationInput`, `EmployeeDeviceActivationRequestInput`, `EmployeeDeviceActivationResult`
  - functions: `activateEmployeeDeviceWithActivationCodeWithDeps(...)`, `activateEmployeeDeviceWithActivationRequestWithDeps(...)`
- [`src/smart-token.ts`](src/smart-token.ts)
  - types: `SmartTokenRequestInput`, `SmartTokenExchangeResult`
  - function: `requestSmartTokenWithDeps(...)`
- [`src/resource-operations.ts`](src/resource-operations.ts)
  - types: `OrganizationEmployeeCreationInput`, `IpsOrFhirImportInput`, `RelatedPersonUpsertInput`, `CommunicationIngestionInput`, `ClinicalDateRange`, `ClinicalBundleSearchInput`, `ConsentActorTargetInput`, `GrantProfessionalAccessInput`, `GrantProfessionalAccessResult`, `DigitalTwinGenerationInput`
  - functions: `createOrganizationEmployeeWithDeps(...)`, `importIpsOrFhirAndUpdateIndexWithDeps(...)`, `upsertRelatedPersonAndPollWithDeps(...)`, `ingestCommunicationAndUpdateIndexWithDeps(...)`, `searchClinicalBundleWithDeps(...)`, `searchLatestIpsWithDeps(...)`, `grantProfessionalAccessWithDeps(...)`, `generateDigitalTwinFromSubjectDataWithDeps(...)`
- [`src/session.ts`](src/session.ts)
  - types: `NodeCapability`, `NodeActorSessionContext`, `ActorSessionContext`
  - classes: `ActorSession`, `NodeActorSession`
- [`src/node-runtime-client.ts`](src/node-runtime-client.ts)
  - types: `HttpRuntimeClientOptions`, `NodeHttpClientOptions`
  - classes: `HttpRuntimeClient`, `NodeHttpClient`
- [`src/gdc-session-bridge.ts`](src/gdc-session-bridge.ts)
  - functions: `createNodeActorSessionsFromFacades(...)`, `createNodeActorSessionFromFacade(...)`, `createNodeActorSessionsFromDescriptor(...)`, `createNodeActorSessionFromDescriptor(...)`, `createActorSessionsFromFacades(...)`, `createActorSessionFromFacade(...)`, `createActorSessionsFromDescriptor(...)`, `createActorSessionFromDescriptor(...)`
- [`src/orchestration/client-port.ts`](src/orchestration/client-port.ts)
  - types: `RuntimeClient`, `NodeRuntimeClient`
  - functions: `requireClientMethod(...)`, `submitAndPollWithMethods(...)`, `canClientSubmitAndPoll(...)`, `submitAndPollWithClient(...)`
- [`src/orchestration/host-onboarding-sdk.ts`](src/orchestration/host-onboarding-sdk.ts)
  - class: `HostOnboardingSdk`
- [`src/orchestration/organization-controller-sdk.ts`](src/orchestration/organization-controller-sdk.ts)
  - class: `OrganizationControllerSdk`
- [`src/orchestration/organization-employee-sdk.ts`](src/orchestration/organization-employee-sdk.ts)
  - class: `OrganizationEmployeeSdk`
- [`src/orchestration/individual-controller-sdk.ts`](src/orchestration/individual-controller-sdk.ts)
  - class: `IndividualControllerSdk`
- [`src/orchestration/individual-member-sdk.ts`](src/orchestration/individual-member-sdk.ts)
  - class: `IndividualMemberSdk`
- [`src/orchestration/personal-sdk.ts`](src/orchestration/personal-sdk.ts)
  - class: `PersonalSdk`
- [`src/orchestration/professional-sdk.ts`](src/orchestration/professional-sdk.ts)
  - class: `ProfessionalSdk`
- [`src/legacy-compat.ts`](src/legacy-compat.ts)
  - compatibility aliases for simplified helpers, runtime classes, and legacy names such as `GdcNodeActorSession` and `GdcNodeHttpClient`

### Re-exported shared helpers from `gdc-sdk-core-ts`

- consent access helpers
- relationship invitation/acceptance builders
- communication/document builders
- draft/outbox helpers
- document facade helpers
- vital-sign helpers

### Node runtime client

- [`NodeHttpClient`](src/node-runtime-client.ts)
- [`NodeHttpClient.submitLegalOrganizationVerificationTransaction(...)`](src/node-runtime-client.ts)
- [`NodeHttpClient.ingestCommunicationAndUpdateIndex(...)`](src/node-runtime-client.ts)
- [`NodeHttpClient.submitCommunicationAndPoll(...)`](src/node-runtime-client.ts)
- [`NodeHttpClient.searchClinicalBundle(...)`](src/node-runtime-client.ts)
- [`NodeHttpClient.searchLatestIps(...)`](src/node-runtime-client.ts)
- [`NodeHttpClient.grantProfessionalAccess(...)`](src/node-runtime-client.ts)
- [`NodeHttpClient.requestSmartToken(...)`](src/node-runtime-client.ts)

### Runtime configuration

- [`NodeRuntimeConfig`](src/runtime-contracts.ts)
- [`initializeCommunicationIdentity(...)`](src/identity-bootstrap.ts)

### Low-level orchestration helpers

- [`createOrganizationEmployeeWithDeps(...)`](src/resource-operations.ts)
- [`importIpsOrFhirAndUpdateIndexWithDeps(...)`](src/resource-operations.ts)
- [`upsertRelatedPersonAndPollWithDeps(...)`](src/resource-operations.ts)
- [`ingestCommunicationAndUpdateIndexWithDeps(...)`](src/resource-operations.ts)
- [`searchClinicalBundleWithDeps(...)`](src/resource-operations.ts)
- [`searchLatestIpsWithDeps(...)`](src/resource-operations.ts)
- [`grantProfessionalAccessWithDeps(...)`](src/resource-operations.ts)

## Documentation Rule

- README explains backend-facing flows first.
- Shared contract shapes must be documented in `gdc-sdk-core-ts`, not duplicated here.
- Route details and GW-specific behavior belong in runtime docs and JSDoc, not in app-facing examples.

## Host Onboarding Runtime Flow

For legal-organization onboarding from a Node BFF/runtime, keep the host steps separate:

1. new flow: `Organization/_transaction`
2. legacy compatibility flow: `ICA _verify -> Organization/_activate`
3. downstream business continuation: `Order/_batch`

Use `OrganizationControllerSdk.submitLegalOrganizationVerificationTransaction(...)` or
`NodeHttpClient.submitLegalOrganizationVerificationTransaction(...)` for step 1.

Rules:

- `_transaction` and `_activate` are different flows
- transport/runtime communication keys stay outside the business payload
- controller binding key stays in `body.data[].resource.controller.*`
- do not mix this path with `requestIcaEnrollment` or Fabric

Legacy compatibility coverage in the live suite:

- the canonical test is `LIVE professional lifecycle on GW`
- set `RUN_LIVE_GW_E2E_HOST_VERIFICATION_TRANSACTION=1` to exercise:
  - `Organization/_transaction -> Order/_batch`
- set `RUN_LIVE_GW_E2E_HOST_VERIFICATION_TRANSACTION=0` to exercise the older:
  - `ICA _verify -> Organization/_activate -> Order/_batch`

Dedicated legacy live command:

```bash
cd /Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts
RUN_LIVE_GW_E2E=1 \
RUN_LIVE_GW_E2E_ACTOR_CHAIN=1 \
RUN_LIVE_GW_E2E_HOST_VERIFICATION_TRANSACTION=0 \
LIVE_GW_E2E_SUITE=professional \
node --test tests/live-gw-node-runtime.e2e.test.mjs
```

Live E2E legal PDF source:

- local file: set `LIVE_GW_HOST_VERIFICATION_PDF_PATH=/abs/path/file.pdf`
- public URL: set `LIVE_GW_HOST_VERIFICATION_PDF_URL=https://.../file.pdf`
- if both are present, the live suite prefers `LIVE_GW_HOST_VERIFICATION_PDF_URL`
- Dropbox-style links are normalized to `dl=1` direct-download mode automatically

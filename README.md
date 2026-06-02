# gdc-sdk-node-ts

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

## Start Here

If you are integrating this package for the first time, open these in order:

1. [docs/SDK_END_TO_END_101.md](./docs/SDK_END_TO_END_101.md)
   Ordered onboarding guide with end-to-end journeys, copy/paste snippets, and
   the recommended reading path for new backend integrators.
2. [docs/SDK_INTEGRATION_101.md](./docs/SDK_INTEGRATION_101.md)
   Real backend setup, imports, `initializeCommunicationIdentity(...)`,
   `new NodeHttpClient(...)`, route context, facade selection, and live method
   usage.
3. [docs/DISCOVERY_101.md](./docs/DISCOVERY_101.md)
   Node/BFF dataspace discovery, hosting-operator resolution, provider
   resolution, and the correct integration boundary for fallback and cache.
4. [gdc-sdk-core-ts/docs/SDK_FLOWS_101.md](https://github.com/Global-DataCare/gdc-sdk-core-ts/blob/main/docs/SDK_FLOWS_101.md)
   Actor split and business-flow map across organization, individual,
   permissions, invitation, import, and SMART flows.
5. [gdc-common-utils-ts/src/examples/](https://github.com/Global-DataCare/gdc-common-utils-ts/tree/main/src/examples)
   Shared payload values used by the docs and tests.
6. [gdc-common-utils-ts/docs/LIFECYCLE_101.md](https://github.com/Global-DataCare/gdc-common-utils-ts/blob/main/docs/LIFECYCLE_101.md)
   Canonical `enable/disable/delete` semantics and copy/paste placeholders.

If you need the shortest path:

- main onboarding guide:
  [docs/SDK_END_TO_END_101.md](./docs/SDK_END_TO_END_101.md)
- GW CORE app identity:
  `appId` mandatory, `appVersion` optional with default `v1.0`
- backend technical identity:
  [`initializeCommunicationIdentity(...)`](./docs/SDK_INTEGRATION_101.md)
  for the technical channel/runtime identity, not the legal organization id
- runtime client:
  [`NodeHttpClient`](src/node-runtime-client.ts)
- step-by-step runtime usage:
  [docs/SDK_INTEGRATION_101.md](./docs/SDK_INTEGRATION_101.md)
- dataspace discovery and fallback/cache boundary:
  [docs/DISCOVERY_101.md](./docs/DISCOVERY_101.md)

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
- [tests/dataspace-resolver.101.test.mjs](tests/dataspace-resolver.101.test.mjs)
  Dataspace discovery 101 with capability filtering, jurisdiction filtering,
  reader-vs-provider semantics, and fetcher-level fallback/cache examples.
- [tests/default-first-dataspace-discovery.101.test.mjs](tests/default-first-dataspace-discovery.101.test.mjs)
  Portal-style `default-first` discovery with simple `getHosts(...)`,
  `getIndexProviders(...)`, and `getDigitalTwinProviders(...)` calls.

## Live GW CORE Flow

Use [tests/live-gw-node-runtime.e2e.test.mjs](tests/live-gw-node-runtime.e2e.test.mjs)
as the canonical runtime flow.

Teaching rule:

- defaults come from `gdc-common-utils-ts/examples`
- override with env vars only when your tenant, bearer, or route is different
- local GW default is `http://127.0.0.1:3000`
- Docker-exposed GW can be overridden with `BASE_URL=http://127.0.0.1:8000`

Current live flow covered by the test suite:

1. bootstrap tenant / legal organization
2. bootstrap doctor or controller employee
3. bootstrap individual and grant consent for the doctor
4. ingest two IPS `Communication` bundles, each with one `MedicationStatement`
5. read the IPS/clinical index and verify both medications are present
6. persist audit/debug traces in `test-results/*.jsonl`

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

Run the IPS ingestion/search branch as well:

```bash
RUN_LIVE_GW_E2E_IPS_INGESTION=1 \
npm run test:e2e:live-gw
```

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
- fetch the canonical `/.well-known/dspace-version` entrypoint
- derive the participant-scoped `/dsp/catalog/dcat.json` artifact
- return normalized provider/operator matches to portal or app backends

Primary references:

- [docs/DISCOVERY_101.md](./docs/DISCOVERY_101.md)
- [tests/default-first-dataspace-discovery.101.test.mjs](tests/default-first-dataspace-discovery.101.test.mjs)
- [tests/dataspace-resolver.101.test.mjs](tests/dataspace-resolver.101.test.mjs)
- [tests/dataspace-resolver.test.mjs](tests/dataspace-resolver.test.mjs)

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
- [gdc-common-utils-ts/docs/CONSENT_ACCESS_101.md](https://github.com/Global-DataCare/gdc-common-utils-ts/blob/main/docs/CONSENT_ACCESS_101.md)

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

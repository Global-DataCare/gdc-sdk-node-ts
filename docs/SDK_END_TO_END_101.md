# Node SDK End-to-End 101

This is the main onboarding guide for backend developers integrating
`gdc-sdk-node-ts`.

Use this file first when you want:

- one ordered reading path
- end-to-end flows instead of isolated snippets
- copy/paste examples with the current SDK surface
- a clear separation between:
  - legal organization flows
  - individual subject flows
  - permissions
  - IPS import
  - SMART/search

If you need lower-level runtime details after this guide, open:

- [SDK_INTEGRATION_101.md](./SDK_INTEGRATION_101.md)
- [gdc-sdk-core-ts/docs/SDK_FLOWS_101.md](https://github.com/Global-DataCare/gdc-sdk-core-ts/blob/main/docs/SDK_FLOWS_101.md)
- [gdc-common-utils-ts/docs/CONSENT_ACCESS_101.md](https://gitlab.dev.accuro.es/idi/espacio-de-datos/global-datacare/gdc-common-utils-ts/-/blob/main/docs/CONSENT_ACCESS_101.md)

## Index

1. [What this SDK owns](#1-what-this-sdk-owns)
2. [What package to open for each question](#2-what-package-to-open-for-each-question)
3. [The two main journeys](#3-the-two-main-journeys)
4. [Install and imports](#4-install-and-imports)
5. [Runtime bootstrap](#5-runtime-bootstrap)
6. [Journey A: Legal organization to professional access](#6-journey-a-legal-organization-to-professional-access)
7. [Journey B: Individual subject to IPS import and search](#7-journey-b-individual-subject-to-ips-import-and-search)
8. [Permissions and invitation model](#8-permissions-and-invitation-model)
9. [Lifecycle 101](#9-lifecycle-101)
10. [Common mistakes to avoid](#10-common-mistakes-to-avoid)
11. [Copy/paste checklist for docs and examples](#11-copypaste-checklist-for-docs-and-examples)
12. [Source files behind these examples](#12-source-files-behind-these-examples)

## 1. What this SDK owns

`gdc-sdk-node-ts` is the runtime package for Node backends.

It owns:

- HTTP runtime calls to GW
- submit/poll orchestration
- onboarding flows
- employee creation
- consent grant submission
- `RelatedPerson` upsert
- `Communication` ingestion
- SMART token requests
- subject document search

It does not own the canonical business contract by itself.

Those responsibilities are split like this:

- `gdc-sdk-node-ts`
  runtime execution
- `gdc-sdk-core-ts`
  shared business helpers and normalized payload builders
- `gdc-common-utils-ts`
  constants, examples, cryptography helpers, DID builders, shared example data

## 2. What package to open for each question

Open `gdc-sdk-node-ts` when your question is:

- what class do I instantiate
- what method do I call
- what runtime result do I get back

Open `gdc-sdk-core-ts` when your question is:

- how do permissions get evaluated
- how do invitation payloads get normalized
- how do I build a communication/document helper payload

Open `gdc-common-utils-ts` when your question is:

- what constants should I use
- what example input shape already exists
- how do I build `did:web` values consistently

## 3. The two main journeys

For new integrators, the SDK is easier to understand if you separate the two
main business journeys.

Journey A: legal organization side

1. activate organization from ICA proof
2. confirm returned order or offer
3. create employee or professional
4. activate employee device
5. request SMART token

Journey B: individual subject side

1. create individual organization or subject index
2. confirm returned order or offer
3. create permissions for a professional or caregiver
4. import IPS or FHIR content
5. search latest IPS or a clinical bundle

Do not mix those journeys into one mental model.

Important semantic split:

- legal organization activation uses controller/legal representative semantics
- individual bootstrap uses subject-owner semantics
- individual bootstrap is not `individual _activate`

## 4. Install and imports

Copy/paste starter:

```ts
import {
  NodeHttpClient,
  ProfessionalSdk,
  IndividualControllerSdk,
  IndividualMemberSdk,
  createCommunicationDraft,
  addFhirResourceToDraft,
  createOutboxJobFromDraft,
  createHeartRateObservation,
  createBloodPressureObservation,
  initializeCommunicationIdentity,
  type HostRouteContext,
  type TenantContext,
} from 'gdc-sdk-node-ts';

import { CryptographyService } from 'gdc-common-utils-ts';
import {
  ClaimsOrganizationSchemaorg,
  ClaimsPersonSchemaorg,
  ClaimsServiceSchemaorg,
  DataspaceSectors,
  HealthcareActorRoles,
  HealthcareConsentPurposes,
  HealthcareConsentActions,
  HealthcareBasicSections,
  ResourceTypesFhirR4,
  SmartGatewayScopesFhirR4,
  buildControllerBindingInput,
  buildOrganizationDidWeb,
  buildProfessionalDidWeb,
  buildIndividualDidWeb,
  buildSmartCompositionReadScope,
} from 'gdc-common-utils-ts';
```

## 5. Runtime bootstrap

This is the minimum runtime setup most backends need before calling any flow.

There are two different initializations here:

1. app/runtime identity for GW headers and policy
2. technical communication identity for transport keys

They are not the same thing.

- `appId`
  identifies the portal/backend application towards GW CORE
- `entityId` in `initializeCommunicationIdentity(...)`
  identifies the local technical communication profile or channel runtime that
  owns the transport keys
- controller/professional/subject DIDs
  identify human/domain actors

Do not teach `entityId` as if it were the organization id.

```ts
const cryptography = new CryptographyService(cryptoHelper);

const deviceIdentity = await initializeCommunicationIdentity({
  entityId: 'portal.example.org:acme-id:backend-runtime',
  cryptography,
  includeVcSigningKey: true,
  seedMaterial: crypto.randomBytes(32),
});

const tenantContext: TenantContext = {
  tenantId: 'acme-id',
  jurisdiction: 'ES',
  sector: DataspaceSectors.HealthCare,
};

const hostOperatorContext: HostRouteContext = {
  jurisdiction: 'ES',
  sector: DataspaceSectors.HealthCare,
};

const client = new NodeHttpClient({
  baseUrl: 'https://gw.example.org',
  bearerToken: process.env.GW_BEARER_TOKEN,
  ctx: tenantContext,
});
```

What each value means:

- `deviceIdentity`
  technical communication identity for the backend/app profile
- `tenantContext`
  tenant-scoped route context used by subject and organization runtime calls
- `hostOperatorContext`
  host-registry routing context for legal organization activation flows
- `client`
  runtime executor used by the role-oriented facades

Important:

- `HostRouteContext` is a host-routing object, not a node-operator identity model
- `controllerDid` and `hostDid` exist as optional route fields for some payloads,
  but they should not be introduced in the first example unless the flow really
  needs them

### 5.1 Two deployment modes

Simple / compatibility mode:

- useful for local demos and incremental integration
- may use plain JSON or legacy compatibility transport
- FAPI and encrypted DIDComm are not the first concern

Secure mode:

- app identity still starts with `appId` / `appVersion`
- technical communication identity uses `initializeCommunicationIdentity(...)`
- transport uses FAPI and encrypted DIDComm
- communication keys are the PQC-capable technical channel keys, not the human
  controller keys

## 6. Journey A: Legal organization to professional access

### 6.1 Create the facade

```ts
const professionalSdk = new ProfessionalSdk(client);
```

### 6.2 Activate the legal organization from ICA proof

Use this when the integrator already has:

- `vpToken` from ICA or trust bootstrap
- controller DID
- controller alias such as `mailto:`
- public signing key
- public auxiliary keys
- business registration claims

Copy/paste example:

```ts
const orgControllerDid = 'did:web:people.acme.org:controllers:primary';
const emailControllerOrg = 'legal.rep@acme.org';

const controllerBinding = buildControllerBindingInput({
  did: orgControllerDid,
  sameAs: `mailto:${emailControllerOrg}`,
  publicSignKey,
  publicKeys,
});

const organizationActivation = await professionalSdk.activateOrganizationInGatewayFromIcaProof(
  hostOperatorContext,
  {
    vpToken: '<ica-proof-token>',
    controller: controllerBinding,
    service: {
      url: 'https://operator.example.net/acme-id/cds-es/v1/health-care',
      capabilities: [
        ServiceCapability.IndexingProvider,
        ServiceCapability.IndexingReader,
      ],
    },
    additionalClaims: {
      [ClaimsOrganizationSchemaorg.legalName]: 'ACME HEALTH SL',
      [ClaimsOrganizationSchemaorg.identifierType]: 'taxID',
      [ClaimsOrganizationSchemaorg.identifierValue]: 'VATES-B00112233',
      [ClaimsOrganizationSchemaorg.addressCountry]: hostOperatorContext.jurisdiction,
      [ClaimsOrganizationSchemaorg.taxId]: 'VATES-B00112233',
      [ClaimsPersonSchemaorg.email]: emailControllerOrg,
      [ClaimsPersonSchemaorg.hasOccupationalRoleValue]: 'RESPRSN',
      [ClaimsServiceSchemaorg.category]: hostOperatorContext.sector,
      [ClaimsServiceSchemaorg.identifier]: 'did:web:public.acme.org',
    },
  },
);
```

Mandatory rule for this onboarding step:

- legal-organization activation always declares `service.url`
- legal-organization activation always declares `service.capabilities`
- GW persists them in `org.schema.Service.serviceType` and uses them for DID
  discovery and DCAT3 service offering publication

What comes back:

- async submit result
- async poll result
- the organization activation outcome used by the next step

### 6.3 Confirm the organization order or offer

In the legal organization journey, order confirmation is a separate step.

Use the `offerId` returned by the previous accepted activation response.

```ts
await client.confirmLegalOrganizationOrder(hostOperatorContext, {
  offerId: 'offer-123',
  jurisdiction: hostOperatorContext.jurisdiction,
  sector: hostOperatorContext.sector,
  timeoutSeconds: 12,
  intervalSeconds: 3,
});
```

Notes:

- the routing object is `hostOperatorContext`, not an organization-controller identity
- for the basic example there is no reason to inject controller identity into
  this route object

### 6.4 Create an employee or professional under the organization

```ts
const organizationDid = buildOrganizationDidWeb({
  hostDidWeb: 'did:web:api.example.org',
  tenantId: tenantContext.tenantId,
  jurisdiction: tenantContext.jurisdiction,
  sector: tenantContext.sector,
});

const emailProfessional = 'doctor@example.org';

const professionalDid = buildProfessionalDidWeb({
  organizationDidWeb: organizationDid,
  email: emailProfessional,
  role: HealthcareActorRoles.Physician,
});

await professionalSdk.createOrganizationEmployee(tenantContext, {
  employeeClaims: {
    '@context': 'org.schema',
    [ClaimsPersonSchemaorg.identifier]: professionalDid,
    [ClaimsPersonSchemaorg.email]: emailProfessional,
    [ClaimsPersonSchemaorg.hasOccupationalRoleValue]: HealthcareActorRoles.Physician,
    [ClaimsPersonSchemaorg.memberOfOrgTaxId]: tenantContext.tenantId,
  },
});
```

Where each value comes from:

- `organizationDid`
  provider/organization lineage
- `emailProfessional`
  directory or HR/admin input
- `professionalDid`
  canonical professional DID built from organization lineage and role
- `employeeClaims`
  flattened claim view expected by the current runtime

### 6.5 Activate the employee device

If your flow already issued activation material, use it to bind a device/app
profile.

```ts
await professionalSdk.activateEmployeeDeviceWithActivationRequest({
  activationCode: 'ACT-001',
  idToken: '<employee-id-token>',
  dcrPayload: {
    application_type: 'web',
  },
});
```

### 6.6 Request a SMART token for subject access

```ts
const subjectDid = buildIndividualDidWeb({
  organizationDidWeb: organizationDid,
  subjectId: 'subject-001',
});

const token = await professionalSdk.requestSmartToken({
  actorDid: professionalDid,
  clientId: 'did:web:portal.example.org:acme',
  subjectDid,
  idToken: '<openid4vp-id-token>',
  vpToken: '<openid4vp-vp-token>',
  smartTokenKind: 'openid-smart',
  scopes: [
    buildSmartCompositionReadScope({
      subjectDid,
      sections: HealthcareBasicSections.PatientSummaryDocument.claim,
    }),
  ],
});
```

Mental model:

- `actorDid`
  who is asking
- `subjectDid`
  whose data is being requested
- `tenantContext`
  which tenant route issues the token

The example above only requests read access to the subject composition scope.

If your backend also needs consent management operations, the current shared
constant is:

```ts
SmartGatewayScopesFhirR4.ConsentCruds
```

Today that resolves to:

```ts
'organization/Consent.cruds'
```

Do not add that scope to the first read example unless you actually want
consent create/read/update/delete/search capabilities in the token request.

## 7. Journey B: Individual subject to IPS import and search

### 7.1 Create the individual facade

```ts
const individualSdk = new IndividualControllerSdk(client);
```

### 7.2 Start the individual organization or subject index

This is not legal organization activation.

```ts
const individualStart = await individualSdk.startIndividualOrganization({
  tenantId: tenantContext.tenantId,
  jurisdiction: tenantContext.jurisdiction,
  sector: tenantContext.sector,
  alternateName: 'ana',
  controllerEmail: 'ana.parent@example.org',
  timeoutSeconds: 7,
  intervalSeconds: 2,
});
```

Current CORE note:

- this bootstrap example uses `controllerEmail` as the primary controller input
- if your integration already tracks a public controller DID, keep that
  variable as `individualControllerDid`, but do not invent a fake usage in this
  snippet when the current runtime call does not consume it directly

What you get back:

- async submit result
- async poll result
- `offerId`
- `offerPreview`

### 7.3 Confirm the returned order or offer

```ts
await individualSdk.confirmIndividualOrganizationOrder({
  tenantId: tenantContext.tenantId,
  jurisdiction: tenantContext.jurisdiction,
  sector: tenantContext.sector,
  offerId: individualStart.offerId,
  timeoutSeconds: 9,
  intervalSeconds: 2,
});
```

### 7.4 Build the subject DID

Once the provider lineage is known, derive the individual DID from it.

```ts
const organizationDid = buildOrganizationDidWeb({
  hostDidWeb: 'did:web:api.example.org',
  tenantId: tenantContext.tenantId,
  jurisdiction: tenantContext.jurisdiction,
  sector: tenantContext.sector,
});

const subjectDid = buildIndividualDidWeb({
  organizationDidWeb: organizationDid,
  subjectId: 'subject-001',
});
```

Do not hand-invent a `did:web` string in docs if a builder already exists.

### 7.5 Create a permission for a professional

```ts
const emailProfessional = 'doctor@example.org';

await individualSdk.grantProfessionalAccess(tenantContext, {
  subjectDid,
  actorId: emailProfessional,
  actorRole: HealthcareActorRoles.Physician,
  purpose: HealthcareConsentPurposes.Treatment,
  actions: [HealthcareConsentActions.PatientSummaryDocument],
});
```

This is the minimum permission-grant example most new integrators need first.

### 7.6 Create or update a `RelatedPerson`

Use this when the actor is a caregiver, guardian, grandparent, or another
non-employee subject-side relation.

```ts
const memberSdk = new IndividualMemberSdk(client);

await memberSdk.upsertRelatedPersonAndPoll(tenantContext, {
  relatedPersonPayload: {
    thid: 'relatedperson-grandfather-001',
    body: {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [{
        resource: {
          resourceType: 'RelatedPerson',
          id: 'grandfather-001',
          patient: { reference: subjectDid },
          relationship: [{ text: 'Grandfather' }],
          name: [{ text: 'Jose Example' }],
        },
      }],
    },
  },
});
```

### 7.7 Build a communication with IPS or FHIR content

Recommended pattern:

1. create a draft
2. add FHIR resources
3. freeze it into an outbox job
4. send the communication

```ts
const emailProfessional = 'doctor@example.org';

const professionalDid = buildProfessionalDidWeb({
  organizationDidWeb: organizationDid,
  email: emailProfessional,
  role: HealthcareActorRoles.Physician,
});

let draft = createCommunicationDraft({
  subject: subjectDid,
  sender: professionalDid,
  recipient: organizationDid,
  noteText: 'IPS update with vital signs',
});

const heartRate = createHeartRateObservation({
  subject: subjectDid,
  effectiveDateTime: '2026-05-22T10:00:00Z',
  value: 72,
});

const bloodPressure = createBloodPressureObservation({
  subject: subjectDid,
  effectiveDateTime: '2026-05-22T10:00:00Z',
  systolic: 120,
  diastolic: 78,
});

draft = addFhirResourceToDraft(draft, heartRate, { noteText: 'Heart rate' });
draft = addFhirResourceToDraft(draft, bloodPressure, { noteText: 'Blood pressure' });

const job = createOutboxJobFromDraft(draft, {
  batchOptions: {
    requestUrl: 'individual/org.hl7.fhir.r4/Communication',
  },
});
```

Important:

- `createOutboxJobFromDraft(...)` does not send anything over the network
- it only freezes the current draft into:
  - `job.payload`: the `Communication`
  - `job.envelope`: the prebuilt batch message
  - `job.status`: local outbox status such as `ready`
- network submission starts in the next step

### 7.8 Send the communication and wait for indexing

```ts
await client.ingestCommunicationAndUpdateIndex(tenantContext, {
  communicationPayload: job.payload,
});
```

This is the converged runtime path for:

- auditable `Communication`
- `DocumentReference` projection
- `Composition` projection
- IPS-aligned resource indexing

### 7.9 Search the latest IPS

```ts
const latestIps = await client.searchLatestIps(tenantContext, {
  subject: subjectDid,
});
```

### 7.10 Search a clinical bundle with explicit filters

```ts
const bundleSearch = await client.searchClinicalBundle(tenantContext, {
  subject: subjectDid,
  section: HealthcareBasicSections.PatientSummaryDocument.claim,
  includedTypes: [
    ResourceTypesFhirR4.Composition,
    ResourceTypesFhirR4.DocumentReference,
    ResourceTypesFhirR4.Observation,
  ],
});
```

## 8. Permissions and invitation model

The documentation split today is:

- permission creation and runtime submission:
  `gdc-sdk-node-ts`
- permission evaluation and missing-permission helpers:
  `gdc-sdk-core-ts`
- permission examples and shared constants:
  `gdc-common-utils-ts`

Read these together:

- [gdc-sdk-core-ts/docs/SDK_FLOWS_101.md](https://github.com/Global-DataCare/gdc-sdk-core-ts/blob/main/docs/SDK_FLOWS_101.md)
- [gdc-common-utils-ts/docs/CONSENT_ACCESS_101.md](https://gitlab.dev.accuro.es/idi/espacio-de-datos/global-datacare/gdc-common-utils-ts/-/blob/main/docs/CONSENT_ACCESS_101.md)

Important:

- explicit deny for a direct actor target wins first
- direct permit wins over broader organization or jurisdiction rules
- default is deny

About invitation flows:

- relationship invitation, OTP, and PIN helpers already live in `gdc-sdk-core-ts`
- they are part of the intended onboarding model
- for Node integrators, they should be treated as the next layer after basic
  permission creation, not as the first teaching step

## 9. Lifecycle 101

Use this as the current GW CORE lifecycle map.

Employee today:

- `createOrganizationEmployee(...)`
  creates or reactivates
- `disableEmployee(...)`
  uses the current `Employee/_batch` plus entry `request.method = DELETE`
- `purgeEmployee(...)`
  uses the current explicit `Employee/_purge` route
- actor:
  only `OrganizationControllerSdk`

Individual/family today:

- `startIndividualOrganization(...)`
  uses the current `Organization/_transaction` alias
- `confirmIndividualOrganizationOrder(...)`
  confirms the returned order/offer
- `disableIndividual(...)`
  uses the current explicit `Organization/_disable` route
- `purgeIndividual(...)`
  uses the current explicit `Organization/_purge` route
- actor:
  only `IndividualControllerSdk`

Member and consent boundaries:

- `upsertRelatedPersonAndPoll(...)`
  manages the `RelatedPerson` membership/caregiver record
- `disableIndividualMember(...)` and `purgeIndividualMember(...)`
  are controller-only placeholders today and intentionally fail fast until GW CORE adds the stable `RelatedPerson` lifecycle contract
- `grantProfessionalAccess(...)`
  creates the consent record used by SMART/data access
- `Communication`
  is not the canonical lifecycle transport for employee or individual lifecycle in current GW CORE

Business semantics the SDK now preserves:

- disable does not release licenses
- purge requires inactive status first
- purge releases/disassociates licenses and preserves traceability

Canonical shared example sources for lifecycle payload data:

```ts
import {
  EXAMPLE_EMPLOYEE_DISABLE_MESSAGE,
  EXAMPLE_INDIVIDUAL_DISABLE_MESSAGE,
  EXAMPLE_LIFECYCLE_REFERENCE,
} from 'gdc-common-utils-ts/examples';
```

Current forward-looking TODOs intentionally left in the SDK source:

- `TODO(gw-core-lifecycle-target-patch-employee-disable)`
- `TODO(gw-core-lifecycle-target-patch-individual-disable)`

## 10. Common mistakes to avoid

- Do not teach legal organization activation and individual bootstrap as if they
  were the same flow.
- Do not start docs from raw GW wire payloads.
- Do not invent `did:web` values manually when a builder already exists.
- Do not hardcode raw purpose, role, or section literals when shared constants
  already exist.
- Do not force a beginner to jump first into archived `dataspace-client-sdk-node`
  material.
- Do not describe individual bootstrap as `individual _activate`.
- Do not mix controller-person keys with technical app/device keys.

## 11. Copy/paste checklist for docs and examples

A new example is in good shape when it satisfies all of these:

- starts from variables the integrator already knows
- explains where each variable comes from
- uses shared constants and builders
- calls a real exported SDK method
- makes clear which returned value is used by the next step

Preferred teaching names:

- `emailProfessional`
- `emailControllerOrg`
- `emailControllerIndividual`
- `emailRelatedPerson`
- `organizationDid`
- `professionalDid`
- `subjectDid`
- `orgControllerDid`
- `individualControllerDid`

## 12. Source files behind these examples

If you need the exact reference files used to maintain this guide, open:

- [README.md](./README.md)
- [SDK_INTEGRATION_101.md](./SDK_INTEGRATION_101.md)
- [tests/host-onboarding.test.mjs](./tests/host-onboarding.test.mjs)
- [tests/individual-start.test.mjs](./tests/individual-start.test.mjs)
- [tests/individual-onboarding.test.mjs](./tests/individual-onboarding.test.mjs)
- [tests/device-activation.test.mjs](./tests/device-activation.test.mjs)
- [tests/resource-operations.test.mjs](./tests/resource-operations.test.mjs)
- [tests/smart-token.test.mjs](./tests/smart-token.test.mjs)
- [gdc-common-utils-ts/src/examples/organization-controller.ts](https://gitlab.dev.accuro.es/idi/espacio-de-datos/global-datacare/gdc-common-utils-ts/-/blob/main/src/examples/organization-controller.ts)
- [gdc-common-utils-ts/src/examples/individual-controller.ts](https://gitlab.dev.accuro.es/idi/espacio-de-datos/global-datacare/gdc-common-utils-ts/-/blob/main/src/examples/individual-controller.ts)
- [gdc-common-utils-ts/src/examples/professional.ts](https://gitlab.dev.accuro.es/idi/espacio-de-datos/global-datacare/gdc-common-utils-ts/-/blob/main/src/examples/professional.ts)
- [gdc-common-utils-ts/src/examples/relationship-access.ts](https://gitlab.dev.accuro.es/idi/espacio-de-datos/global-datacare/gdc-common-utils-ts/-/blob/main/src/examples/relationship-access.ts)

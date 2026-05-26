# SDK Integration 101 for Node Backends

This guide is for a backend developer who wants to integrate `gdc-sdk-node-ts` step by step for secure communications, onboarding, consent, IPS/FHIR ingestion, and document search.

If you are new to the SDK and want the most didactic end-to-end entry point
with a clean index and copy/paste snippets, start here first:

- [SDK_END_TO_END_101.md](./SDK_END_TO_END_101.md)

This file remains the runtime-oriented companion guide.

It is intentionally practical and conservative:

- show the current API that exists today
- avoid promising discovery APIs that are still converging
- explain how to compose documents and communications with the shared core helpers

## Documentation Rules For This 101

When adding or updating examples in this file:

- start from semantic variables, not GW wire payloads
- show where each variable comes from
- prefer shared constants and helper builders over raw literals
- use canonical names such as:
  - `subjectDid`
  - `professionalDid`
  - `orgControllerDid`
  - `individualControllerDid`
  - `emailProfessional`
  - `emailControllerOrg`
  - `emailControllerIndividual`
  - `emailRelatedPerson`
- treat old `EXAMPLE_*` aliases as compatibility only, not as the preferred
  names for new teaching material

In short:

1. variable the integrator knows
2. helper that normalizes it
3. SDK method that executes it
4. result used by the next step

Not:

1. nested GW JSON body
2. unexplained fields
3. caller hand-shaping transport claims

## 1. What package does what

- `gdc-common-utils-ts`
  - low-level shared primitives
  - cryptography and JOSE helpers
  - FHIR/DID/DIDComm-related constants and utilities
  - technical communication identity bootstrap from seed
- `gdc-sdk-core-ts`
  - runtime-neutral document and communication helpers
  - drafts, outbox, document facades, vital signs builders
- `gdc-sdk-node-ts`
  - Node runtime client
  - submit/poll orchestration
  - organization/professional/individual facades

Reference for CORE GW trust/VC semantics used by the examples below:

- [gwtemplate-node-ts/docs/API_CORE_INTEGRATION.md](../gwtemplate-node-ts/docs/API_CORE_INTEGRATION.md)
  - activation trust rules
  - `credentialSubject.memberOf.taxID`
  - `credentialSubject.hasOccupation.identifier.value`

## 2. Current discovery status

The full ICA -> node operator -> DCAT3 service provider discovery API is not yet closed as a dedicated SDK surface.

Today, the recommended pattern is:

1. bootstrap from one or more ICA `did:web` values or known base URLs
2. resolve their DID documents and `/.well-known` metadata outside or just before the SDK runtime
3. choose the target provider/operator DID or base URL
4. initialize the runtime client against that provider

What already exists today:

- provider bootstrap by URL/base URL
- provider bootstrap by `did:web` in the frontend SDK
- direct GW runtime calls in the node SDK
- shared runtime-neutral contracts now exist in `gdc-sdk-core-ts` for:
  - `IdentityStore`
  - `DiscoveryFacade`
  - canonical `_activate` payload building
  - provider DID to `service[]` endpoint resolution

What is still converging:

- first-class SDK methods like `discoverIcas(...)`, `discoverNodeOperators(...)`, `discoverServiceProviders(...)`
- DCAT3-specific typed discovery helpers
- node runtime wiring that uses those contracts end-to-end instead of caller-provided base URLs

For evaluations and demo environments, it is acceptable to start from:

- one ICA `did:web`
- one provider/operator base URL
- one tenant/jurisdiction/sector route context

Reusable payload source of truth for the examples in this guide:

- [gdc-common-utils-ts/src/examples/organization-controller.ts](https://gitlab.dev.accuro.es/idi/espacio-de-datos/global-datacare/gdc-common-utils-ts/-/blob/main/src/examples/organization-controller.ts)
- [gdc-common-utils-ts/src/examples/individual-controller.ts](https://gitlab.dev.accuro.es/idi/espacio-de-datos/global-datacare/gdc-common-utils-ts/-/blob/main/src/examples/individual-controller.ts)
- [gdc-common-utils-ts/src/examples/professional.ts](https://gitlab.dev.accuro.es/idi/espacio-de-datos/global-datacare/gdc-common-utils-ts/-/blob/main/src/examples/professional.ts)
- [gdc-common-utils-ts/src/examples/shared.ts](https://gitlab.dev.accuro.es/idi/espacio-de-datos/global-datacare/gdc-common-utils-ts/-/blob/main/src/examples/shared.ts)
- [gdc-common-utils-ts/src/examples/api-flow-examples.ts](https://gitlab.dev.accuro.es/idi/espacio-de-datos/global-datacare/gdc-common-utils-ts/-/blob/main/src/examples/api-flow-examples.ts)
- [tests/fixtures/ica-vp-minimal.json](tests/fixtures/ica-vp-minimal.json)

## 2.A Consent access model used by the node SDK

The node SDK consumes the shared consent-access model from:

- `gdc-common-utils-ts/docs/CONSENT_ACCESS_101.md`
- `gdc-sdk-core-ts/src/consent-access.ts`

Use it for:

- controller view of all active permissions by actor target
- evaluation of one SMART request against the aggregated consent set
- extraction of missing sections/resource types
- creation of a canonical permission-request `Communication`
- recovery of that request by `Communication.identifier`, `thid`, or linked CID

Precedence is:

1. explicit deny for a concrete email
2. explicit permit for a concrete email
3. organization
4. jurisdiction
5. default deny

CORE vs extension note:

- individual/controller bootstrap examples are email-first in CORE
- phone-first bootstrap or consent side-fields are extension concerns, for example UNID-style notification flows
- `tenantId` examples are identifier-like route values such as `acme-id`

Semantic split to keep explicit:

- individual/family bootstrap
  - the human controller is modeled as owner of the subject index organization
  - route/builders therefore publish `org.schema.Organization.owner.email` or `org.schema.Organization.owner.telephone`
- legal organization activation
  - the human controller is modeled as `Person` / legal representative member of a legal organization
  - trust policy and VC binding therefore use `credentialSubject.memberOf.*` plus `credentialSubject.hasOccupation.*`

## 3. Install and imports

```ts
import {
  NodeHttpClient,
  OrganizationControllerSdk,
  ProfessionalSdk,
  IndividualControllerSdk,
  IndividualMemberSdk,
  createCommunicationDraft,
  addFhirResourceToDraft,
  createOutboxJobFromDraft,
  createCommunicationFacade,
  createHeartRateObservation,
  createBloodPressureObservation,
  createBodyTemperatureObservation,
  initializeCommunicationIdentity,
  type TenantContext,
  type HostRouteContext,
} from 'gdc-sdk-node-ts';

import { CryptographyService } from 'gdc-common-utils-ts';
import {
  ClaimsOrganizationSchemaorg,
  ClaimsPersonSchemaorg,
  ClaimsServiceSchemaorg,
  DataspaceSectors,
  buildControllerBindingInput,
  buildOrganizationDidWeb,
  buildProfessionalDidWeb,
  buildIndividualDidWeb,
  buildSmartCompositionReadScope,
  HealthcareActorRoles,
  HealthcareBasicSections,
  HealthcareConsentPurposes,
  HealthcareConsentActions,
  ResourceTypesFhirR4,
  SmartGatewayScopesFhirR4,
} from 'gdc-common-utils-ts';

import {
  EXAMPLE_ACTIVATE_ORGANIZATION_FROM_ICA_PROOF_INPUT,
  EXAMPLE_CONTROLLER_DID,
  EXAMPLE_CONTROLLER_PUBLIC_KEYS,
  EXAMPLE_CONTROLLER_SAME_AS,
  EXAMPLE_CONTROLLER_SIGN_KEY,
  EXAMPLE_HOST_ROUTE_CONTEXT,
  EXAMPLE_INDIVIDUAL_ORGANIZATION_ORDER_INPUT,
  EXAMPLE_INDIVIDUAL_ORGANIZATION_START_INPUT,
  EXAMPLE_TENANT_ROUTE_CONTEXT,
  cloneExample,
} from 'gdc-common-utils-ts/examples';
```

## 4. Bootstrap technical communication identity from seed

Use this for the technical portal/device/app profile identity.

This is not the same as the personal wallet/controller identity of the
professional or individual who may later sign access-token or authorization
requests. This identity is for securing communications.

```ts
const cryptography = new CryptographyService(cryptoHelper);

const deviceIdentity = await initializeCommunicationIdentity({
  entityId: 'did:web:portal.example.org:acme',
  cryptography,
  includeVcSigningKey: true,
  // Deterministic mode requires an explicit seed.
  seedMaterial: crypto.randomBytes(32),
});

console.log(deviceIdentity.commSigningKeyPair.publicJWKey.kid);
console.log(deviceIdentity.commEncryptionKeyPair.publicJWKey.kid);
console.log(deviceIdentity.headers.jwsProtected);
console.log(deviceIdentity.headers.jweHeader);
```

What you get:

- communication signing key pair
- communication encryption key pair
- optional VC signing key pair
- JOSE header templates for:
  - `meta.jws.protected`
  - `meta.jwe.header`

If you omit `seedMaterial`:

- the helper defaults to `mode = random`
- `mode = deterministic` requires explicit `seedMaterial`

In demo/plaintext mode, you can keep these as bootstrap metadata even if you are not yet signing or encrypting messages.

## 5. Create the node runtime client

Before the first real GW call:

- `appId` should always be set
- `appVersion` is optional
- if you omit `appVersion`, the SDK sends `v1.0`
- if `appId` is a URL or domain, the SDK converts it to reverse-DNS

Copy/paste example:

```ts
const client = new NodeHttpClient({
  baseUrl: 'https://gw.example.org',
  appInfo: {
    appId: 'https://globaldatacare.es/backend',
    appType: 'Organization',
    sector: 'health-care',
  },
  ctx: tenantContext,
  requestTimeoutMs: 15000,
});

console.log(client.getResolvedAppInfo());
// {
//   appId: 'es.globaldatacare',
//   appVersion: 'v1.0',
//   appType: 'Organization',
//   sector: 'health-care'
// }
```

```ts
const tenantContext: TenantContext = {
  tenantId: 'acme-id',
  jurisdiction: 'ES',
  sector: DataspaceSectors.HealthCare,
};

const client = new NodeHttpClient({
  baseUrl: 'https://gw.example.org',
  appInfo: {
    appId: 'portal.globaldatacare.es',
    appVersion: 'v2.4.0',
    appType: 'Organization',
    sector: DataspaceSectors.HealthCare,
  },
  ctx: tenantContext,
  requestTimeoutMs: 15000,
});
```

Typical route contexts:

```ts
const tenantContext: TenantContext = {
  tenantId: 'acme-id',
  jurisdiction: 'ES',
  sector: DataspaceSectors.HealthCare,
};

const hostOperatorContext: HostRouteContext = {
  jurisdiction: 'ES',
  sector: DataspaceSectors.HealthCare,
};
```

## 6. Choose a role-oriented facade

### Organization controller

Use when the backend is acting as tenant admin or organization controller.

```ts
const orgSdk = new OrganizationControllerSdk(client);
```

Main methods:

- `createOrganizationEmployee(...)`
- `activateEmployeeDeviceWithActivationRequest(...)`
- `requestSmartToken(...)`
- `ingestCommunicationAndUpdateIndex(...)`
- `grantProfessionalAccess(...)`

### Professional

Use when you want one facade that spans organization activation, employee bootstrap, token, communication, and consent flows.

```ts
const professionalSdk = new ProfessionalSdk(client);
```

Main methods:

- `activateOrganizationInGatewayFromIcaProof(...)`
- `createOrganizationEmployee(...)`
- `activateEmployeeDeviceWithActivationRequest(...)`
- `requestSmartToken(...)`
- `ingestCommunicationAndUpdateIndex(...)`
- `grantProfessionalAccess(...)`

### Individual controller

Use when the backend is acting for the subject/individual side.

This flow is different from legal organization activation:

- `controllerEmail` maps to `org.schema.Organization.owner.email`
- `controllerTelephone` maps to `org.schema.Organization.owner.telephone`
- these owner claims are specific to individual/family subject-index bootstrap
- they do not replace the `Person/memberOf/hasOccupation` semantics used for a legal representative of an organization

```ts
const individualSdk = new IndividualControllerSdk(client);
```

Main methods:

- `startIndividualOrganization(...)`
- `confirmIndividualOrganizationOrder(...)`
- `grantProfessionalAccess(...)`
- `importIpsOrFhirAndUpdateIndex(...)`
- `ingestCommunicationAndUpdateIndex(...)`
- `generateDigitalTwinFromSubjectData(...)`
- `requestSmartToken(...)`

### Professional role and permission examples

Reusable examples for different professional roles, sections, and FHIR data expectations live in:

- [gdc-common-utils-ts/src/examples/professional.ts](https://gitlab.dev.accuro.es/idi/espacio-de-datos/global-datacare/gdc-common-utils-ts/-/blob/main/src/examples/professional.ts)

That file now includes scenarios such as:

- physician reading allergies/intolerances
- nursing professional reading medication history
- paramedic reading emergency patient summary
- physician reading results plus problem list

Each scenario pins:

- actor role
- actor target type such as direct email, organization, or jurisdiction
- consent purpose
- consent actions by section
- SMART scopes requested
- expected FHIR resource types after access

The consent matrix now also includes scenarios such as:

- physician targeted directly by email and role for continuous care
- physician targeted directly by email and role for emergencies
- physician targeted by organization plus role for continuous care
- physician targeted by jurisdiction plus role for emergency care
- nursing professional and paramedic variants
- denied cases when the active consent does not cover the requested section or has been deactivated

### Individual member / caregiver

Use when the actor is not an employee of an organization and not the primary
individual controller, but a related person such as a grandparent, guardian,
or caregiver.

```ts
const memberSdk = new IndividualMemberSdk(client);
```

Main methods:

- `upsertRelatedPersonAndPoll(...)`
- `requestSmartToken(...)`

## 7. Organization/professional flow step by step

### 7.1 Activate organization from ICA proof

```ts
const professionalSdk = new ProfessionalSdk(client);
const hostOperatorContext = cloneExample(EXAMPLE_HOST_ROUTE_CONTEXT);
const vpToken = EXAMPLE_ACTIVATE_ORGANIZATION_FROM_ICA_PROOF_INPUT.vpToken;
const orgControllerDid = EXAMPLE_CONTROLLER_DID;
const controllerSameAs = EXAMPLE_CONTROLLER_SAME_AS;
const emailControllerOrg = EXAMPLE_CONTROLLER_SAME_AS.replace(/^mailto:/, '');
const publicSignKey = EXAMPLE_CONTROLLER_SIGN_KEY;
const publicKeys = EXAMPLE_CONTROLLER_PUBLIC_KEYS;

const controllerBinding = buildControllerBindingInput({
  did: orgControllerDid,
  sameAs: controllerSameAs,
  publicSignKey,
  publicKeys,
});

const activation = await professionalSdk.activateOrganizationInGatewayFromIcaProof(
  hostOperatorContext,
  {
    vpToken,
    controller: controllerBinding,
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
      [ClaimsServiceSchemaorg.url]: 'https://operator.example.net/acme/cds-es/v1/health-care',
    },
  },
);
```

Do not teach this flow from the raw GW request body.

Teach it from variables the integrator already knows how to obtain:

- `vpToken`
  comes from the ICA proof / trust bootstrap step
- `orgControllerDid`
  is the public DID for the human controller
- `controllerSameAs`
  is the public alias, commonly a `mailto:`
- `publicSignKey`
  is the controller public signing key
- `publicKeys`
  is the auxiliary public key set, commonly DidComm encryption keys
- `controllerBinding`
  is built by the helper so the caller does not manually shape
  `controller.publicKeyJwk` and `controller.jwks`
- `additionalClaims`
  should use shared `Claims*` constants instead of hardcoded string keys

Practical rule:

- `controller.*` is the person/controller identity to publish or bind.
- DCR `jwks` is the technical client/device/app identity.
- The organization/provider DID document is a separate output from the controller DID document.

Current status:

- The canonical activation payload priority is already formalized in shared helpers.
- The node runtime still needs a first-class exported discovery/bootstrap facade that wraps those shared contracts directly.

Source payload reference:

- [gdc-common-utils-ts/src/examples/organization-controller.ts](https://gitlab.dev.accuro.es/idi/espacio-de-datos/global-datacare/gdc-common-utils-ts/-/blob/main/src/examples/organization-controller.ts)
  - `EXAMPLE_ACTIVATE_ORGANIZATION_FROM_ICA_PROOF_INPUT`
  - `EXAMPLE_GW_ORGANIZATION_ACTIVATE_PAYLOAD`
- [gdc-common-utils-ts/src/examples/shared.ts](https://gitlab.dev.accuro.es/idi/espacio-de-datos/global-datacare/gdc-common-utils-ts/-/blob/main/src/examples/shared.ts)
  - `EXAMPLE_CONTROLLER_DID`
  - `EXAMPLE_CONTROLLER_SAME_AS`
  - `EXAMPLE_CONTROLLER_SIGN_KEY`
  - `EXAMPLE_CONTROLLER_PUBLIC_KEYS`

### 7.2 Create a professional/employee under the organization

```ts
const organizationDid = buildOrganizationDidWeb({
  hostDidWeb: 'did:web:api.example.org',
  tenantId: 'acme-id',
  jurisdiction: 'ES',
  sector: DataspaceSectors.HealthCare,
});

const professionalDid = buildProfessionalDidWeb({
  organizationDidWeb: organizationDid,
  email: 'doctor@example.org',
  role: HealthcareActorRoles.Physician,
});

const subjectDid = buildIndividualDidWeb({
  organizationDidWeb: organizationDid,
  subjectId: 'subject-001',
});

const employee = await professionalSdk.createOrganizationEmployee(tenantContext, {
  employeeClaims: {
    '@context': 'org.schema',
    [ClaimsPersonSchemaorg.identifier]: professionalDid,
    [ClaimsPersonSchemaorg.email]: 'doctor@example.org',
    [ClaimsPersonSchemaorg.hasOccupationalRoleValue]: HealthcareActorRoles.Physician,
    [ClaimsPersonSchemaorg.memberOfOrgTaxId]: tenantContext.tenantId,
  },
});
```

This matches the current CORE GW expectation better than invented `Employee.*` claims.
If you need to explain where these fields come from, use the ICA / CORE GW VC examples
linked above, where `credentialSubject` is the source shape and SDK/GW claims are the
flattened `org.schema.*` view.

### 7.3 Request SMART token

```ts
const deviceDid = 'did:web:portal.example.org:acme';

const token = await professionalSdk.requestSmartToken({
  actorDid: professionalDid,
  clientId: deviceDid,
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

In this example the SDK does not repeat `tenantId`, `jurisdiction`, or
`sector` because the `NodeHttpClient` was already initialized with
`ctx: tenantContext`.

Why that route context still matters:

- the current CORE GW token endpoint is tenant-scoped in the URL itself
- for example: `/{tenantId}/cds-{jurisdiction}/v1/{sector}/identity/openid/smart/token`
- that route chooses which tenant vault, consent rules, and issuer keys the GW will use
- `actorDid` is the identity of the requester inside the token request body
- in individual flows, that route tenant is the provider-hosting tenant in the GW, not the professional organization of the actor

So:

- `actorDid` = who is asking
- `tenantContext` = which GW tenant/operator route is issuing the token
- `subjectDid` = which individual's data is being requested, and it already carries the provider lineage in its DID structure

Minimal teaching rule:

- start with the composition read scope only
- add `SmartGatewayScopesFhirR4.ConsentCruds` only if the backend also needs
  consent CRUD/search operations

`SmartGatewayScopesFhirR4.ConsentCruds` currently resolves to:

```ts
'organization/Consent.cruds'
```

Source payload reference:

- [gdc-common-utils-ts/src/examples/professional.ts](https://gitlab.dev.accuro.es/idi/espacio-de-datos/global-datacare/gdc-common-utils-ts/-/blob/main/src/examples/professional.ts)
  - `EXAMPLE_TOKEN_EXCHANGE_SMART_INPUT`
  - `EXAMPLE_OPENID_SMART_TOKEN_INPUT`
  - `EXAMPLE_SMART_PRESENTATION_SUBMISSION`

## 8. Individual flow step by step

### 8.1 Start individual organization/index bootstrap

Important:

- this is not the same flow as legal organization activation
- today it uses a subject/family registration message submitted through tenant
  `_batch` plus async poll
- it is not an `individual _activate` flow
- the second step is order confirmation with the returned `offerId`

```ts
const individualSdk = new IndividualControllerSdk(client);
const tenantCtx = cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT);
const startInput = cloneExample(EXAMPLE_INDIVIDUAL_ORGANIZATION_START_INPUT);

const start = await individualSdk.startIndividualOrganization({
  ...tenantCtx,
  ...startInput,
});
```

Use variables, not an inline JSON blob:

- `tenantCtx`
  is your selected GW tenant route context
- `startInput.alternateName`
  comes from the individual/family onboarding form
- `startInput.controllerEmail`
  comes from the human controller contact
- `startInput.controllerTelephone`
  is only for compatibility/extension flows, not the CORE default

See the exact payload builder exercised in:

- [tests/individual-start.test.mjs](./tests/individual-start.test.mjs)
- [src/individual-start.ts](./src/individual-start.ts)

For the individual indexing journey, this identifies the selected provider at
business level. It is not a professional organization tax ID.

Important:

- the selected provider DID and the GW route tenant are not the same concept
- once an individual already exists, the provider can usually be inferred from the individual's `did:web`
- the current node runtime still routes calls using `tenantContext`
- so do not treat `serviceProviderDid` as a synonym of `tenantId`

### 8.2 Confirm returned order

```ts
const orderInput = cloneExample(EXAMPLE_INDIVIDUAL_ORGANIZATION_ORDER_INPUT);

const confirmation = await individualSdk.confirmIndividualOrganizationOrder({
  ...tenantCtx,
  ...orderInput,
  offerId: start.offerId,
});
```

Use this mental model:

1. start individual registration in the hosted tenant via `_batch`
2. receive `offerId`
3. confirm the returned order in the same tenant route context

The SDK hides the raw DidComm payload shape, but the current runtime contract
is still a tenant-scoped async batch flow, not a legal-organization
`_activate`.

### 8.3 Grant professional access with consent

```ts
const professionalDid = buildProfessionalDidWeb({
  organizationDidWeb: organizationDid,
  email: 'doctor@example.org',
  role: HealthcareActorRoles.Physician,
});
const professionalEmail = 'doctor@example.org';

const grant = await individualSdk.grantProfessionalAccess(tenantContext, {
  subjectDid,
  actorId: professionalEmail,
  actorRole: HealthcareActorRoles.Physician,
  purpose: HealthcareConsentPurposes.Treatment,
  actions: [HealthcareConsentActions.PatientSummaryDocument],
});
```

In a real integration, the controller will often know the professional email
or, in veterinary scenarios, a `tel:+...` identifier before knowing a full
professional `did:web`. All of these map to the flat `Consent.actor-identifier`
claim.

## 9. Build a communication draft in memory

This is the recommended way to compose a message before sending it.

```ts
let draft = createCommunicationDraft({
  subject: subjectDid,
  sender: professionalDid,
  recipient: serviceProviderDid,
  noteText: 'IPS update with vital signs',
});
```

## 8.4 Create or update a RelatedPerson

Use this for cases such as a grandfather of a child, a legal guardian, or a
caregiver who is neither an employee nor the primary individual controller.

```ts
const memberSdk = new IndividualMemberSdk(client);

const relatedPerson = await memberSdk.upsertRelatedPersonAndPoll(tenantContext, {
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

## 10. Add concrete FHIR resources

### 10.1 Add vital signs

```ts
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
```

### 10.2 Add an IPS bundle or document

If you already have a FHIR `Bundle document`, attach it as a payload:

```ts
draft = addFhirResourceToDraft(draft, ipsBundle, {
  asDocumentReference: true,
  attachmentTitle: 'ips-light.json',
  documentDescription: 'IPS light document',
});
```

This supports the current pattern where:

- `Communication` carries the shared document
- the document can travel directly
- or it can travel wrapped as `DocumentReference`

## 11. Freeze the draft into an outbox job

```ts
const job = createOutboxJobFromDraft(draft, {
  batchOptions: {
    requestUrl: 'individual/org.hl7.fhir.r4/Communication',
  },
});
```

At this point you have:

- `job.payload`
  - the FHIR `Communication`
- `job.envelope`
  - the GW-ready batch message

And also:

- no network call has happened yet
- `createOutboxJobFromDraft(...)` only materializes the local outbox object
- runtime submission starts in the next step

## 12. Send the communication and poll

```ts
const result = await client.ingestCommunicationAndUpdateIndex(tenantContext, {
  communicationPayload: job.payload,
});
```

Use this when you want the GW to:

- persist the auditable communication
- project `DocumentReference`
- project `Composition`
- project IPS resources such as `MedicationStatement`, `Observation`, `Consent`

## 13. Search IPS / latest document

### Latest IPS

```ts
const latestIps = await client.searchLatestIps(tenantContext, {
  subject: subjectDid,
});
```

### Generic clinical bundle search

```ts
const search = await client.searchClinicalBundle(tenantContext, {
  subject: subjectDid,
  section: HealthcareBasicSections.PatientSummaryDocument.claim,
  includedTypes: [
    ResourceTypesFhirR4.Composition,
    ResourceTypesFhirR4.DocumentReference,
    ResourceTypesFhirR4.Observation,
  ],
});
```

## 14. Read a document back from Communication

Use the shared communication/document facade.

```ts
const communicationFacade = createCommunicationFacade();
const resolved = communicationFacade.getDocument(job.payload);

if (resolved?.kind === 'fhir') {
  const fhirDoc = communicationFacade.getFhirDocument(job.payload);
  const sections = fhirDoc?.getSections() || [];
  const observations = fhirDoc?.getResources(ResourceTypesFhirR4.Observation) || [];
}
```

This hides:

- direct attachment vs `DocumentReference`
- attachment metadata lookup
- first FHIR `Bundle document` resolution

## 15. Recommended minimal evaluation setup

For evaluators or demo users, keep it simple:

1. one gateway base URL
2. one route context
3. one provider/operator DID or URL
4. one seeded technical portal identity
5. one organization flow
6. one individual flow
7. one communication carrying an IPS or a small FHIR payload

## 16. Current limitations to be aware of

- ICA/node operator/DCAT3 discovery is not yet a dedicated typed SDK API
- full signed/encrypted DIDComm flow is not the default demo path yet
- controller signature identity is not yet modeled separately from technical communication identity in the high-level SDK API
- some role-specific facades are more complete on node than on front today

## 17. Where to look next

- [README.md](README.md)
- [gdc-sdk-core-ts/README.md](https://github.com/Global-DataCare/gdc-sdk-core-ts/blob/main/README.md)
- [gdc-common-utils-ts/README.md](https://gitlab.dev.accuro.es/idi/espacio-de-datos/global-datacare/gdc-common-utils-ts/-/blob/main/README.md)

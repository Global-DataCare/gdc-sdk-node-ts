# Node SDK End-to-End 101

This is the main onboarding guide for backend developers integrating
`gdc-sdk-node-ts`.

Teaching rule for this `101`:

- start from end-to-end journeys before low-level runtime details
- keep organization and individual journeys separate
- keep employee create, employee search, and employee lifecycle as separate
  ideas when they appear

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

- [101-SDK_INTEGRATION.md](./101-SDK_INTEGRATION.md)
- [gdc-sdk-core-ts/docs/101-SDK_FLOWS.md](https://github.com/Global-DataCare/gdc-sdk-core-ts/blob/main/docs/101-SDK_FLOWS.md)
- [gdc-common-utils-ts/docs/101-CONSENT_ACCESS.md](https://github.com/Global-DataCare/gdc-common-utils-ts/blob/main/docs/101-CONSENT_ACCESS.md)
- [gdc-common-utils-ts/docs/101-VP_TOKEN.md](https://github.com/Global-DataCare/gdc-common-utils-ts/blob/main/docs/101-VP_TOKEN.md)

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
- consent-related index-data submission
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
import { HostNetworkTypes } from 'gdc-common-utils-ts/constants/network';
import {
  ClaimsOrganizationSchemaorg,
  ClaimsPersonSchemaorg,
  ClaimsServiceSchemaorg,
  DataspaceSectors,
  HealthcareActorRoles,
  HealthcareConsentPurposes,
  HealthcareConsentActions,
  HealthcareBasicSections,
  ServiceCapability,
  ResourceTypesFhirR4,
  SmartGatewayScopesFhirR4,
  buildControllerBindingInput,
  buildOrganizationDidWeb,
  buildProfessionalDidWeb,
  buildIndividualDidWeb,
  buildSmartCompositionReadScope,
} from 'gdc-common-utils-ts';
```

## 5. Backend communication bootstrap

This is the minimum runtime setup most backends need before calling any flow.

If your integration only needs legal-organization onboarding and does not need
to model the portal/backend software as a separately authorized application,
read this section quickly and skip the software-credential details for now.

What this bootstrap does today:

- initializes the Node runtime client with route context and app identity
- initializes the technical communication identity used by the runtime when it
  needs signing/encryption keys for transport profiles
- can optionally reuse an ICA-issued app-service `vp_token` as the default
  HTTP Bearer credential when the integration runs in demo/compat mode
- current `gwtemplate-node-ts` demo/bootstrap deployments do not yet enforce
  software/application registration, so the proof token may still be omitted or
  left empty there

What this bootstrap does not do today:

- it does not define `bearerToken` as the canonical proof that the
  portal/backend software is an ICA-authorized runtime across node operators
- it does not yet implement a first-class ICA app-service-proof exchange/refresh
  lifecycle inside `gdc-sdk-node-ts`

There are two different initializations here:

1. portal/backend application identity for GW headers and policy
2. technical communication identity for transport keys

They are not the same thing.

- `appId`
  identifies the portal/backend application towards GW CORE
- `entityId` in `initializeCommunicationIdentity(...)`
  identifies the local technical communication profile of the backend/app
  process that owns the transport keys
- controller/professional/subject DIDs
  identify human/domain actors

Use-case split:

- legal organization onboarding:
  you mainly care about the controller/legal-representative proof
- software application trust:
  you additionally care about the technical identity of the portal/backend
  software and its communication key binding

If that second use case is not yours, you can ignore `vcSoftwareRegisteredByICA`
  and `appServiceVpToken` for now.

Do not teach `entityId` as if it were the organization id.

```ts
const cryptography = new CryptographyService(cryptoHelper);

const deviceIdentity = await initializeCommunicationIdentity({
  entityId: 'portal.example.org:acme-id:backend-runtime',
  cryptography,
  includeVcSigningKey: true,
  seedMaterial: crypto.randomBytes(32),
});

const appServiceDid = process.env.APP_SERVICE_DID || '';
const appServiceName = process.env.APP_SERVICE_NAME || '';
const appServiceUrl = process.env.APP_SERVICE_URL || '';
const participantDid = process.env.PARTICIPANT_DID || '';
const icaDid = process.env.ICA_DID || '';
const didWebPortalCommunicationSigningKeyId =
  deviceIdentity.commSigningKeyPair.publicJWKey.kid || '';

// Canonical ICA-side input artifact for an app-service trust flow:
// an already-issued SoftwareApplication VC (JWT or JSON), not a locally
// fabricated credential.
//
// The controller-side signature belongs to the earlier ICA registration step
// that bound the app-service communication key into that VC. Later operational
// app-service proofs should be signed by the app-service key itself, not by
// reusing the human controller as the runtime signer.
//
// Current gwtemplate demo/bootstrap deployments do not enforce
// software/application registration yet, so demo integrations may leave this empty.
const vcSoftwareRegisteredByICA = process.env.VC_SOFTWARE_REGISTERED || '';

// If you need to mock the VC shape while ICA software registration is still
// pending, keep it as an environment-driven JSON object like this.
const softwareApplicationCredentialMock = vcSoftwareRegisteredByICA
  ? JSON.parse(vcSoftwareRegisteredByICA)
  : {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://schema.org',
      ],
      type: ['VerifiableCredential', 'SoftwareApplicationCredential'],
      issuer: icaDid,
      credentialSubject: {
        '@type': 'SoftwareApplication',
        id: appServiceDid,
        name: appServiceName,
        url: appServiceUrl,
        sameAs: participantDid,
        material: didWebPortalCommunicationSigningKeyId,
      },
    };

// In this mock shape, `SoftwareApplication.material` is the public
// cryptographic material of the software application in this profile,
// typically the communication signing key id bound by ICA.

// If your integration already has a compact app-service VP/JWS proof built from
// that ICA-issued VC, the Node client can reuse it in demo/compat mode.
//
// If gwtemplate does not enforce software/application registration yet, leaving
// this empty is still valid for the current demo/bootstrap path.
const appServiceVpToken = process.env.GW_APP_SERVICE_VP_TOKEN || '';

const tenantContext: TenantContext = {
  tenantId: 'acme-id',
  jurisdiction: 'ES',
  sector: DataspaceSectors.HealthCare,
};

const hostOnboardingRoute: HostRouteContext = {
  jurisdiction: 'ES',
  hostNetwork: HostNetworkTypes.Test,
};

const client = new NodeHttpClient({
  baseUrl: 'https://gw.example.org',
  ctx: tenantContext,
  runtimeVpToken: appServiceVpToken,
  appInfo: {
    appId: 'https://portal.example.org',
  },
});
```

What each value means:

- `deviceIdentity`
  technical communication identity for the backend/app profile
- `vcSoftwareRegisteredByICA`
  ICA-issued software/application VC kept by the integrator as the canonical
  input artifact for future proof construction
- `Organization.hasCredential.material`
  public cryptographic material of the organization when that binding is
  carried in an ICA-issued organization credential
- `Person.hasCredential.material`
  public cryptographic material of the controller/person when that binding is
  carried in an ICA-issued representative credential
- `softwareApplicationCredentialMock`
  environment-driven mock shape for the same VC when ICA software registration
  is not implemented yet; it keeps the intended fields visible without
  hardcoding deployment values
- `SoftwareApplication.material`
  public cryptographic material of the software application, typically the
  communication signing key id bound by ICA during the prior registration step
  and commonly represented as the RFC 9278 URN form of an RFC 7638 JWK
  thumbprint for the public signing / verification key
- `appServiceVpToken`
  compact VP/JWS proof derived from the ICA-issued software/application VC when that
  proof has already been assembled; in current demo/compat wiring the Node
  client can reuse it as the default HTTP Bearer credential; in current
  `gwtemplate-node-ts` demo flows it may still be empty or omitted
- `tenantContext`
  tenant-scoped route context used by subject and organization runtime calls
- `hostOnboardingRoute`
  host-registry routing context for legal organization activation flows
- `client`
  runtime executor used by the role-oriented facades

Important:

- `tenantContext.sector` is the business sector path for tenant routes such as
  `health-care`
- `HostRouteContext.hostNetwork` is the preferred host routing field
- legacy `HostRouteContext.sector` remains as a compatibility alias
- current GW/gwtemplate deployments use the canonical
  `HostNetworkTypes` values such as `Test`, `TestNetwork`, or
  `Network`
- `controllerDid` and `hostDid` exist as optional route fields for some payloads,
  but they should not be introduced in the first example unless the flow really
  needs them
- this guide intentionally does not prescribe `bearerToken` in the bootstrap
  snippet because transport auth depends on operator policy and deployment
- `appServiceVpToken` is the preferred semantic name in this guide when the
  integration wants to pass an ICA-issued software/application proof token
- the current `NodeHttpClient(...)` option is still named `runtimeVpToken`, so
  the example maps `appServiceVpToken` into that field explicitly
- in current `gwtemplate-node-ts`, `vp_token` is the canonical activation proof,
  while HTTP `Authorization: Bearer ...` is a separate transport/auth concern
- for `identity/auth/_exchange`, current `gwtemplate-node-ts` documents the
  Bearer token specifically as a Firebase/OIDC `id_token`
- in the current `gdc-sdk-node-ts` demo/compat wiring, `runtimeVpToken` is
  reused as `Authorization: Bearer <appServiceVpToken>` when no explicit
  `bearerToken` is configured
- if `appServiceVpToken` is omitted or is an empty string, the Node client skips
  that fallback and does not inject an Authorization header from it
- explicit `bearerToken` still wins if both values are provided
- other deployments may front GW with API key, proxy auth, or another trusted
  backend token, so if you need custom auth headers use `defaultHeaders`

Planned alignment note:

- the repos do not yet expose one finalized cross-operator contract for
  ICA-authorized software/application identity at SDK initialization time
- the intended direction is to keep these three identities separate:
  - ICA activation proof for organization/controller onboarding
  - technical communication identity from `initializeCommunicationIdentity(...)`
  - transport/session auth header such as HTTP Bearer or API key
- if you need one sentence for the current `101`:
  - today the SDK initializes with `appInfo`, route context, technical
    communication keys, and optionally an `appServiceVpToken`; the full ICA
    software/application trust lifecycle is still pending and must not be collapsed
    into the generic name `bearerToken`
- if ICA later finalizes a runtime/software VC profile, the SDK docs should
  treat that proof as a fresh ICA-backed `vp_token` or equivalent signed proof
  for the service/device runtime, with explicit renewal when the VP or VC
  expires
- that future proof should be renewed/refreshed when the VP expires or when the
  underlying ICA VC is no longer valid, instead of being treated as a permanent
  static API key
- until that contract is finalized, do not document `bearerToken` as if it were
  already the ICA proof for the portal/backend software itself

### 5.0.1 Three separate trust layers

When documenting backend bootstrap, keep these layers separate:

- ICA onboarding proof
  the `vp_token` used in legal organization activation and other ICA-governed
  trust/bootstrap flows
- technical communication identity
  the local signing/encryption keys created by
  `initializeCommunicationIdentity(...)` for the runtime channel
- transport/session authentication
  HTTP `Authorization`, API key, proxy token, or another deployment-specific
  access mechanism

Current contract summary:

- `NodeHttpClient(...)` needs route context, base URL, and optional transport
  auth configuration
- `NodeHttpClient({ runtimeVpToken: appServiceVpToken })` can already reuse that proof as the
  default HTTP Bearer credential in demo/compat integrations
- `NodeHttpClient({ runtimeVpToken: '' })` is also valid for current
  `gwtemplate-node-ts` demo/bootstrap integrations where software/application
  registration is not enforced yet
- `initializeCommunicationIdentity(...)` prepares the runtime communication keys
- a future ICA-authorized software/application proof may be required in addition,
  with a finalized exchange/refresh contract that is not yet fully closed in
  ICA

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
- presenter signing key id used to sign the VP
- controller alias such as `mailto:`
- controller DID if the request must carry explicit controller bootstrap material
- public signing key
- public auxiliary keys
- business registration claims

If your team needs the exact VP construction steps before this call, open
`gdc-common-utils-ts/docs/101-VP_TOKEN.md`. That file explains how to:

- assemble the VP payload
- append the organization and representative VCs
- prepare the `header.payload` signing input
- build the final compact `vp_token` string

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
  hostOnboardingRoute,
  {
    vpToken: '<ica-proof-token>',
    controller: controllerBinding,
    service: {
      // Hosting URL selected by the controller during onboarding. This points
      // to the hosting operator/base connector location, not to the
      // portal/backend URL and not to the tenant public did:web identity.
      url: 'https://operator.example.net/acme-id/cds-es/v1/health-care',
      capabilities: [
        ServiceCapability.IndexProvider,
        ServiceCapability.IndexReader,
      ],
    },
    additionalClaims: {
      [ClaimsOrganizationSchemaorg.alternateName]: 'acme-health',
      [ClaimsOrganizationSchemaorg.legalName]: 'ACME HEALTH SL',
      [ClaimsOrganizationSchemaorg.identifierType]: 'taxID',
      [ClaimsOrganizationSchemaorg.identifierValue]: 'VATES-B00112233',
      [ClaimsOrganizationSchemaorg.numberOfEmployees]: 25,
      [ClaimsOrganizationSchemaorg.addressCountry]: hostOnboardingRoute.jurisdiction,
      [ClaimsOrganizationSchemaorg.taxId]: 'VATES-B00112233',
      [ClaimsPersonSchemaorg.email]: emailControllerOrg,
      [ClaimsPersonSchemaorg.hasOccupationalRoleValue]: 'RESPRSN',
      [ClaimsServiceSchemaorg.category]: tenantContext.sector,
      [ClaimsServiceSchemaorg.identifier]: 'did:web:public.acme.org',
    },
  },
);
```

Mandatory rule for this onboarding step:

- legal-organization activation always declares `service.url`
- legal-organization activation always declares `service.capabilities`
- `service.url` is the hosting URL selected by the controller during onboarding
- it identifies the hosting operator / connector location, not the portal URL
  and not the tenant public `did:web`
- the tenant public service identity is declared separately, for example in
  `ClaimsServiceSchemaorg.identifier`
- in the current activation examples, both are typically present:
  `service.url` for the selected hosting location and
  `ClaimsServiceSchemaorg.identifier` for the public tenant/service `did:web`
- import `service.capabilities` from `gdc-common-utils-ts` and let GW persist
  them as `org.schema.Service.serviceType`
- GW persists them in `org.schema.Service.serviceType` and uses them for DID
  discovery and DSP service-offering publication

What comes back:

- async submit result
- async poll result
- the organization activation outcome used by the next step

### 6.3 Confirm the organization order or offer

In the legal organization journey, order confirmation is a separate step.

Use the `offerId` returned by the accepted activation result. The current SDK
does not expose a dedicated legal-organization helper equivalent to
`startIndividualOrganization(...).offerId`, so this guide should treat that
value as part of the activation response contract rather than invent a wrapper.

Once you have that `offerId`, confirm the returned offer:

```ts
await client.confirmLegalOrganizationOrder(hostOnboardingRoute, {
  offerId: '<offer-id-from-organizationActivation>',
  jurisdiction: hostOnboardingRoute.jurisdiction,
  sector: hostOnboardingRoute.sector,
  timeoutSeconds: 12,
  intervalSeconds: 3,
});
```

Notes:

- the routing object is `hostOnboardingRoute`, not an organization-controller identity
- for the basic example there is no reason to inject controller identity into
  this route object
- before creating employees/professionals, declare the intended seat count in
  activation claims with `ClaimsOrganizationSchemaorg.numberOfEmployees`
  when your onboarding flow purchases or reserves licenses

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

- [gdc-sdk-core-ts/docs/101-SDK_FLOWS.md](https://github.com/Global-DataCare/gdc-sdk-core-ts/blob/main/docs/101-SDK_FLOWS.md)
- [gdc-common-utils-ts/docs/101-CONSENT_ACCESS.md](https://github.com/Global-DataCare/gdc-common-utils-ts/blob/main/docs/101-CONSENT_ACCESS.md)

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
  is the canonical auditable exchange envelope for individual index data,
  including consent-related data
- attached `Bundle`
  carries the real resources such as `Consent`, `Composition`, or `DocumentReference`
- standalone employee or host/onboarding lifecycle should still not be taught as if it were a `Communication` flow

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
- [101-SDK_INTEGRATION.md](./101-SDK_INTEGRATION.md)
- [tests/host-onboarding.test.mjs](./tests/host-onboarding.test.mjs)
- [tests/individual-start.test.mjs](./tests/individual-start.test.mjs)
- [tests/individual-onboarding.test.mjs](./tests/individual-onboarding.test.mjs)
- [tests/device-activation.test.mjs](./tests/device-activation.test.mjs)
- [tests/resource-operations.test.mjs](./tests/resource-operations.test.mjs)
- [tests/smart-token.test.mjs](./tests/smart-token.test.mjs)
- [gdc-common-utils-ts/src/examples/organization-controller.ts](https://github.com/Global-DataCare/gdc-common-utils-ts/blob/main/src/examples/organization-controller.ts)
- [gdc-common-utils-ts/src/examples/individual-controller.ts](https://github.com/Global-DataCare/gdc-common-utils-ts/blob/main/src/examples/individual-controller.ts)
- [gdc-common-utils-ts/src/examples/professional.ts](https://github.com/Global-DataCare/gdc-common-utils-ts/blob/main/src/examples/professional.ts)
- [gdc-common-utils-ts/src/examples/relationship-access.ts](https://github.com/Global-DataCare/gdc-common-utils-ts/blob/main/src/examples/relationship-access.ts)

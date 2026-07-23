# Node SDK End-to-End 101

> 101 note
> - Teach here: the highest-level `sdk-node` actor/profile/runtime surface after shared authoring in `gdc-common-utils-ts`.
> - Reuse lower-layer contracts from `sdk-core` and `common-utils` instead of re-teaching raw claims or low-level editors.
> - When payload authoring appears, teach document `Bundle` with `Composition` first -> `Communication` -> DIDComm/plain; search stays separate through FHIR params such as `Composition.section`.
> - Read [101-README.md](./101-README.md) for the ordered path and keep actor role plus submit/poll explicit.


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

Live-test boundary:

- this SDK guide is about runtime execution and high-level facade calls
- the live E2E suite simulates a controlled `virtual API` so GW CORE can be
  tested in a realistic but deterministic environment
- that `virtual API` is only a harness for tests
- the current harness assumes the future `user job manager` local queue is
  disabled, so each high-level call is executed directly
- it should not be confused with the final product BFF or with the future
  app-side user job manager

Live execution rule:

- the authoritative live E2E run is the one executed from the user's real
  terminal/TTY
- AI agent sandboxes may fail for reasons unrelated to GW CORE behavior:
  localhost restrictions, Docker isolation, DNS resolution, Firestore/GCS
  egress, or other sandbox networking limits
- when that happens, the user-terminal run is the result that matters for
  release validation

Current execution-mode rule:

- `LIVE_GW_E2E_EXECUTION_MODE=direct` is the supported live-test mode today
- future queued execution belongs to the later app-side `user job manager`
  phase and is intentionally outside this guide

If you need lower-level runtime details after this guide, open:

- [101-ORGANIZATION_CONTROLLER_LIFECYCLE.md](./101-ORGANIZATION_CONTROLLER_LIFECYCLE.md)
  Narrow, reproducible controller-only lifecycle:
  onboarding, `_issue`, `_exchange`, `_dcr`, disable, purge, and seat
  preservation across recovery.
- [../tests/101-live-full-cycle-bff-runtime.e2e.test.mjs](../tests/101-live-full-cycle-bff-runtime.e2e.test.mjs)
  Executable live tutorial for the full backend/BFF dependency chain:
  host/tenant, professional employee, individual, consent, SMART, read,
  cleanup.
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
- compatibility execution for the legacy direct `RelatedPerson` route
- `Communication` ingestion
- SMART token requests
- subject document search via FHIR params such as `Composition.section`

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

Open `gdc-common-utils-ts` when your question is:

- how do I author the canonical step-by-step payloads
- what editor/reader already expresses this shape
- what shared example already exists for this flow

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
5. search latest IPS or a clinical bundle with FHIR params such as `Composition.section`

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
  createCommMsgExtendedDraft,
  attachBundleToCommMsgExtendedDraft,
  createCommunicationOutboxJobFromCommMsgExtendedDraft,
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

Research-access naming note:

- in high-level developer documentation, call the twin-search consumer surface
  `DigitalTwinSdk`
- current executable node façade is still `ProfessionalSdk`
- keep that distinction explicit so the 101 stays intuitive without claiming a
  class name that is not yet published

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
- in the stricter GW FAPI profile, the authorization request/response layer
  can carry encrypted JWE material in the `request` / `response` parameters
  around the portal or browser flow
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
- controller alias only when the caller must still pass explicit demo bootstrap
  material
- controller DID if the request must carry explicit controller bootstrap material
- public signing key
- public auxiliary keys
- business registration claims

Normal production expectation:

- the ICA-issued representative VC should already carry:
  - `credentialSubject.sameAs`
  - `credentialSubject.hasCredential.material`
- in that case, the client should treat `controller.sameAs` as optional and
  only send the normal activation input plus business claims

Demo/local fallback only:

- if the ICA VC still does not carry the representative contact/binding data,
  the caller may pass:
  - `additionalClaims[ClaimsPersonSchemaorg.email]` for GW admin bootstrap
  - `controller.sameAs` only as an explicit temporary bootstrap alias
- for email-based identity, canonical `sameAs` is `urn:multibase:z...`, not
  `mailto:...`

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
const controllerSameAs = normalizeSameAsHash(emailControllerOrg);

const controllerBinding = buildControllerBindingInput({
  did: orgControllerDid,
  sameAs: controllerSameAs,
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
      // Demo/local fallback only. In production the ICA VC should already
      // carry representative sameAs / hasCredential.material from signed input.
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

For the verification credentials returned by `_transaction`, do not copy local
reader functions from tests anymore. Use the shared helpers from
`gdc-common-utils-ts`:

- `readLegalOrganizationVerificationCredentialPairFromResponseBody(...)`
- `readLegalOrganizationVerificationTaxIdFromResponseBody(...)`
- `readLegalRepresentativeSameAsFromResponseBody(...)`
- `readLegalRepresentativeBindingFromResponseBody(...)`

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
const authorityResolver = new StaticAuthorityResolver();

const authority = await authorityResolver.resolveAuthority({
  authorityBaseUrl: 'https://api.example.org',
  tenantId: tenantContext.tenantId,
  jurisdiction: tenantContext.jurisdiction,
  sector: tenantContext.sector,
});

const organizationDid = authority.tenantDidWeb!;

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
    application_type: 'native',
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

This journey starts after shared authoring in `gdc-common-utils-ts`.
In a real backend, the Node runtime first loads one protected profile and then
opens the actor facade from that loaded workspace.

### 7.1 Load the profile and open the individual facade

```ts
const workspace = await new ProfileRuntime(runtimeClient).loadProfile(loadRequest);
const individualSdk = workspace.asIndividualController();
```

This is the same `loadProfile(...) -> workspace/session -> actor facade` handoff
used in:

- [tests/101-backend-profile-runtime.test.mjs](../tests/101-backend-profile-runtime.test.mjs)
- [tests/live-profile-runtime-individual.e2e.test.mjs](../tests/live-profile-runtime-individual.e2e.test.mjs)

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
- `registrationStatus` and `orderConfirmationRequired`
- `identity`, projected from the GW receipt when available:
  - `resourceId`: technical UUID returned by GW
  - `individualId`: that UUID encoded from its 16 bytes as multibase base58btc
  - `providerDidWeb`: exact `Offer.offeredBy` returned by GW
  - `subjectDid`: canonical individual DID beneath that exact provider DID

### 7.3 Confirm the returned order or offer

```ts
if (individualStart.orderConfirmationRequired) {
  await individualSdk.confirmIndividualOrganizationOrder({
    tenantId: tenantContext.tenantId,
    jurisdiction: tenantContext.jurisdiction,
    sector: tenantContext.sector,
    offerId: individualStart.offerId,
    timeoutSeconds: 9,
    intervalSeconds: 2,
  });
}
```

An `already_exists` receipt refers to an active registration whose original
Offer was already confirmed. Confirming that same Offer again correctly finds
a non-pending record. For create-or-resume channel flows, prefer
`ensureFamilyOrganizationRegistration(...)`, which searches before starting.

### 7.3a Identity layers after individual bootstrap

Keep these two layers separate:

- controller/person identity
  - represents the human who decides and authorizes
  - covers controller binding, VC material, actor DID, and claims such as
    `hasCredential.material`
- device/app/BFF identity
  - represents the runtime that will later talk to GW
  - covers DCR, OAuth client identity, and DIDComm/JWE/JWS transport keys

Practical rule:

- successful individual bootstrap does not mean the runtime client is already
  registered
- later `Token/_exchange` + `Device/_dcr` still belongs to the technical client
  layer
- do not reuse controller/person signing keys as if they were automatically the
  app/device/BFF transport keys

### 7.3b Build controller and subject VC material

Use the identity helpers according to which entity you need to prove:

- `individualSdk.getIdentityVC(...)`
  - use this for the actor who is acting now
  - examples: parent, guardian, spouse, caregiver, pet owner
- `individualSdk.getSubjectVC(...)`
  - use this for the represented/dependent subject
  - examples: child, animal, dependent adult
- `individualSdk.getIdentityVC(...) + individualSdk.getSubjectVC(...)`
  - use both when the eventual VP should carry both the controller proof and
    the dependent subject proof

Keep the semantics separate:

- controller VC answers who is acting and on what authority basis
- subject VC answers who the represented subject is
- both VCs may carry `evidence[]` such as DNI, family book, guardianship, or
  pet-ownership verification

```ts
const controllerVc = individualSdk.getIdentityVC({
  actorDid: controllerDid,
  subjectDid,
  relationship: 'v3-RoleCode|RESPRSN',
  authorityBasis: 'parental-authority',
  email: 'ana.parent@example.org',
  credentialMaterial: `${controllerDid}#signing-key-1`,
  evidence: [{
    type: ['DocumentVerification'],
    evidenceDocument: 'LibroDeFamilia',
    verifier: 'did:web:kyc.example.org',
  }],
});

const subjectVc = individualSdk.getSubjectVC({
  subjectDid,
  evidence: [{
    type: ['DocumentVerification'],
    evidenceDocument: 'DNI',
    verifier: 'did:web:kyc.example.org',
  }],
  additionalCredentialSubject: {
    alternateName: 'Ana',
  },
});
```

Practical rule:

- do not use `getSubjectVC(...)` as a replacement for the controller identity
- do not overload the controller VC with child/pet-only claims when a subject
  VC is the clearer model

### 7.4 Build the subject DID

Prefer the identity already projected by the high-level bootstrap call:

```ts
const subjectDid = individualStart.identity?.subjectDid;
if (!subjectDid) {
  throw new Error('GW registration receipt did not expose the subject identity.');
}
```

`Offer.offeredBy` is the authoritative provider lineage. Preserve it exactly.
The hosted provider path is colon-delimited, including
`:organization:taxid:`; a semicolon in that position was an SDK helper typo,
not an alternative DID representation.

For an older response that must be adapted manually, use the exported
`readIndividualOrganizationBootstrapIdentity(responseBody)` helper. Do not
hand-invent a `did:web` string or encode the textual UUID characters: the
helper encodes the UUID's 16 bytes.

The jurisdiction used in the individual Offer URN does not describe the
individual's country. It identifies the data-space/blockchain network selected
by `RouteContext.jurisdiction` and the `cds-<jurisdiction>` route. Consequently,
individual bootstrap does not synthesize `Organization.addressCountry`.

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

### 7.6 Disable the hosted individual

Use this when the individual/family subject should become inactive while
remaining auditable.

```ts
import { IndividualOrganizationLifecycleEditor } from 'gdc-common-utils-ts';

const individualEditor = new IndividualOrganizationLifecycleEditor()
  .setIdentifier(subjectDid)
  .setAlternateName('ana')
  .setOwnerEmail('ana.parent@example.org');

await individualSdk.disableIndividual(tenantContext, {
  individualEditor,
});
```

### 7.7 Purge the hosted individual

Use this after disable when the hosted individual/family registration should be
purged from the active set.

```ts
await individualSdk.purgeIndividual(tenantContext, {
  individualEditor,
});
```

Practical rule:

- disable first, then purge
- prefer `individualEditor`
- `organizationEditor` remains only as a legacy deprecated alias

### 7.8 Create or update a `RelatedPerson`

Use this when the actor is a caregiver, guardian, grandparent, or another
non-employee subject-side relation.

In this journey, keep using the same subject/controller facade:
`individualSdk`.

```ts
import {
  BundleEditableResourceTypes,
  BundleEditor,
  BundleOperations,
  BundleTypes,
} from 'gdc-common-utils-ts';
import {
  attachBundleToCommMsgExtendedDraft,
  createCommMsgExtendedDraft,
  createCommunicationOutboxJobFromCommMsgExtendedDraft,
} from 'gdc-sdk-node-ts';

const contacts = new BundleEditor()
  .setBundleOperation(BundleOperations.create)
  .setBundleType(BundleTypes.batch)
  .setAllowedResourceType(BundleEditableResourceTypes.relatedPerson);

contacts
  .newEntryAs(BundleEditableResourceTypes.relatedPerson)
  .setIdentifier(existingRelationship.identifier)
  .setActive(true)
  .setSubject(subjectDid)
  .setRelationship(existingRelationship.relationship)
  .setName(existingRelationship.name)
  .setTelecom(`mailto:${existingRelationship.email}`)
  .doneEntry();

// The front may send after this one edit, or add more contacts first.
const contactsBundle = contacts.buildJsonApi();

let communicationDraft = createCommMsgExtendedDraft({
  subject: subjectDid,
  sender: subjectDid,
  recipient: organizationDid,
});
communicationDraft = attachBundleToCommMsgExtendedDraft(
  communicationDraft,
  contactsBundle,
);

const communicationJob =
  createCommunicationOutboxJobFromCommMsgExtendedDraft(communicationDraft);

await individualSdk.ingestCommunicationAndUpdateIndex(tenantContext, {
  communicationJob,
});
```

`upsertRelatedPersonAndPoll(...)` remains internal compatibility plumbing for
the older direct GW route. Do not use it as the 101 authoring contract.

### 7.9 Disable a `RelatedPerson`

Use this when a caregiver or family relationship should stop being active, but
you still want the record to remain auditable.

```ts
import {
  EXAMPLE_INTEROPERABLE_CONTEXT_FHIR_API,
  RelatedPersonClaim,
} from 'gdc-common-utils-ts';

const relationshipIdentifier = existingRelationship.identifier;

await individualSdk.disableIndividualMember(
  tenantContext,
  {
    memberClaims: {
      '@context': EXAMPLE_INTEROPERABLE_CONTEXT_FHIR_API,
      [RelatedPersonClaim.IdentifierValue]: relationshipIdentifier,
    },
    resourceId: existingRelationship.resourceId,
  },
);
```

### 7.10 Purge a disabled `RelatedPerson`

Use this after disable when the relationship should be fully purged from the
active subject-side membership set.

```ts
import {
  EXAMPLE_INTEROPERABLE_CONTEXT_FHIR_API,
  RelatedPersonClaim,
} from 'gdc-common-utils-ts';

const relationshipIdentifier = existingRelationship.identifier;

await individualSdk.purgeIndividualMember(
  tenantContext,
  {
    memberClaims: {
      '@context': EXAMPLE_INTEROPERABLE_CONTEXT_FHIR_API,
      [RelatedPersonClaim.IdentifierValue]: relationshipIdentifier,
    },
    resourceId: existingRelationship.resourceId,
  },
);
```

Practical rule:

- disable first, then purge
- keep the same relationship business identifier in
  `RelatedPerson.identifier.value`
- `resourceId` is optional metadata; the canonical business locator is the
  `RelatedPerson` identifier

Optional narrower facade:

- `IndividualMemberSdk` is available for an already-authorized member to send
  Communication jobs and request subject-scoped token access
- the relationship lifecycle operations
  `disableIndividualMember(...)` and `purgeIndividualMember(...)`
  remain owned by `IndividualControllerSdk`

### 7.11 Build a communication with IPS or FHIR content

Recommended pattern:

1. author one Bundle containing one or several clinical resources
2. attach that completed Bundle to a Communication draft
3. freeze it into an outbox job
4. send the communication

```ts
const emailProfessional = 'doctor@example.org';

const professionalDid = buildProfessionalDidWeb({
  organizationDidWeb: organizationDid,
  email: emailProfessional,
  role: HealthcareActorRoles.Physician,
});

const clinicalBundleEditor = new BundleEditor()
  .setBundleOperation(BundleOperations.create)
  .setBundleType(BundleTypes.batch)
  .setAllowedResourceType(BundleEditableResourceTypes.observation);

clinicalBundleEditor
  .newEntryAs(BundleEditableResourceTypes.vitalSign)
  .setSubject(subjectDid)
  .setDate('2026-05-22T10:00:00Z')
  .setHeartRate(72)
  .ensureIdentifier();

clinicalBundleEditor
  .newEntryAs(BundleEditableResourceTypes.vitalSign)
  .setSubject(subjectDid)
  .setDate('2026-05-22T10:00:00Z')
  .setSystolicBloodPressure(120)
  .ensureIdentifier();

const clinicalBundle = clinicalBundleEditor.buildJsonApi();

let communicationDraft = createCommMsgExtendedDraft({
  subject: subjectDid,
  sender: professionalDid,
  recipient: organizationDid,
  noteText: 'IPS update with vital signs',
});

communicationDraft = attachBundleToCommMsgExtendedDraft(
  communicationDraft,
  clinicalBundle,
);

const communicationJob =
  createCommunicationOutboxJobFromCommMsgExtendedDraft(communicationDraft);
```

Important:

- the Bundle remains the semantic unit containing one or several changes
- the frontend decides whether to commit after one edit or after a section
- individual resource `upsert*` calls are internal compatibility plumbing
- `createCommunicationOutboxJobFromCommMsgExtendedDraft(...)` does not send anything
- it only freezes the current draft into:
  - `communicationJob.payload`: claims-first `CommMsgExtended`
  - `communicationJob.status`: local outbox status such as `ready`
- it does not create or store a DIDComm envelope
- network submission starts in the next step

### 7.12 Send the communication and wait for indexing

```ts
await individualControllerProfile.sdk.ingestCommunicationAndUpdateIndex(tenantContext, {
  communicationJob,
  clinicalFormat: 'r4',
});
```

The actor facade accepts the canonical outbox job and delegates wire rendering
to the configured runtime transport. Application code must not rebuild
`body.data`, `body.entry`, DIDComm envelopes or `request=<JWE>`.

This call returns the remote operation result; it does not replace the
frontend's subject ViewModel. After optimistic rendering, the frontend handles
per-entry failures and refreshes through the `_search` that belongs to the
displayed aggregate:

- `Composition/_search` / `searchClinicalBundle(...)` for the clinical
  document and its sections;
- the subject permission/Consent search for the full permission list;
- `RelatedPerson/_search` for the full contacts/related-entities list.

Those are distinct searches. There is no generic reconciliation endpoint.
The normalized result replaces only its corresponding local working copy.

This is the converged runtime path for:

- auditable `Communication`
- `DocumentReference` projection
- `Composition` projection
- IPS-aligned resource indexing

Scope note:

- this path is for clinical document-style bundles that arrive through
  `Communication`
- it is not a blanket rule for every value written to confidential storage
- appointment-only or other non-document flows should use their own route and
  should not be taught here as if they were the main clinical bundle path
- the Communication path is what updates the individual/subject index
- blockchain certification is a separate ledger-side concern; `_seal` is not
  the same thing as index ingestion
- current and future employee/consent manager flows can reuse the same
  content-hash anchoring pattern when they need it, but they are separate
  manager contracts

### 7.13 Read the available clinical summary

```ts
const allergySectionCode =
  HealthcareBasicSections.AllergiesAndIntolerances.attributeValue;

const summary = await individualControllerProfile.sdk.requestClinicalSummary(
  tenantContext,
  {
    subjectId: subjectDid,
    requesterId: actorDid,
    // Omit filterSections when the screen needs every available section.
    filterSections: [allergySectionCode],
  },
);

// Composition.section structure for navigation and unfiltered badges.
const sections = summary.reader.getDocumentSections();
const numberOfSections = summary.reader.getDocumentSectionCount();
const allergySection =
  summary.reader.getDocumentSectionByCode(allergySectionCode);
const declaredAllergyCount =
  summary.reader.getDocumentSectionResourceCount(allergySectionCode);
const allergyReferences =
  summary.reader.getDocumentSectionResourceReferences(allergySectionCode);

// Stable IDs or complete Bundle entries for a selected section.
const allergyIds = summary.reader.getDocumentSectionResourceIds(
  allergySectionCode,
);
const allergyEntries = summary.reader.getDocumentSectionResourceEntries(
  allergySectionCode,
);

// Resolved FHIR resources for cards and filtered badges.
const allergyView = summary.document
  .filterBySections([allergySectionCode])
  .filterByTypes([ResourceTypesFhirR4.AllergyIntolerance])
  .filterByClinicalDateRange('2026-01-01', '2026-12-31');
const recentAllergies = allergyView.getResources();
const visibleAllergyCount = allergyView.getResourceCount();

// Other local reads over the same returned Bundle.
const allResources = summary.document.getResources();
const allAllergies =
  summary.document.getResources(ResourceTypesFhirR4.AllergyIntolerance);
const allergiesContainingIbuprofen =
  summary.document.getContainingTextOrDisplay(
    ResourceTypesFhirR4.AllergyIntolerance,
    'ibuprofeno',
  );
```

This is the canonical 101 read flow:

`Communication -> Subject/$summary -> FHIR Parameters -> Bundle document`.

All-sections rule:

- omit `filterSections` to request every available section
- do not send `filterSections: ['*']`
- `section=*` is the SMART permission wildcard; it is not the application-level
  `$summary` section selector

It does not call `ingestCommunicationAndUpdateIndex(...)`. That method is
reserved for writes whose resources must be persisted/projected. The summary
result exposes two complementary readers:

- `summary.reader` is the shared `BundleReader`: section enumeration, section
  counts, resource references and generic bundle navigation
- `summary.document` is the SDK Core `FhirDocumentFacade`: resource retrieval,
  combined section/type/date filters, text search and typed clinical helpers

The two counts answer different questions:

- `declaredAllergyCount` counts references declared in `Composition.section`
- `visibleAllergyCount` counts resources after section/type/date filters

`filterByClinicalDateRange(from, to)` describes the query window, not one
specific FHIR property shape. A point-valued FHIR `date`, `dateTime` or
`instant` matches when it falls inside the window. A FHIR `Period` matches when
it overlaps the window. Date-only upper bounds include that complete day.

All reader/facade calls after `requestClinicalSummary(...)` are local reads over
`summary.bundle`. They do not trigger more GW requests. Missing sections
produce `undefined`, `0` or `[]` as appropriate, so the UI can render an empty
state without inventing a section.

UHC UNID applies this same document model in `IpsClinicalViewer`: section cards
come from `Composition.section`, the badge is the visible resource length, and
global or per-section type/text/date filters narrow the in-memory card list.

`LifecycleResultReader` has a different responsibility: analyze operation
outcomes, response statuses and issues. It is not the clinical document reader.

### 7.14 Compatibility: direct indexed Bundle search

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

Keep `searchClinicalBundle(...)` and `getLatestIps(...)` for compatibility or
specialized index queries. Do not teach them as the primary way for portal,
telephone or mobile channels to load the individual's available clinical
summary.

### 7.14.1 Vital signs as a measurement batch, not always as an immediate ledger write

Frequent device measurements can be accumulated first in a dedicated
vital-signs batch container and only projected into the IPS when the user,
professional, or system decides they are ready.

Recommended mental model:

- `Observation` resources such as heart rate, blood pressure, or similar
  smartwatch/device measurements are the atomic facts
- a day-level or session-level vital-signs batch groups those facts together as
  one atomic clinical artifact
- that batch can be ingested into the IPS as a measurement bundle
- the batch hash/CID can be anchored on-chain later, when policy says it is
  meaningful to certify the set, using the ledger certification path rather
  than the Communication ingestion path
- the individual measurements do not need to hit blockchain one by one

Multi-caregiver rule:

- a different caregiver, professional, or device may own a different batch for
  the same individual on the same day
- recover the actor-owned batch id first when it exists
- if no actor-owned batch exists for that day, create a new UUID-backed batch
  and start appending entries there
- do not assume the individual has only one mutable batch per day unless the
  product explicitly chooses that shared-log model
- several day batches from the same actor are a collection of atomic batch
  artifacts, not a single flat list of raw observations

In other words:

- document-oriented clinical bundles may anchor immediately
- high-frequency vital signs may stay off-ledger until they are aggregated
- the ledger should record the meaningful bundle hash, not every noisy sample

### 7.15 Register a blockchain artifact before sending the follow-up communication

Use the artifact registration path when the clinical bundle you are writing to
confidential storage also needs an on-chain CID/hash artifact.
The SDK call submits a `DocumentReference/_batch` payload and keeps the
canonical content hash separate from the business identifier.

Important:

- this helper is a current GW/SDK runtime path for document registration and
  index update
- it is not the `_seal` endpoint
- use `_seal` only for ledger-side certification when you do not want to
  mutate the individual's index through Communication

```ts
const artifactResult = await client.registerBlockchainArtifactAndUpdateIndex(
  tenantContext,
  {
    subject: subjectDid,
    resource: documentReferenceResource,
    contentType: 'application/pdf',
    contentDataBase64: pdfBase64,
    identifier: 'docref-2026-00042',
    title: 'Clinical attachment before communication',
    description: 'Anchored before the user-facing communication is sent',
  },
);
```

Use this pattern for:

- FHIR `DocumentReference` artifacts that are already materialized as a
  clinical document resource
- raw attached bytes such as PDF or image payloads associated with that
  clinical document
- FHIR-like payloads that still need a ledger-backed content CID once they are
  treated as a document-oriented clinical bundle

Routing note:

- the SDK does not invent sector/jurisdiction values on its own
- if your provider resolver derives them from `countryAddress` and
  `makesOffer.category`, do that before calling the SDK
- if that resolver fails, fall back to the individual-index provider
  sector/jurisdiction that already exists in the runtime context
- appointment-only flows should not be forced into this document path unless
  they really carry a clinical bundle that the system wants to certify
- if a future `individual/.../Bundle/_seal` route is exposed, it should keep
  the same ledger-only contract and still avoid index mutation

The result is the same ledger contract the GW layer expects:

- content hash/CID is the ledger artifact key
- business identifier stays separate
- the backend can then decide whether the anchored artifact belongs to a
  clinical-document follow-up, an employee batch, or a consent batch

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
- for `disableEmployee(...)` and `purgeEmployee(...)`, pass the concrete
  `resourceId` returned by employee create/search as the lifecycle target; the
  SDK rejects lifecycle calls without that technical id
  keep `org.schema.Person.identifier` in claims as the exported identity value
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
- lifecycle locator input:
  prefer `individualEditor`; `organizationEditor` remains as a legacy deprecated alias
- actor:
  only `IndividualControllerSdk`

Member and consent boundaries:

- typed RelatedPerson Bundle authoring followed by
  `ingestCommunicationAndUpdateIndex(...)` manages the
  membership/caregiver record
- `disableIndividualMember(...)` and `purgeIndividualMember(...)`
  are real controller lifecycle operations today:
  `disableIndividualMember(...)` uses the current `RelatedPerson/_batch` path,
  and `purgeIndividualMember(...)` uses the explicit `RelatedPerson/_purge`
  path
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

Practical rule:

- disable first, then purge
- keep the same relationship business identifier in
  `RelatedPerson.identifier.value`
- these member lifecycle operations are current runtime behavior, not part of
  the forward-looking TODO migrations below

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

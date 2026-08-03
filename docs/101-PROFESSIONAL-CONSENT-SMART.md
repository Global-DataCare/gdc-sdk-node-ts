# 101: Professional consent and SMART access

## Teaching goal

Create one canonical professional identity and reuse it in the permission
request, employee/profile state, the consent decision, the professional VP and
the SMART request. Application code must not construct LOINC values, gateway
IPs or SMART endpoint URLs.

This tutorial covers both directions:

1. the professional requests access before a SMART token exists;
2. the subject receives and answers that request;
3. the professional requests SMART only after the correlated Consent exists.

## 1. Configure the professional runtime for the employer organization

```ts
import {
  GatewayActiveConsentProvider,
  HttpRuntimeClient,
  IndividualControllerSdk,
  ProfessionalSdk,
  evaluateRequestedAccess,
  getMissingPermissions,
} from 'gdc-sdk-node-ts';

const employerContext = {
  tenantId: employerOrganizationTenantId,
  jurisdiction: 'ES',
  sector: 'health-care',
};

const professionalRuntime = new HttpRuntimeClient({
  baseUrl: employerOrganizationGwUrl,
  bearerToken: professionalIdToken,
  ctx: employerContext,
  smartTokenEndpointResolver: resolveSmartEndpointFromSubjectDid,
});
const professionalSdk = new ProfessionalSdk(professionalRuntime);
```

`bearerToken` is the professional's verified OpenID/Firebase `id_token`. It
authenticates the HTTP call that stores the request. It is not a SMART token
and it does not grant clinical access. If the runtime uses encrypted DIDComm,
configure its wallet-backed `secureTransportAdapter` here; applications do not
need another Voice/X-Portal proxy or a second portal token.

The professional runtime belongs to the professional and therefore uses the
employer organization GW and tenant as its stable defaults. It must not be
initialized with a patient/subject tenant. The portal selects a subject card
for each operation and obtains that card's DID plus provider route context:

```ts
const selectedSubject = await subjectCardDirectory.open(selectedCardId);
const subjectDid = selectedSubject.did;
const subjectRouteContext = selectedSubject.providerRouteContext;
```

The selected context is an operation destination, not the professional's
identity or runtime home. The employer GW remains the professional's outbound
gateway and routes the protected request to the recipient/provider identified
by the selected card. If a deployment cannot perform that cross-provider
routing yet, that is a GW transport limitation; applications must not work
around it by rebinding the professional runtime to each subject.

A product may resolve email to `subjectDid` through its authenticated patient
directory, invitation or lookup service. The generic SDK deliberately does not
expose a global email-to-DID resolver.

## 2. Evaluate current Consent and submit only the missing access

```ts
const actor = {
  actorKind: 'professional' as const,
  did: professionalActorDid,
  organizationDid: organizationDidWeb,
};

const consentProvider = new GatewayActiveConsentProvider(
  professionalRuntime,
  subjectRouteContext,
);
const evaluation = await evaluateRequestedAccess(consentProvider, {
  subject: subjectDid,
  actor,
  actorRole: professionalRole,
  purpose: HealthcareConsentPurposes.Treatment,
  sections: requestedSections,
  resourceTypes: [],
});
const missing = getMissingPermissions(evaluation);

const request = await professionalSdk.requestProfessionalAccess(
  subjectRouteContext,
  {
    subject: subjectDid,
    requester: actor,
    requesterRole: professionalRole,
    purpose: HealthcareConsentPurposes.Treatment,
    missing,
    sender: professionalActorDid,
    recipient: subjectDid,
    justification: 'Access required for the current treatment episode.',
  },
);
```

`requestProfessionalAccess(...)` builds and submits the canonical
permission-request `Communication` through `Communication/_batch`; callers do
not call `ingestClinicalCommunication` themselves. The operation requires no
SMART token because it writes an auditable request, not clinical data access.
Keep `request.thid` and `request.communicationIdentifier` for correlation.

## 3. Let the subject list and answer the request

```ts
const subjectRuntime = new HttpRuntimeClient({
  baseUrl: subjectProviderGwUrl,
  bearerToken: subjectIdToken,
  ctx: subjectRouteContext,
});
const subjectSdk = new IndividualControllerSdk(subjectRuntime);

const inbox = await subjectSdk.listProfessionalAccessRequests(
  subjectRouteContext,
  { subject: subjectDid, recipientActorId: subjectDid },
);

const decision = await subjectSdk.respondToProfessionalAccessRequest(
  subjectRouteContext,
  {
    requestThid: request.thid,
    requestCommunicationIdentifier: request.communicationIdentifier,
    subjectDid,
    actorId: professionalActorDid,
    actorRole: professionalRole,
    purpose: HealthcareConsentPurposes.Treatment,
    actions: requestedSections,
    decision: 'permit',
  },
);
```

The GW is the canonical inbox: `listProfessionalAccessRequests(...)` searches
stored permission-request Communications. Email, push or SMS may notify the
subject, but they are optional delivery channels. The response uses the normal
Consent grant operation and adds `Consent.event-basedon` plus
`Consent.source-reference`; there is no separate uncorrelated grant contract.

Use `decision: 'deny'` with the same request identifiers for an explicit
denial.

## 4. ActiveConsentProvider is supplied by the Node SDK

`GatewayActiveConsentProvider` reads the subject's active Consent resources
from GW and filters expired or wrong-subject rules. Applications do not need a
parallel consent table. A custom `ActiveConsentProvider` remains useful only
for another authoritative persistence runtime.

## 5. Match the professional actor safely

The Consent actor should be the exact professional DID reused by the employee
or member profile, VP credential subject and SMART request. Current GW also
accepts a hosted/external `did:web` alias when the verified VP binds the
requesting actor and both DIDs have the same terminal hashed identifier and
role. Literal path labels such as `employee` versus `member` are not security
identifiers. An `id_token` or an unverified DID suffix alone never creates that
alias.

## 6. Build one professional actor DID

```ts
import {
  buildProfessionalDidWeb,
  buildSmartCompositionReadScope,
  HealthcareActorRoles,
  HealthcareConsentActions,
  HealthcareConsentPurposes,
} from 'gdc-common-utils-ts';

const professionalRole =
  HealthcareActorRoles.GeneralistMedicalPractitioner;

const professionalActorDid = buildProfessionalDidWeb({
  organizationDidWeb,
  email: professionalEmail,
  role: professionalRole,
});
```

`buildProfessionalDidWeb(...)` lower-cases the email and embeds a
base58btc/multibase SHA3-256 multihash, never the plaintext email. The
professional credential's ICA-compatible `sameAs` uses the exact same
multibase payload as `urn:multibase:<multihash>`. Only the prefix differs.

The earlier SHA3-384-derived professional DID is a different actor identity.
Migrate or reissue its profile, Consent and VP material together before using
the SHA3-256 actor DID.

An internal employee UUID may remain a resource, profile or database key. It
is not the `actorDid` used for consent evaluation.

## 7. Select shared consent actions

```ts
const consentActions = [
  HealthcareConsentActions.PatientSummaryDocument,
  HealthcareConsentActions.AllergiesAndIntolerances,
];
```

Do not copy `LOINC|...` literals into application code. The
`PatientSummaryDocument` action is retained by the current GW consent/scope
contract as a compatibility action even though LOINC `60591-5` is an IPS
document type rather than a Composition section.

## 8. Direct grant without a preceding request

```ts
await individualSdk.grantProfessionalAccess(ctx, {
  subjectDid,
  actorId: professionalActorDid,
  actorRole: professionalRole,
  purpose: HealthcareConsentPurposes.Treatment,
  actions: consentActions,
});
```

A grant previously addressed to an email or a different identifier does not
become a grant for this DID. Create a new grant when migrating that actor.

Use this direct subject-initiated grant when there is no prior professional
request. For the inverse flow, prefer
`respondToProfessionalAccessRequest(...)` so the Consent remains correlated.

## 9. Build the professional VP with the same actor

```ts
const vpToken = professionalSdk.buildUnsignedIdentityVpJwt({
  clientId,
  actorDid: professionalActorDid,
  email: professionalEmail,
  role: professionalRole,
});
```

The unsigned helper is for demo/test fixtures. Production uses a signed VP
from the protected professional wallet, but its credential subject still uses
the same `professionalActorDid`.

## 10. Request only the consented clinical scope

```ts
const clinicalScope = buildSmartCompositionReadScope({
  subjectDid,
  sections: consentActions,
});

const token = await professionalSdk.requestSmartToken({
  idToken,
  vpToken,
  actorDid: professionalActorDid,
  subjectDid,
  clientId,
  purpose: HealthcareConsentPurposes.Treatment,
  scopes: [clinicalScope],
  smartTokenKind: 'openid-smart',
});
```

Do not add `organization/Consent.cruds` to a clinical read unless another
permission rule grants that resource capability.

High-level application code omits `audience`. The Node runtime:

1. uses its trusted subject-provider/index resolver when configured;
2. extracts the provider's concrete
   `#identity:openid:smart:token` service endpoint;
3. uses that endpoint for both transport and JWT audience;
4. otherwise uses the exact SMART endpoint for its configured GW route.

The optional resolver cache is runtime infrastructure. It is not part of the
developer-facing flow and does not contain employees or consent records.

## Executable source

The same flow is asserted by
[`tests/101-professional-consent-smart.test.mjs`](../tests/101-professional-consent-smart.test.mjs)
and the inverse request lifecycle by
[`tests/101-professional-access-request-lifecycle.test.mjs`](../tests/101-professional-access-request-lifecycle.test.mjs).

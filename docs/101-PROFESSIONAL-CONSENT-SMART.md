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
initialized with another subject's tenant. The product selects a subject for
each operation and asks its application-owned directory/resolver for the
canonical subject DID plus provider route context:

```ts
const selectedSubject = await subjectsDirectory.resolveByDid(selectedSubjectDid);
const subjectDid = selectedSubject.subjectDid;
const subjectRouteContext = selectedSubject.providerRouteContext;
```

`subjectsDirectory` is pseudocode for a product/integration service, not an SDK
class or a current generic GW endpoint. It resolves only subjects already
disclosed to the authenticated actor; it is not a global person search.

GDC uses `subject` as an actor-neutral operation concept, not as a concrete
FHIR `Subject` resource. In the current GW individual model, the root personal
or family data-space record is an `org.schema.Organization`, searched through:

```text
/{tenant}/cds-{jurisdiction}/v1/{sector}/individual/org.schema/Organization/_search
```

The exact public lookup claim is `org.schema.Organization.sameAs = subjectDid`.
`org.schema.Organization.identifier.value` remains the internal/business
organization identifier. `org.schema.Person.*` claims identify people and
actors such as employees, invitation recipients or members; `Person` is not
the root subject-directory record. FHIR `Patient` references may appear inside
clinical resources, but GW does not use a global Patient search as the subject
directory.

One product may define its card identity as a public subject alias:

```text
did:web:<product-host>:<product-subject-path>:<public-subject-number>
```

Such a DID may be encoded in a QR, stored in
`org.schema.Organization.sameAs`, returned as `authorizedSubjectDid` by an
accepted member license and currently reused directly as `subjectDid` in
Consent, Communication, SMART and clinical subject references. It is not a
`urn:uuid` and must not be downgraded to a mere UI id. Another product may use
a different individual DID shape, for example one returned by
`buildIndividualDidWeb(...)`; the generic SDK consumes the resolved
`subjectDid` without imposing product vocabulary.

Do not use `RelatedPerson` as a generic subject directory. It describes a
subject-owned family/caregiver relationship; its `RelatedPerson.patient`
references the canonical subject DID, while its own identifier identifies the
relationship/member. The current GW routes it through
`individual/org.hl7.fhir.r4/RelatedPerson/_search` and lifecycle operations.

Do not infer semantics from a DID path segment alone. A product contract may
make a card DID the public subject alias; another may model a separate physical
support DID that requires an explicit, verified resolution to its subject
identity. `urn:uuid:...` values identify records such as Communications, VCs
or invitations and are not public subject DIDs.

GW internally resolves subject-scoped clinical operations such as
`Subject/$summary`, `Subject/_search` and `Bundle/_search` when they are carried
by an auditable `Communication`. They are not public routes that professional
application code should construct directly. The public application contract is
the actor facade (`requestClinicalSummary(...)` for the available document),
and the runtime submits `Communication/_batch`. There is still no generic
`SubjectDirectory/_search`; directory lookup and disclosure policy therefore
belong to the product/provider integration until that separate public contract
exists.

The selected context is an operation destination, not the professional's
identity or runtime home. The employer GW remains the professional's outbound
gateway and routes the protected request to the recipient/provider identified
by the selected subject. If a deployment cannot perform that cross-provider
routing yet, that is a GW transport limitation; applications must not work
around it by rebinding the professional runtime to each subject.

A product may resolve email to `subjectDid` through its authenticated subject
directory, invitation or lookup service only when that subject has already
completed onboarding. The generic SDK deliberately does not expose a global
email-to-DID resolver.

### Current MVP boundary and planned GW v2 onboarding

The current professional access-request lifecycle starts with an existing
subject. Individual onboarding has already created its canonical DID, and the
professional selects that disclosed DID before requesting Consent. The current
MVP does not let a professional create an individual's index and controller,
and it must not invent an email-to-DID value when the individual does not yet
exist.

GW v2 must add a separate delegated-onboarding contract for the later case in
which a professional creates the individual index. That operation is not part
of this 101 lifecycle or the current MVP. Its planned request must:

1. be signed by the authenticated professional;
2. attach the individual's or legal guardian's signed Consent as evidence;
3. identify whether the controller is the individual or another authorized
   person;
4. create the canonical individual DID and return it with the new index;
5. preserve the professional request, Consent attachment and resulting DID as
   one auditable correlation chain.

The professional signature authenticates and binds the delegated onboarding
request; it does not replace the individual/guardian Consent. The attached
Consent is not universally required to use a qualified electronic certificate:
the applicable assurance and legal-signature policy must be explicit in the GW
v2 profile. Until that profile, validation rules, revocation behavior and live
tests exist, application code must keep this flow disabled rather than treating
the current permission-request API as an onboarding API.

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
    periodEnd: '2026-08-31T18:30:00Z',
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

`periodEnd` is optional. When present, it is signed as
`Consent.period-end`; access is inactive at that instant. GW also limits the
SMART token `exp` to that deadline, so a token issued shortly before the end
cannot outlive the temporary grant.

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
  periodEnd: '2026-08-31T18:30:00Z',
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

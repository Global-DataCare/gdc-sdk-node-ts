# 101: Professional consent and SMART access

## Teaching goal

Create one canonical professional identity and reuse it in employee/profile
state, the consent grant, the professional VP and the SMART request. Application
code must not construct LOINC values, gateway IPs or SMART endpoint URLs.

## 1. Build one professional actor DID

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

## 2. Select shared consent actions

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

## 3. Grant access to the canonical actor

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

## 4. Build the professional VP with the same actor

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

## 5. Request only the consented clinical scope

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
[`tests/101-professional-consent-smart.test.mjs`](../tests/101-professional-consent-smart.test.mjs).

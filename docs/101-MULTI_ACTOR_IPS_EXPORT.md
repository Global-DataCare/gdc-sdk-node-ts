# 101: Multi-actor IPS export

This is the numbered, product-neutral contract for aggregating externally
supplied IPS data with facts recorded by an individual controller and a
caregiver. `Composition.author` identifies the organization, EHR/patient portal
or individual that supplies the document. `Composition.attester` identifies the
registered `PractitionerRole` or `RelatedPerson` assignment that attests it.
`sender` remains audit and transport evidence.

The examples reuse canonical builders and fixture values. Production BFFs load
the same fields from protected profiles; browsers never send author, attester,
role UUID, private UUID, email or phone identifiers.

## Read the three identities first

They are deliberately different:

1. `profile.actorDid` is the operational sender and audit identity. It may
   contain a resolvable host/domain and may therefore change after migration.
2. `Composition.author` is stable FHIR provenance. A professional document uses
   the provider's legal organization URN; a controller/member-created local
   copy uses its registered `RelatedPerson` urn:uuid.
3. `Composition.attester.party` is the registered assignment: a professional
   `PractitionerRole` urn:uuid, or the same controller/member `RelatedPerson`
   urn:uuid. An imported external IPS keeps whatever valid references it brought.

The reusable professional builder and test data produce this complete DID:

```ts
import { buildProfessionalDidWeb } from 'gdc-common-utils-ts';
import {
  EXAMPLE_API_ORGANIZATION_DID,
  EXAMPLE_EMAIL_PROFESSIONAL,
  EXAMPLE_HEALTHCARE_ACTOR_ROLE_GENERALIST_MEDICAL_PRACTITIONER,
  EXAMPLE_PROFESSIONAL_DID,
} from 'gdc-common-utils-ts/examples/shared';

const employeeDid = buildProfessionalDidWeb({
  organizationDidWeb: EXAMPLE_API_ORGANIZATION_DID,
  email: EXAMPLE_EMAIL_PROFESSIONAL,
  role: EXAMPLE_HEALTHCARE_ACTOR_ROLE_GENERALIST_MEDICAL_PRACTITIONER,
});

// did:web:<organization-domain>:employee:<multibase-contact-hash>:<role-token>
// did:web:api.acme.org:employee:zW1pca8dQVVz2apBk8A1CWJ8VSHgheXpRZoZtqwhnkHjFkV:ISCO-08|2211
assert.equal(employeeDid, EXAMPLE_PROFESSIONAL_DID);
```

The BFF does not hash or join path segments itself. For an individual
controller it calls the complete private-identifier builder:

```ts
import {
  buildIndividualMemberDidWebFromPrivateIdentifiers,
  SecureIdTypesIndividual,
} from 'gdc-common-utils-ts';
import {
  EXAMPLE_EMAIL_CONTROLLER_INDIVIDUAL,
  EXAMPLE_HOSTED_INDIVIDUAL_CONTROLLER_DID,
  EXAMPLE_HOSTED_PROVIDER_DID,
  EXAMPLE_INDIVIDUAL_CONTROLLER_ROLE_TYPE,
  EXAMPLE_INDIVIDUAL_CONTROLLER_ROLE_VALUE,
  EXAMPLE_PRIVATE_INDIVIDUAL_UUID,
} from 'gdc-common-utils-ts/examples/shared';

const controllerDid = buildIndividualMemberDidWebFromPrivateIdentifiers({
  providerDidWeb: EXAMPLE_HOSTED_PROVIDER_DID,
  secureIdTypeIndividual: SecureIdTypesIndividual.Uuid,
  privateIdValueIndividual: EXAMPLE_PRIVATE_INDIVIDUAL_UUID,
  secureIdTypeMember: SecureIdTypesIndividual.Email,
  privateIdValueMember: EXAMPLE_EMAIL_CONTROLLER_INDIVIDUAL,
  roleType: EXAMPLE_INDIVIDUAL_CONTROLLER_ROLE_TYPE,
  roleValue: EXAMPLE_INDIVIDUAL_CONTROLLER_ROLE_VALUE,
});

// did:web:<provider-path>:individual:<secure-id-type>:<secure-id-value>:member:<secure-member-value>:<role-value>
// did:web:host.example.com:health-care:organization:taxid:ES-B00112233:individual:UUID:zG9H82pae9SCXvec3D4YKqhX8bj8F1mRgzxMEdwXXonT7BWsvsUiP2u52sWQTeESpoMee:member:zG9FEVaXcQgzppJZUe7WwnqbM1mqTLbktoPSbPvMj2T6fj121vncQCbKyqh4BTYtSh2Tj:RESPRSN
assert.equal(controllerDid, EXAMPLE_HOSTED_INDIVIDUAL_CONTROLLER_DID);
```

`secureIdTypeIndividual` is explicit (`UUID`, `EMAIL`, `PHONE`, `DL`, `PPN`,
etc.). Both secure values are SHA3-384 multihashes encoded as base58btc and
prefixed with `z`; the private UUID/email/phone/license/passport never appears
in the DID. `roleType` is retained in protected authorization data, while only
`roleValue` is serialized to avoid embedding a long FHIR `system|value` token.

The stable professional document author is built separately from the legal
organization identifier and contains no host/domain:

```ts
import { buildOrganizationAuthorizationUrnCds } from 'gdc-common-utils-ts';

const professionalDocumentAuthor = buildOrganizationAuthorizationUrnCds({
  jurisdiction: 'ES',
  version: 'v1',
  identifierType: 'TAX',
  identifierValue: 'ES-B00112233',
});
// urn:cds-es:v1:organization:tax:ES-B00112233
```

The matching host-independent employee authorization path keeps the `member`
marker and reuses the protected role value:

```ts
import {
  buildOrganizationMemberAuthorizationUrnCds,
  buildSecureIdValueMember,
  ISCO08_CODING_SYSTEM,
  SecureIdTypesIndividual,
} from 'gdc-common-utils-ts';

const employeeAuthorizationUrn = buildOrganizationMemberAuthorizationUrnCds({
  organizationUrn: professionalDocumentAuthor,
  memberId: buildSecureIdValueMember({
    secureIdTypeMember: SecureIdTypesIndividual.Email,
    privateIdValueMember: EXAMPLE_EMAIL_PROFESSIONAL,
  }),
  roleType: ISCO08_CODING_SYSTEM,
  roleValue: EXAMPLE_HEALTHCARE_ACTOR_ROLE_GENERALIST_MEDICAL_PRACTITIONER,
});
// urn:cds-es:v1:organization:tax:ES-B00112233:member:zG9Gjhm4F9WwjUbk4D2sAL1wDj5MWuXsJooWPYDG5XYKURBQa4Q7wXttzusFntw6tXH3F:ISCO-08|2211
```

That organization URN is the author. `buildMemberAuthorizationUrn(...)` is an
authorization/Consent identifier; it does not replace a FHIR PractitionerRole
or RelatedPerson `urn:uuid`.

Do not confuse it with the older CDS identifier families:

- `urn:cds-<jurisdiction>:<official-org-id>:<contact-multibase>:<role>` is the
  private preimage used to derive a role-license `urn:multibase:z...`. It names
  a licensed seat, not the author organization.
- `urn:cds:<jurisdiction>:v1:<sector>:product:...` names commercial resources
  such as Offer/Order records, not people or FHIR provenance.

Jurisdiction is mandatory even when the legal value also carries a country
prefix: it selects the authority that interprets types such as TAX, BN, EIN or
US-WA UBI. `v1` versions the identifier grammar, not the organization.

## Journey 1 — external IPS import by an administrative professional

Authorization invariant: the authenticated professional has a governed,
cross-sector receptionist assignment (`ISCO-08|4226`) and subject Consent.
Persistence invariant: the received `Composition.author` and existing attesters
are preserved. The administrative professional is the submitter, not silently
promoted to author or attester.

```ts
// `externallyAuthoredIpsDocument` is the validated document Bundle received
// from an organization, EHR or patient portal. Keep its provenance unchanged.
await individualControllerRuntime.importIpsOrFhirAndUpdateIndex(
  individualControllerProfile,
  tenantContext,
  { compositionPayload: externallyAuthoredIpsDocument, format: 'r4' },
);
```

## Journey 2 — individual controller records a neutral measurement

Authorization invariant: the controller is registered as a `RelatedPerson`
with role `RESPRSN`; `ONESELF` is not used for controller authority.
Persistence invariant: the controller's registered `RelatedPerson` urn:uuid is
both author and personal attester for the locally created content.

```ts
import { HealthcareBasicSections } from 'gdc-common-utils-ts';

const controllerProvenance = await profileManager.exportClinicalCreatorIps({
  ownerId: authenticatedAccountId,
  profileId: controllerProfileId,
});

// `controllerBodyWeightBatch` uses LOINC 29463-7 and UCUM kg. Body weight is
// deliberately neutral across human care, animal care and assisted living.
await controllerProfile.sdk.updateClinicalSection(tenantContext, {
  subject: subjectDid,
  sender: controllerProfile.session.actorDid,
  recipient: providerDid,
  section: HealthcareBasicSections.VitalSigns,
  bundle: controllerBodyWeightBatch,
  // Pass the complete protected export. The SDK derives the same RelatedPerson
  // urn:uuid as author and attester; actorDid remains only the sender.
  clinicalCreator: controllerProvenance,
});
```

## Journey 3 — caregiver records another neutral measurement

Authorization invariant: subject Consent and SMART scope authorize this exact
caregiver; a relationship or login alone does not.
Persistence invariant: the caregiver's registered `RelatedPerson` urn:uuid is
both author and personal attester for the locally created content.

```ts
const caregiverProvenance = await profileManager.exportClinicalCreatorIps({
  ownerId: authenticatedAccountId,
  profileId: caregiverProfileId,
});

// `caregiverBodyWeightBatch` is a different Observation with the same canonical
// LOINC 29463-7 / UCUM kg coding and its own stable identifier.
await caregiverProfile.sdk.updateClinicalSection(tenantContext, {
  subject: subjectDid,
  sender: caregiverProfile.session.actorDid,
  recipient: providerDid,
  section: HealthcareBasicSections.VitalSigns,
  bundle: caregiverBodyWeightBatch,
  clinicalCreator: caregiverProvenance,
});
```

## Journey 4 — aggregated IPS export and graph verification

Authorization invariant: the requester may read the subject but is not thereby
made author or attester. Persistence invariant: the returned document contains
the union of source authors and attesters and the resources needed to resolve
their graph.

```ts
const summaryRequest = await loadedActorProfile.sdk.requestClinicalSummary(
  tenantContext,
  { subject: subjectDid },
);

const ips = summaryRequest.bundle;

// Verify all clinical facts, including both LOINC 29463-7 / UCUM kg
// Observations, plus the imported IPS resources.
assertAggregatedClinicalResources(ips);

// Verify source and assignment provenance independently:
// - Composition.author: stable Organization URN and RelatedPerson urn:uuid values.
// - Composition.attester.party: PractitionerRole and RelatedPerson.
// - Bundle graph: Organization, Practitioner, PractitionerRole, RelatedPerson.
assertResolvableIpsProvenanceGraph(ips);
```

## Journey 5 — correction and deletion remain assignment-bound

Authorization invariant: a shared organization or individual author does not
let every employee/member mutate every fact. GW resolves the authenticated
creator binding against the stored attester; governed same-owner/successor
policy is explicit. An imported external fact is not locally editable merely
because an administrator transported it.

```ts
// The browser supplies only the requested business edit. The BFF obtains the
// actor session and protected creator binding before calling the SDK.
await loadedActorProfile.sdk.updateClinicalSection(tenantContext, {
  ...authorizedCorrection,
  sender: loadedActorProfile.session.actorDid,
  clinicalCreator: protectedProvenance,
});
```

## Editable local copy of an imported IPS

The imported document remains immutable. The protected export determines the
new local copy's FHIR identities without making `profile.actorDid` its author:

```ts
const actorDid = profile.actorDid;
const clinicalCreator = await profileManager.exportClinicalCreatorIps({
  ownerId: authenticatedAccountId,
  profileId: profile.id,
});

const editableCopy = cloneImportedClinicalDocumentForDemo({
  bundle: importedIps,
  clinicalCreator,
});

await updateClinicalSummary(ctx, {
  subject: individualDid,
  sender: actorDid,       // operational DID: transport and audit only
  recipient: providerDid, // real hosted tenant DID
  bundle: editableCopy,
});
```

For a professional/employee the clone author is the stable legal organization
URN and its attester is the PractitionerRole urn:uuid. For an individual
member/controller the RelatedPerson urn:uuid is both author and attester.

The release gate for these journeys is a real local UI/BFF or live Node runtime
against local GW services, followed by `$summary` readback. A mocked route,
fixture page, skipped live test or API-only assertion is not equivalent proof.

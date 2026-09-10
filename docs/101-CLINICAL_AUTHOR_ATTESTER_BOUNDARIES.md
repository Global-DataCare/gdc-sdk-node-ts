# Subject-section author and profile-attester contract

Use the complete, type-checked implementation in
[`snippets/subject-section-writes.ts`](./snippets/subject-section-writes.ts).
Every value in that file is either returned by a shown SDK call or declared as
an application input; there are no invented `controllerRelationship`,
`practitionerRole` or UUID variables.

## The current contract

The current confidential-storage index uses Composition-compatible flat claims
for section batches because those batches may later be materialized as one
`Bundle.type=document`. This remains the supported contract:

- `subject`: the human or animal whose index is updated;
- `dataAuthorReference`: the author/source of this particular write;
- `attester`: the FHIR identity bound to the authenticated, unlocked profile;
- `sender`: the operational DID that transports the request;
- `section`: the functional section, whether clinical or non-clinical.

`dataAuthorReference` may change on every write while `attester` remains the
same for the selected profile. `actorIdentifier` is an authorization/Consent
identifier and is not an alias for `dataAuthorReference`.

`dataAuthorReference` is an actual FHIR reference from the data source, not a
new SDK-generated identity. Preserve an imported `Composition.author`. For
locally provider-authored data, call the snippet's
`buildProfessionalDataAuthorReference(...)`, which uses
`buildOrganizationAuthorizationUrnCds(...)` with the real jurisdiction and
legal-identifier type/value. For personally authored data, use the real stable
FHIR reference for that author; use the profile's RelatedPerson reference only
when that RelatedPerson truly authored the write. Never copy a sample URN.

Do not migrate these batches to `Provenance` in application code yet. A future
internal migration may project the roles to canonical
`Provenance.agent.who`/`Provenance.agent.type` values such as enterer,
performer or author. Until that migration is implemented and indexed, the SDK
continues emitting the existing Composition-compatible claims.

## Where the attester comes from

The individual Organization owns the principal controller declaration through
`Organization.owner.email` or `Organization.owner.telephone`. When its Order
is confirmed, GW issues that owner the bare `RESPRSN` controller licence,
materializes the corresponding `RelatedPerson` assignment in the terminal
response. The SDK derives its governed identifier from the sibling
RelatedPerson `resource.meta.claims` and exposes it as
`controllerRelatedPersonIdentifier`; it is not a new Order claim. The older
`controllerAssignmentIdentifier` property is a deprecated compatibility alias.
The portal neither ingests nor searches for this primary assignment.

`RelatedPerson/_search` remains the directory operation for additional
caregivers, family members and other related entities. It is not part of the
principal owner/controller enrollment path.

For an individual controller/member, the resulting reference is:

```text
urn:uuid:<RelatedPerson.identifier UUID returned by GW>

Example: urn:uuid:00000000-0000-4000-8000-000000000001
```

For a professional, `provisionOrganizationEmployee(...)` returns the Employee
creation receipt together with its contained `PractitionerRole`.
`readEmployeeProfessionalAssignmentIdentifier(...)` reads that exact UUID and
`buildProfileAttester(...)` produces:

```text
urn:uuid:<PractitionerRole.id returned by GW>
```

Never derive either reference from email, telephone, `actorDid`, `profileId`,
OAuth `client_id` or a signing key.

## Enrollment and unlocking

`enroll()` remains technical: it registers/protects the wallet and stores the
profile's stable attester assignment. It does not choose the author of any
section or document. New integrations do not pass `clinicalCreatorBinding`.

The activation code for an individual controller comes directly from
`confirmIndividualOrganizationOrder()`, together with
`controllerRelatedPersonIdentifier`. There is no `getLicense()`, RelatedPerson
ingestion or `RelatedPerson/_search` call in that flow.

`unlock()` returns `session.attester`; the subsequent opened facade exposes the
same value as `openedProfile.profile.attester`. Use that stored attester and do
not rebuild its URN:

```ts
await openedProfile.sdk.updateSubjectSection(tenantContext, {
  subject: subjectDid,
  sender: openedProfile.profile.actorDid,
  recipient: providerDid,
  section,
  bundle: sectionChanges,
  dataAuthorReference,
  attester: openedProfile.profile.attester,
});
```

The same type-checked `updateSubjectSection(...)` helper accepts the opened
individual controller or the opened professional. It performs the required
missing-attester check before this call, so application code never uses
`undefined`.

## Create, update and delete

The snippet exports three `BundleEditor` examples:

- `buildAllergyCreate(...)` produces `POST` plus a resource body;
- `buildAllergyUpdate(...)` produces `PUT ResourceType/id` and applies
  `ifMatch(currentVersionId)`;
- `buildAllergyDelete(...)` produces `DELETE ResourceType/id`, applies
  `ifMatch(currentVersionId)` and emits no resource body.

The same `updateSubjectSection()` envelope is used for other supported
functional sections, including appointments, contracts and future coverage
sections. The method name does not imply that the section belongs to the
unlocked profile: it belongs to `subject`.

`updateClinicalSection()` remains as a deprecated compatibility alias during
the migration; existing integrations are not broken.

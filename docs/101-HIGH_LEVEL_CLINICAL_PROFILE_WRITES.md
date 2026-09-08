# Individual profile enrollment and high-level clinical writes

This is the single link to send to an integrator who needs to understand both
how an individual-controller profile is registered and how that already
registered profile later writes clinical data. It deliberately separates two
different journeys:

1. **Journey 0 — one-time profile enrollment:** register the individual
   organization, confirm its Order, consume the activation code and bind the
   protected clinical identity to a managed profile.
2. **Journey 1 — normal clinical write:** load the existing authenticated
   profile, obtain its protected author/attester projection and submit the
   clinical content.

This is the canonical copyable subset of
[101-SDK_END_TO_END](./101-SDK_END_TO_END.md) for the profile-to-clinical-write
boundary.

`enroll()` is onboarding and is not a document-write operation. A normal
clinical write must not register the organization, confirm its Order, consume
another activation code or enroll another wallet/device.

The examples show only public application and SDK facades. Wallet
construction, raw HTTP, DIDComm packaging, queues, polling routes and ledger
configuration remain outside this 101.

The complete reusable normal-write functions are in
[high-level-clinical-profile-writes.ts](./snippets/high-level-clinical-profile-writes.ts).

## Journey 0 — one-time individual-controller profile enrollment

Run this journey only when the individual organization and its managed
controller profile do not exist yet. The `individualSdk` below is the facade of
the already authenticated person/channel authorized to request registration;
it is not the new managed profile being created.

```ts
const registration = await individualSdk.registerIndividualOrganization({
  ...tenantContext,
  alternateName,
  controllerEmail: verifiedControllerEmail,
  timeoutSeconds: registrationTimeoutSeconds,
  intervalSeconds: pollIntervalSeconds,
});

const order = await individualSdk.confirmIndividualOrganizationOrder({
  ...tenantContext,
  offerId: registration.offerId,
  timeoutSeconds: orderTimeoutSeconds,
  intervalSeconds: pollIntervalSeconds,
});

// The BFF owns these confidential UUIDs. They come from the controller's
// durable person record and its RelatedPerson relationship record. They are
// not DIDs, OAuth client ids, profile ids or FHIR Patient ids.
const controllerActorIdentifier = controllerIdentity.id;
const controllerAttesterAssignmentIdentifier = controllerRelationship.id;

const individualControllerDid = buildIndividualMemberDidWebFromPrivateIdentifiers({
  providerDidWeb: registration.identity!.providerDidWeb,
  secureIdTypeIndividual: SecureIdTypesIndividual.Uuid,
  privateIdValueIndividual: registration.identity!.resourceId,
  secureIdTypeMember: SecureIdTypesIndividual.Email,
  privateIdValueMember: verifiedControllerEmail,
  roleType: HL7_CODING_SYSTEM_V3_ROLE_CODE,
  roleValue: HealthcareActorRoleCodes.Controller,
});

const enrolledProfile = await profileSessionManager.enroll({
  ownerId: profileAccountId,
  profileId: individualControllerProfileId,
  actorKind: ActorKinds.IndividualController,
  actorMode: 'controller',
  actorDid: individualControllerDid,
  profileDid: individualControllerDid,
  providerDid: registration.identity!.providerDidWeb,
  routeContext: tenantContext,
  allowedSubjectDids: [registration.identity!.subjectDid],
  pin: profilePin,
  idToken,
  activationCode: order.activationCode,
  clinicalCreatorBinding: {
    kind: FhirIpsCreatorKinds.IndividualMember,
    actorIdentifier: controllerActorIdentifier,
    assignmentIdentifier: controllerAttesterAssignmentIdentifier,
    ownerIdentifier: registration.identity!.resourceId,
    role: HealthcareActorRoleCodes.Controller,
  },
  redirectUris,
  clientName,
});
```

The binding names describe stored identity evidence, not arbitrary provenance
chosen by the browser:

- `actorIdentifier` identifies the authenticated natural actor behind this
  controller/member relationship. It is not the clinical subject or Patient.
- `assignmentIdentifier` identifies the exact `RelatedPerson` relationship
  assignment used as `Composition.attester.party`.
- `ownerIdentifier` identifies the licensed individual and becomes the source
  author only when the BFF selects `ClinicalSourceAuthorSelections.Owner` for
  individual-originated or dictated content. The default/`Creator` selection
  remains the registered member/controller `RelatedPerson`.
- The persisted DCR/profile wire representation still calls the assignment
  `authorIdentifier`. That wire name is deprecated: it identifies the
  attester assignment and does not select `Composition.author`.

| Binding value | Individual controller/member | Professional employee |
| --- | --- | --- |
| `actorIdentifier` | natural controller/member UUID | underlying Practitioner UUID |
| `assignmentIdentifier` | RelatedPerson UUID used as attester | PractitionerRole UUID used as attester |
| `ownerIdentifier` | licensed individual UUID selected as author by `Owner` | professional organization legal identifier and author |

FHIR keeps the clinical subject separate from these roles. In a human-health
document the Patient may also be the individual author, but being
`Composition.subject` does not by itself make that Patient the author.

The high-level 2.x input cannot reuse `authorIdentifier` for the actual source
author because that property is already occupied by the historical DCR/profile
wire contract. Instead, the protected export derives `Composition.author`
from `ownerIdentifier`, `assignmentIdentifier` and the closed `sourceAuthor`
choice below. The application never reads the misleading legacy wire name to
decide authorship.

The SDK accepts bare UUIDs and the governed bare role code here, then
canonicalizes them internally. BFF code must not concatenate `urn:uuid:` or a
coding-system prefix.

For a professional profile the same identity graph has different FHIR
participants: the professional organization is `Composition.author`, while
the registered `PractitionerRole` is `Composition.attester.party`. The
underlying practitioner, authenticated sender, signing key and attester role
remain distinct.

The `enrolledProfile` result is stored by the BFF. The browser must never
receive the activation code, wallet seed, initial access token or private
keys. Subsequent requests begin with Journey 1, not by repeating Journey 0.

## Journey 1 — normal clinical write from the existing profile

The BFF loads the already enrolled profile appropriate to the authenticated
request. It does not accept `Composition.author`, `Composition.attester`, an
assignment UUID or an actor DID from browser JSON.

```ts
const individualControllerProfile =
  await loadBackendIndividualControllerProfile(profileRuntime, {
    ...loadRequest,
    providerDid: indexProviderDid,
  });

const sourceAuthor = contentWasOriginatedOrDictatedByIndividual
  ? ClinicalSourceAuthorSelections.Owner
  : ClinicalSourceAuthorSelections.Creator;

const clinicalCreator = await profileManager.exportClinicalCreatorIps({
  ownerId: profileAccountId,
  profileId: individualControllerProfile.profile.descriptor.profileId,
  sourceAuthor,
});

const write = await individualControllerProfile.sdk.updateClinicalSection(
  indexProviderRouteContext,
  {
    subject: individualDid,
    sender: individualControllerProfile.session.actorDid,
    recipient: indexProviderDid,
    section: selectedSection,
    bundle: sectionChanges,
    clinicalFormat: 'r4',
    clinicalCreator,
  },
);

const readback = await individualControllerProfile.sdk.requestClinicalSummary(
  indexProviderRouteContext,
  {
    subjectId: individualDid,
    requesterId: individualControllerProfile.session.actorDid,
  },
);
```

`ClinicalSourceAuthorSelections.Owner` means the individual originated or
dictated the content: the individual is `Composition.author` and the
registered RelatedPerson remains `Composition.attester.party`.
`ClinicalSourceAuthorSelections.Creator` means the controller/member originated
the content: the registered RelatedPerson is both author and attester. This is
a closed BFF decision derived from the authoritative workflow; it is not a
free-form reference supplied by the UI.

For a complete Composition-first document use `updateClinicalSummary(...)`
instead of `updateClinicalSection(...)`. For an external IPS/FHIR document use
`importIpsOrFhirAndUpdateIndex(...)` and preserve its original author and
attesters. In every case, the authoritative readback—not an accepted async
submission or optimistic UI state—proves persistence.

## Journey 1 inputs shared by all actor types

All normal-write variants start with the same BFF-owned information:

1. `profileAccountId`: the authenticated BFF account that owns the encrypted
   profile record. This is not the owner of the clinical data and is never sent
   to GW.
2. `loadRequest`: the stored profile selection used by the appropriate
   `loadBackend*Profile(...)` function. The portal does not build actor DIDs.
3. `individualDid`: the individual who owns the clinical data and is the FHIR
   subject.
4. `indexProviderDid`: the tenant that hosts the individual's index and is the
   recipient of the operation.
5. `indexProviderRouteContext`: the matching tenant, jurisdiction and sector
   route resolved for that index provider.

The professional organization is not the recipient. It appears only in
professional FHIR provenance as the author of provider-created content.

The public `ProfileLoadRequest` property is named `providerDid`. In this
journey its value must be `indexProviderDid`; the snippet makes that mapping
explicit instead of introducing an ambiguous local variable.

### Journey 1A: professional or employee creates provider content

Load the professional facade with `loadBackendProfessionalProfile(...)`.
Its `session.actorDid` is the operational sender. Obtain the protected creator
export with `exportClinicalCreatorIps(...)`; it supplies:

- the professional organization stable legal URN as `Composition.author`;
- the registered professional `PractitionerRole urn:uuid` as
  `Composition.attester.party`;
- the supporting Organization, Practitioner and PractitionerRole graph.

The individual remains the data owner and subject. The index provider remains
the recipient. The professional actor DID remains transport and audit evidence
and is never substituted for the organization author.

Use `updateClinicalSummary(...)` for a Composition-first multi-section
document. For one section, use `updateClinicalSection(...)` and pass the same
protected `clinicalCreator` export; that helper applies the professional
author/attester provenance without accepting it from browser input.

After the asynchronous write, call `requestClinicalSummary(...)`. Only that
authoritative readback proves which resources and provenance were persisted.

### Journey 1B: individual member or controller creates personal content

Choose the facade that matches the already-authorized profile:

- `loadBackendIndividualControllerProfile(...)` for the controller;
- `loadBackendIndividualMemberProfile(...)` for an accepted member or
  caregiver relationship.

The individual is again the data owner and subject, and the index provider is
again the recipient. No professional organization participates in this
authorship path.

When the controller/member creates the content, its registered
`RelatedPerson urn:uuid` is both `Composition.author` and the personal
`Composition.attester.party`. When it merely records content created or
dictated by the individual, the individual stays author and the RelatedPerson
is the attester. The BFF makes that closed choice with
`ClinicalSourceAuthorSelections.Creator` or
`ClinicalSourceAuthorSelections.Owner`; it never accepts a browser-supplied
FHIR reference.

The sender is always the loaded role-specific `session.actorDid`, not the
RelatedPerson UUID, an email-derived value or a portal alias.

For a telephone-originated section update, the identified individual may be
the content author even when a telephone assistant submitted the message. Keep
the attached section `Bundle.type=batch|collection` outside the definitive
clinical index while `Communication.status=preparation`. An authorized
controller/member may explicitly attest and advance it to `completed`, or
reject it as `not-done`. The telephone identifier proves the matched private
individual account; it is not `actorDid`, `Composition.author` or an attester.

## Import is different from creating an editable copy

An external IPS import preserves the source document's existing
`Composition.author` and attesters. The importer is recorded separately as the
submitter. Do not call `cloneImportedClinicalDocumentForDemo(...)` for a normal
import.

The current public facades expose external IPS/FHIR import only through
`IndividualControllerSdk.importIpsOrFhirAndUpdateIndex(...)`.
`IndividualMemberSdk` and `ProfessionalSdk` may create or update authorized
clinical data, but they do not currently expose that import method. The 101
does not pretend otherwise.

If a demonstration needs a separately editable local version of an imported
document, call `cloneImportedClinicalDocumentForDemo(...)` with the protected
`clinicalCreator` export and then call `updateClinicalSummary(...)`. The helper
creates new logical resource ids and applies the correct local author/attester
graph without modifying the source document.

## Identity map

| Meaning | Professional write | Individual member/controller write |
| --- | --- | --- |
| Clinical data owner and subject | `individualDid` | `individualDid` |
| Operational sender | professional `session.actorDid` | role-specific `session.actorDid` |
| Recipient and storage tenant | `indexProviderDid` | `indexProviderDid` |
| `Composition.author` | professional organization stable legal URN | individual or registered RelatedPerson, according to actual source |
| `Composition.attester.party` | registered PractitionerRole UUID | registered RelatedPerson UUID |
| Local encrypted profile owner | `profileAccountId` | `profileAccountId` |

`profileAccountId` is only a server-side profile-storage key. It is not the
FHIR subject, data owner, recipient, author, attester, DIDComm sender or SMART
actor.

## Related documentation

- [101-SDK_END_TO_END](./101-SDK_END_TO_END.md) contains the wider onboarding,
  authorization, consent, SMART and lifecycle journey. This guide is its
  focused clinical-write subset.
- [101-BFF_CLINICAL_WRITES](./101-BFF_CLINICAL_WRITES.md) explains when to use
  section CRUD, whole-document update or external import.
- [101-MULTI_ACTOR_IPS_EXPORT](./101-MULTI_ACTOR_IPS_EXPORT.md) specifies the
  aggregated FHIR author, attester and supporting-resource graph.
- [101-SDK_INTEGRATION](./101-SDK_INTEGRATION.md) configures the SDK runtime
  before these already-loaded profile journeys begin.

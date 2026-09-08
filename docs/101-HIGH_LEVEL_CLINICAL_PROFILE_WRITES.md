# High-level clinical writes from loaded profiles

This is the canonical copyable subset of
[101-SDK_END_TO_END](./101-SDK_END_TO_END.md) for creating or importing
clinical data after profile enrollment. It shows only public application and
SDK facades. Wallet construction, HTTP clients, DIDComm packaging, queues,
polling routes and ledger configuration deliberately remain outside this 101.

The complete TypeScript snippet is
[high-level-clinical-profile-writes.ts](./snippets/high-level-clinical-profile-writes.ts).

## The common beginning

Both journeys start with the same BFF-owned information:

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

## Flow A: professional or employee creates provider content

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

## Flow B: individual member or controller creates personal content

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

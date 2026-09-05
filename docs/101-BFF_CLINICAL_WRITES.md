# 101: Clinical writes from a Node BFF

This guide shows the public Node SDK boundary for three different operations:

1. create, update or delete resources that all belong to one clinical section;
2. update a complete multi-section clinical document;
3. import an externally authored IPS/FHIR document without changing its
   provenance.

The BFF selects one of these operations. It does not construct the outer
FHIR `Communication`, DIDComm envelope, route or polling request itself.
The BFF also never configures ledger routing. It must not supply a ledger
channel or smart contract; GW resolves both from the authenticated operation's
governed domain context.

The matching gateway-side authorization contract is
[Authenticated clinical authorship](https://github.com/Global-DataCare/gwtemplate-node-ts/blob/main/docs/01-OVERVIEW-AND-GUIDES/101-01.N-AUTHENTICATED-CLINICAL-AUTHOR.md).
Keep both guides synchronized when author, attester or update/delete rules
change.

## Choose the operation first

| Use case | Input | High-level method |
| --- | --- | --- |
| Mutate resources in exactly one section | `Bundle.type=batch|collection`; each entry chooses create, update or delete | `updateClinicalSection(...)` |
| Replace or update one multi-section summary owned by the authenticated actor | `Bundle.type=document`; `Composition` is `entry[0]` | `updateClinicalSummary(...)` |
| Import an external IPS/FHIR document and preserve its source author | `Bundle.type=document`; `Composition` is `entry[0]` | `importIpsOrFhirAndUpdateIndex(...)` |

For a section update, the BFF passes one canonical `section`. The SDK places
that value in the outer `Communication.topic` and attaches the batch or
collection Bundle. The application must not traverse or construct that
Communication itself.

For a document update or import, section membership comes from
`Composition.section[].entry[]`. There is no independent
`Communication.topic` selecting a single section.

## Which authenticated actor may call it?

| Actor facade | Submit create for a registered author | Update/delete existing fact | Document import | Required authority |
| --- | --- | --- | --- | --- |
| `IndividualControllerSdk` | Yes | When its registered assignment is the stored attester or owner policy permits it | Yes | Loaded controller profile for the subject |
| `IndividualMemberSdk` (member/caregiver) | Yes | When its registered `RelatedPerson` is the stored attester | No public import method | Accepted member relationship plus subject Consent and SMART authorization |
| `ProfessionalSdk` (organization employee/professional) | Yes | When its registered `PractitionerRole` is the stored attester or governed successor policy permits it | No public import method | Enrolled employee profile plus subject Consent and SMART authorization |

Relationship, invitation or employee status alone never grants clinical
access. GW evaluates the authenticated actor, subject, Consent, SMART scope and
resource provenance. An authorized caller is recorded as the submitter, not as
an additional author or attester. Repeating somebody else's identifier in a
payload is not proof.

## BFF setup for an individual controller

`IndividualControllerBackendRuntime` is the server-oriented wrapper. Load the
protected profile once and retain the returned opaque profile/session only in
server custody:

```ts
import { IndividualControllerBackendRuntime } from 'gdc-sdk-node-ts';

const individualControllerRuntime =
  new IndividualControllerBackendRuntime(backendProfileRuntime);

const individualControllerProfile =
  await individualControllerRuntime.loadProfile(protectedProfileLoadRequest);
```

The examples below assume that `tenantContext`, `subjectDid`, `providerDid`
and the resource drafts come from the authenticated BFF request and its
authoritative read model.

For locally supplied content, resolve the FHIR provenance from the protected
profile through the manager. A professional uses the stable legal organization
URN as author and its PractitionerRole as attester. A controller/member uses
its RelatedPerson urn:uuid as both author and attester. The browser must not
submit an author reference, attester reference, role assignment or signing key:

```ts
const exportedCreator = await profileManager.exportClinicalCreatorIps({
  ownerId: authenticatedAccountId,
  profileId: selectedProfileId,
});

await loadedProfile.sdk.updateClinicalSection(tenantContext, {
  subject: subjectDid,
  sender: loadedProfile.session.actorDid,
  recipient: providerDid,
  section: selectedSection,
  bundle: sectionBatch,
  clinicalCreator: exportedCreator,
});
```

`ClinicalSourceAuthorSelections.Creator` remains accepted for compatibility but
produces the same author/attester boundary. These are the complete cases:

| Authenticated profile and content source | `Composition.author` | `Composition.attester.party` |
| --- | --- | --- |
| Individual records their own content without a member assignment | Stable individual author | Same reference as personal attester when omitted |
| Controller/caregiver records content for an individual | Registered `RelatedPerson` urn:uuid | The same registered `RelatedPerson` urn:uuid |
| Professional records provider content | Jurisdictional CDS legal organization URN (`urn:cds-<jurisdiction>:v1:organization:...`) | Registered `PractitionerRole` urn:uuid |
| Administrative professional imports an external IPS | Preserved external organization/EHR/portal | Existing attester is preserved; importer is only submitter unless it truly attests |

The projection resolves only the role/relationship already bound to the
authenticated protected profile. It is not an escape hatch for an arbitrary
identifier. DIDComm sender, JWT issuer and signing `kid` remain
technical transport/audit evidence and are not copied into these FHIR fields.

## One section: create, update and delete in one batch

All entries must belong to the same section. Each entry chooses its own FHIR
operation. A batch is not transactional: GW reports an outcome for every entry,
so one denied delete does not turn a successful create into a failure or vice
versa.

```ts
import {
  BundleEditor,
  BundleEditableResourceTypes,
  BundleTypes,
  HealthcareBasicSections,
} from 'gdc-common-utils-ts';

const allergyChanges = new BundleEditor()
  .setBundleType(BundleTypes.batch);

// CREATE -> POST plus a resource body.
allergyChanges
  .newEntryAs(
    BundleEditableResourceTypes.allergyIntolerance,
    newAllergy.resourceId,
  )
  .create()
  .setIdentifier(newAllergy.identifier)
  .setSubject(subjectDid)
  .setCode(newAllergy.code)
  .setCodeTextLocal(newAllergy.localText)
  .setClinicalStatus(newAllergy.clinicalStatus)
  .doneEntry();

// UPDATE -> PUT plus the complete current resource body. Use the resource id
// and version obtained from authoritative readback, not a UI array position.
allergyChanges
  .newEntryAs(
    BundleEditableResourceTypes.allergyIntolerance,
    allergyToUpdate.resourceId,
  )
  .update()
  .ifMatch(allergyToUpdate.versionId)
  .setIdentifier(allergyToUpdate.identifier)
  .setSubject(subjectDid)
  .setCode(allergyToUpdate.code)
  .setCodeTextLocal(allergyToUpdate.newLocalText)
  .setClinicalStatus(allergyToUpdate.clinicalStatus)
  .doneEntry();

// DELETE -> DELETE AllergyIntolerance/{id}, without a resource body.
allergyChanges
  .newEntryAs(
    BundleEditableResourceTypes.allergyIntolerance,
    allergyToDelete.resourceId,
  )
  .delete()
  .ifMatch(allergyToDelete.versionId)
  .doneEntry();

const sectionResult =
  await individualControllerRuntime.updateClinicalSection(
    individualControllerProfile,
    tenantContext,
    {
      subject: subjectDid,
      sender: individualControllerProfile.session.actorDid,
      author: exportedCreator.provenance.authorReference,
      recipient: providerDid,
      section: HealthcareBasicSections.AllergiesAndIntolerances.attributeValue,
      bundle: allergyChanges.buildJsonApi(),
      clinicalFormat: 'r4',
    },
  );
```

Do not treat `sectionResult.poll.status === 200` as proof that every entry
succeeded. Read the returned batch outcomes and show failures per resource.
Then refresh the affected section with `requestClinicalSummary(...)`; that
authoritative readback, not the optimistic local editor, confirms persistence.

The same authored Bundle can be submitted through an already authorized actor
facade:

```ts
await individualMemberProfile.sdk.updateClinicalSection(tenantContext, input);
await professionalProfile.sdk.updateClinicalSection(tenantContext, input);
```

`sender` identifies the transport participant. `author` identifies the source
organization/individual and therefore comes from the protected projection. The
role/relationship remains the attester; do not accept either UUID from browser
JSON:

```ts
const provenance = await profileManager.exportClinicalCreatorIps({
  ownerId: authenticatedAccountId,
  profileId: selectedProfileId,
});

await loadedActorProfile.sdk.updateClinicalSection(tenantContext, {
  ...input,
  sender: loadedActorProfile.session.actorDid,
  author: provenance.provenance.authorReference,
  // Keep provenance.provenance.attesters on the section Bundle claims.
});
```

The member/caregiver or professional must already possess the subject-scoped
authorization described in the actor table above. A different authorized
submitter may transport a create, but cannot obtain provenance by echoing an
identifier and cannot update/delete it unless GW resolves its authenticated
binding to the stored attester or an explicit owner/successor policy.

## Multi-section document owned by the local actor

Use `updateClinicalSummary(...)` when the BFF is authoring a complete document
covering one or several sections. The Bundle must be
`Bundle.type=document`, its `Composition` must be `entry[0]`, and every
`Composition.section[].entry[]` reference must resolve inside the Bundle.

```ts
const document = summaryDocumentEditor.buildDocument();

await individualControllerRuntime.updateClinicalSummary(
  individualControllerProfile,
  tenantContext,
  {
    subject: subjectDid,
    sender: individualControllerProfile.session.actorDid,
    recipient: providerDid,
    bundle: document,
    clinicalFormat: 'r4',
  },
);
```

This is not the operation for independently mutating one allergy, medication
or vital-sign section. Use `updateClinicalSection(...)` for that case.

## Import an externally authored IPS/FHIR document

Use `importIpsOrFhirAndUpdateIndex(...)` for a received document whose original
`Composition.author` is source provenance. Importing it does not make the
controller, member or BFF its author and does not grant them update/delete
authority over the imported facts.

```ts
await individualControllerRuntime.importIpsOrFhirAndUpdateIndex(
  individualControllerProfile,
  tenantContext,
  {
    compositionPayload: externallyAuthoredIpsDocument,
    format: 'r4',
  },
);
```

The imported payload must be a document Bundle with its Composition first and
valid section references. Do not rewrite the external author to the importing
controller. If a demonstration needs editable data, create a separate local
copy with `cloneImportedClinicalDocumentForDemo(...)`; never mutate the source
document in place.

The author organization is resolved from the Bundle's FHIR graph:

- `Composition.author -> Organization`; or
- `Composition.author -> PractitionerRole -> organization`.

That does not make `Composition.attester` another spelling of `author`. For
example, the shared IPS has `Composition.author` and `Composition.custodian`
pointing to its `Organization`, while `Composition.attester.party` points to
the employee's `PractitionerRole`. Its flat claims preserve the same graph:

```ts
import {
  CompositionClaim,
  compositionFhirR4ToFlat,
} from 'gdc-common-utils-ts';

const compositionClaims = compositionFhirR4ToFlat(composition);
compositionClaims[CompositionClaim.Author];       // author reference CSV
compositionClaims[CompositionClaim.Custodian];    // Organization reference
compositionClaims[CompositionClaim.Attester];     // attester.party reference CSV
compositionClaims[CompositionClaim.AttesterMode]; // aligned R4 mode CSV
compositionClaims[CompositionClaim.AttesterTime]; // aligned time CSV
```

Resolve a `PractitionerRole` reference to its linked `Practitioner` and
`Organization` when the application needs employee and employer context. Do
not replace it with the authenticated submitter merely because that caller
transported the Bundle.

A locally issued professional DID already has the canonical shape produced by
`buildProfessionalDidWeb`: organization DID, employee marker, stable multibase
actor component and governed role. The FHIR `PractitionerRole` may retain its
own stable `urn:uuid`; the registered creator binding links that assignment to
the professional DID, organization and role.

A later document may replace an existing fact with the same resource id only
when the resolved author organization is unchanged and `Composition.date` is
strictly later. This is a narrow document-version successor rule. It never
authorizes a delete and does not turn the submitter into an author.

Each projected resource already receives a content-derived `meta.versionId`
(CID/multihash). A successful Communication write returns one transaction id
for the submitted Bundle plus per-resource CID and version evidence. The BFF
may display or persist that receipt after the normal terminal-Bundle success
analysis. It does not choose or expose the underlying ledger route. A local
memory receipt is useful for application tests but is not on-chain evidence;
only a Fabric-backed response proves a committed transaction.

## Evidence and current coverage

The repository currently proves these boundaries at different layers:

| Journey | Current proof |
| --- | --- |
| Typed section batch with create/delete and independent outcomes | Executable Node SDK 101 and focused unit tests |
| Controller section write followed by authoritative `$summary` readback | Consumer Playwright boundary test against a real GW |
| Controller document ingestion and subsequent index read | Live Node SDK E2E |
| Professional SMART read, author-owned CRUD, delegated controller create and denied submitter update/delete | Full-cycle live Node SDK E2E |
| Member/caregiver invitation, narrowed Consent and clinical read | Consumer Playwright journey |
| Member/caregiver clinical write | Public SDK surface; live no-skip aggregate journey is a release gate, not yet substituted by Playwright |
| Per-entry `PUT` update against real GW | Typed editor/unit contract and local GW clinical flow |

Keep the proof label precise: a Playwright test that calls an SDK directly is
SDK-to-GW evidence; it is not automatically proof of a browser UI -> BFF -> SDK
journey.

## Related executable sources

- `tests/101-clinical-resource-authoring.test.mjs`
- `tests/101-live-full-cycle-bff-runtime.e2e.test.mjs`
- `tests/individual-controller-backend-runtime-writes.test.mjs`
- `docs/101-SDK_END_TO_END.md`
- `docs/101-MULTI_ACTOR_IPS_EXPORT.md`
- `gdc-common-utils-ts/docs/101-BUNDLE_EDITOR_READER.md`

# Clinical author, profile attester and subject boundaries

This is the canonical integration contract for clinical writes from an
authenticated Node BFF. Keep four independent concepts separate:

1. `enroll()` registers and protects the wallet/device profile. It does not
   choose clinical authorship.
2. `Composition.author` belongs to the document. Different documents written
   through the same unlocked profile may have different authors.
3. `Composition.attester.party` identifies the authenticated and unlocked
   profile's registered FHIR assignment:
   - individual member/controller: `RelatedPerson`;
   - professional: `PractitionerRole`.
4. `Composition.subject` identifies the human or animal clinical subject. It
   is independent from author, attester, DIDComm sender and data owner.

`actorIdentifier` identifies an authorization actor. It is not another name
for the document author, and historical `authorIdentifier` fields must not be
used to select `Composition.author`.

## Individual organization and technical profile enrollment

The activation code comes directly from
`confirmIndividualOrganizationOrder()`. Do not call `getLicense()` in this
organization-registration flow.

```ts
const registration =
  await individualSdk.registerIndividualOrganization({
    // Individual-organization registration input.
  });

const order =
  await individualSdk.confirmIndividualOrganizationOrder({
    ...tenantContext,
    offerId: registration.offerId,
  });

// Technical profile enrollment only. There is no clinicalCreatorBinding.
await profileSessionManager.enroll({
  ...profileOptions,
  actorKind: ActorKinds.IndividualController,
  actorMode: "controller",
  actorDid: individualControllerDid,
  profileDid: individualControllerDid,
  providerDid: registration.identity.providerDidWeb,
  allowedSubjectDids: [registration.identity.subjectDid],
  activationCode: order.activationCode,
  idToken,
});
```

The BFF stores the registered FHIR assignment together with its own protected
profile descriptor. It never accepts that assignment reference from browser
JSON. Unlocking the profile selects that server-authoritative descriptor.

## One section write

For a section-scoped write, supply the author of this document and the
attester resolved from the unlocked profile as different values:

```ts
await unlockedProfile.sdk.updateClinicalSection(tenantContext, {
  subject: clinicalSubjectDid,
  sender: unlockedProfile.session.actorDid,
  recipient: registration.identity.providerDidWeb,
  section,
  bundle: sectionChanges,

  // The source author of this document. It may change on the next document.
  author: documentAuthorReference,

  // Server-resolved identity of the profile that authenticated and unlocked.
  attesters: [{
    mode: CompositionAttesterModes.Personal,
    party: {
      reference: unlockedProfileAttesterReference, // RelatedPerson
    },
  }],
});
```

The next write may use another `documentAuthorReference` while retaining the
same `unlockedProfileAttesterReference`. The SDK never replaces that explicit
document author with the RelatedPerson.

For a professional profile, the same rule applies with its registered
`PractitionerRole`:

```ts
await unlockedProfessionalProfile.sdk.updateClinicalSection(tenantContext, {
  subject: clinicalSubjectDid,
  sender: unlockedProfessionalProfile.session.actorDid,
  recipient: indexProviderDid,
  section,
  bundle: sectionChanges,
  author: documentAuthorReference,
  attesters: [{
    mode: CompositionAttesterModes.Professional,
    party: {
      reference: unlockedProfileAttesterReference, // PractitionerRole
    },
  }],
});
```

The author may be an organization, professional, individual or another valid
FHIR source for that particular document. Professional authentication does
not force the professional organization to be every document's author.

## Complete document Bundle

For `updateClinicalSummary(...)`, the submitted document Bundle already owns
its provenance:

- preserve `Composition.author` from the source document;
- add or validate the unlocked profile as `Composition.attester.party`;
- preserve the clinical subject independently;
- pass `unlockedProfile.session.actorDid` only as the operational sender.

An imported IPS therefore keeps its external author. Authentication of the
importer or updater does not rewrite that author; the authenticated profile is
represented separately as attester when it actually attests the document.

## Human and animal products

The professional/individual split and the author/attester split do not change
between human-health and animal-health products. Only the governed subject
model and role vocabulary change. Never infer author or attester from whether
the clinical subject is human or animal.

## Identifier summary

| Value | Meaning | May change per document? |
| --- | --- | --- |
| `subject` | Human or animal clinical subject | Yes |
| `author` | Source responsible for this document | Yes |
| `attester.party` | RelatedPerson or PractitionerRole of the unlocked profile | No, while that profile remains selected |
| `sender` | Operational DIDComm actor DID | No, while that session remains active |
| `actorIdentifier` | Authorization/permission actor | Not an authorship field |

The legacy `clinicalCreatorBinding`/`sourceAuthor` model must not be used by
new integrations to bind document authorship during profile enrollment.

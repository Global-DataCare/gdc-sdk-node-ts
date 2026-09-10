---
name: preserve-subject-section-provenance
description: Preserve author, attester, subject and sender boundaries for subject-section writes and later FHIR document projection. Use for Composition-compatible flat claims, updateSubjectSection or updateClinicalSection, individual member/controller RelatedPerson attesters, professional PractitionerRole attesters, actorIdentifier confusion, section create/update/delete examples, confidential indexing, or a future Provenance.agent role migration.
---

# Preserve Subject Section Provenance

## Keep the Current Model

Preserve Composition-compatible flat claims on every section batch or
collection. Confidential storage indexes those claims per resource so the
section can later be materialized as a `Bundle.type=document` containing a
`Composition`.

Do not replace the current claims with `Provenance` until CORE implements and
migrates the corresponding indexed search claims.

Keep these values independent:

- `subject`: human or animal whose information is updated.
- `dataAuthorReference`: FHIR author/source of this specific write.
- `attester`: FHIR assignment bound to the authenticated, unlocked profile.
- `sender`: operational DID transporting the request.
- `section`: functional section, clinical or non-clinical.

Allow `dataAuthorReference` to change on every write while the same unlocked
profile keeps the same `attester`. Never treat `actorIdentifier` as an alias
for either value; it belongs to authorization and Consent identity.

Use `updateSubjectSection(...)` in new application examples. Retain
`updateClinicalSection(...)` only as a compatibility alias unless a separate
breaking migration is explicitly authorized.

## Resolve the Attester from Real Data

For the principal individual controller:

1. Author the individual Organization owner with a stable UUID in
   `Organization.owner.identifier.value`. Email and telephone are only contact
   or notification channels. The SDK accepts that UUID or creates it once for
   a brand-new controller assignment; it never derives creator identity from a
   contact address.
2. Confirm its Order. GW issues the bare `RESPRSN` licence and materializes the
   RelatedPerson assignment with that exact owner identifier in the same
   transition; it never invents another UUID.
3. Pass the typed registration and Order results unchanged to
   `enrollSelfIndividualController(...)`. Portal code must not extract the
   activation code, controller identifier or call `buildProfileAttester(...)`.
4. After a later `unlock(...)` plus `openIndividualController(...)`, obtain the
   document reference with `getAttesterUriForDocs()` only when authoring or
   cloning a document.
5. The opened `IndividualControllerSdk` supplies its protected profile
   attester by default to `updateSubjectSection(...)`; application snippets
   omit it. A standalone facade must provide an explicitly authorized
   assignment and fails closed otherwise.
6. Never ingest, search for or select the principal assignment in portal code.

For an additional member or caregiver, use the actual `RelatedPerson/_search`
directory response and select its intended active row server-side by verified
data. Never substitute the individual resource id, subject DID, actor DID,
profile id, email, telephone or OAuth client id for either assignment.

For a professional:

1. Read the actual Employee creation receipt.
2. Select its contained `PractitionerRole`.
3. Use the returned `PractitionerRole.id` UUID.
4. Canonicalize it as `urn:uuid:<uuid>` with the shared SDK helper.

A personal profile has no `PractitionerRole`; never manufacture one.

Treat `enroll()` as technical profile/wallet/DCR setup. It may protect the
stable profile attester so it is returned after unlock, but it must not choose
or freeze the author of later section writes.

Never mix the self-controller example with additional `IndividualMember`
creation, caregiver selection or document authoring. Document each as a
separate numbered journey with its own inputs and terminal result.

## Resolve the Data Author

Preserve an imported `Composition.author` exactly.

For locally provider-authored data, build the legal-organization author with
`buildOrganizationAuthorizationUrnCds(...)` from the real jurisdiction and
legal identifier.

For personally authored data, use the real stable FHIR reference of the person
or assignment that authored that write. Use the profile RelatedPerson
reference as author only when that RelatedPerson truly authored the data.

Never copy a sample URN or infer the author from the attester or sender.

## Keep Examples Copyable

For every snippet:

- include every import;
- show where every value comes from;
- accept application-owned values as typed inputs;
- obtain SDK-owned values from shown SDK calls;
- use shared builders and fixtures instead of literals;
- include create, update with `ifMatch`, and delete with `ifMatch` and no
  resource body when documenting section mutations;
- show both individual member/controller and professional paths when the guide
  claims to cover both.

Use these canonical sources:

- Node SDK end-to-end:
  `docs/101-SDK_END_TO_END.md`
- Type-checked application snippet:
  `docs/snippets/subject-section-writes.ts`
- Concise SDK explanation:
  `docs/101-CLINICAL_AUTHOR_ATTESTER_BOUNDARIES.md`
- CORE storage/index explanation:
  `docs/01-OVERVIEW-AND-GUIDES/101-01.N-AUTHENTICATED-CLINICAL-AUTHOR.md`

Link to the canonical SDK snippet from CORE. Do not maintain a second,
divergent copy.

## Reserve Future Provenance Work

Treat `Provenance.agent-<code>` search claims, including enterer, performer
and author roles, as a future internal migration. Before exposing them:

1. define canonical shared claim names and participation codes;
2. add claims-first CORE indexing and search behavior;
3. migrate existing Composition-compatible indexed data;
4. preserve document projection and signature verification behavior;
5. update SDK APIs and examples only after the backend path is executable.

Do not mix Smart Health Card, detached-signature, ES384 or PQC work into a
simple section-write change unless explicitly requested.

## Use Precise Wording

In developer-facing explanations, avoid using "contract" as a generic heading
or synonym for the current model. Prefer "current rules", "current model",
"field separation" or "storage/index behavior".

Use "Contract" when referring to the FHIR `Contract` resource, "smart
contract" for ledger code, or "API/schema contract" only when a formal
interface guarantee is actually meant.

## Preserve Release Authorization Continuity

Follow `docs/LOCAL_FIRST_RELEASE_CONTRACT.md`. For npm authorization, make at
most three attempts and keep each command session and browser window alive for
up to five minutes. Do not attempt npm publish until every affected local test
gate is green: unit, integration, local services, real UI and Playwright.

An authorization failure must never stop the test stage. Build an immutable
`npm pack` tarball for provisional local test use, install it `--no-save` on
pushed but unmerged branches, and never commit a `file:`, Git, workspace or
vendored dependency. Resume only the smallest failed gate; do not repeat a green
gate unless its boundary changed or its state is no longer trustworthy.

After publication, install the exact registry version and run only the minimal install/export smoke; do not repeat the green local matrix unless the artifact differs. Missing exact registry publication blocks only consumer merge, image build, local-network, test-network/staging and network promotion.

Use this order: dependency registry publish and verification, consumer exact version pin, package merge, consumer merge, image build and deploy. A gateway must install the exact registry version before image and local-network. A portal may use the tarball only for local-network, then must install the exact registry version before staging.

The first line of every changed test must be the Flow contract comment and require reuse from the versioned domain data package or common-utils with no duplicated literals. Reuse existing types and canonical HL7/FHIR, LOINC, SNOMED CT, ICD-10, WHO ATC and Schema.org vocabulary before inventing anything. Put missing types in the versioned domain data package, common-utils or the other owning shared package first.

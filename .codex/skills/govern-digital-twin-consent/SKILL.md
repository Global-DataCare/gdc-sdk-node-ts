---
name: govern-digital-twin-consent
description: Implement or audit the FHIR Consent, IPS projection, pseudonymous subject, disable and provider-offboarding contracts for Digital Twin flows across GW CORE and gdc-sdk-node-ts. Use for secondary-use permit or deny, HRESCH claims, stable Consent identifiers, individual Communication ingestion, direct digitaltwin Composition routes, twin urn:uuid validation, study-specific consent separation, materialization, purge, 101 docs, tests, SDK releases, or cleanup of erroneous research-index records.
---

# Govern Digital Twin Consent

## Mandatory TDD

Use red-green-refactor TDD for every behavior or flow change. Write and run the smallest executable contract test first; it must fail for the intended reason before implementation begins. Then implement the minimum change and make focused, integration and affected end-to-end tests green. Begin every new or modified test suite with a flow-contract comment. Begin every Playwright or other E2E file with the complete numbered journey and its authorization and persistence invariants. Mocks may isolate units but never replace real boundary proof. Never make a test green by accepting an error, placeholder, pending setup or other incomplete terminal state.

## Read before acting

Read the current files in both repositories:

- GW CORE:
  - `AGENTS.md`
  - `docs/01-OVERVIEW-AND-GUIDES/101-01.I-LIFECYCLE.md`
  - `docs/90.F-UC_CAPABILITY_MATRIX_SEDIA.md`
  - `src/utils/consent-storage.ts`
  - `src/utils/digital-twin-secondary-use.ts`
  - `src/utils/digital-twin-research-projection.ts`
- Node SDK:
  - `docs/101-DIGITAL_TWIN_SDK.md`
  - `tests/101-digital-twin-sdk.test.mjs`
  - `src/digital-twin.ts`
  - `src/resource-operations.ts`
  - `src/orchestration/individual-controller-sdk.ts`

Verify current branches, versions and published npm state before release claims.

## Preserve the application contract

- Accept only the product-level browser choice `{ enabled: boolean }`.
- Resolve the authenticated subject, index-provider organization and enrollment state in the BFF. Never accept them from browser JSON.
- Call `IndividualControllerSdk.setDigitalTwinSecondaryUseConsent(...)` with `decision: 'permit' | 'deny'`.
- Author one FHIR `Consent` through `resource.meta.claims` and `entry.meta.claims`:
  - `Consent.subject`: authenticated operational subject DID
  - `Consent.actor-identifier`: organization/tenant that provides the subject index
  - `Consent.actor-role`: `*`
  - `Consent.purpose`: `HRESCH`
  - `Consent.action`: canonical `ServiceCapability.DigitalTwinReader`
- `Consent.decision`: `permit` or `deny`
- `Consent.source-reference`: stable portal/software/study URL or URI
- Do not add an ODRL attachment to this provider-level secondary-use Consent.
- Do not introduce `researchOrganizationDid` into the patient toggle. Distinguish each portal, software product or study with its own `Consent.source-reference`.

## Resolve the Consent from its application/study reference

- The BFF passes `researchUseReference`, a stable URL or URI identifying its portal, software product or study.
- GW resolves the rule by subject, index provider, HRESCH, DigitalTwinReader and `Consent.source-reference`.
- GW alone assigns and reuses the internal `Consent.identifier`; the BFF never generates, stores, sends or receives it.
- Reusing the same source reference updates one rule. A different source reference creates a separate FHIR Consent.
- Status lookup must include active deny rules; "active" is validity/period state and must not be confused with `decision=permit`.
- Read status through an individual `Communication` carrying
  `Subject/_search` FHIR Parameters for subject, index provider, HRESCH,
  DigitalTwinReader and source reference. Match canonical or contextualized
  FHIR claim keys. Consent is not part of clinical
  `Bundle/_search`, and the individual Subject is not a twin ResearchSubject.

## Keep projection separate from consent

- Ingest the operational IPS through the existing individual `Communication/_batch` flow, normally via `ingestCommunicationAndUpdateIndex(...)`.
- Let GW create or refresh the research projection when consent is `permit`.
- Absence of an explicit permit is disabled; never project by default.
- Create one canonical Composition per IPS document/version with all IPS sections. Never create one Composition per section.
- Assign the twin subject only inside GW from its tenant-private alias as a registered `urn:uuid:<uuid>`.
- Reject operational DIDs, caller-invented UUIDs and unregistered UUIDs on canonical research records.
- Never teach a patient portal to submit an IPS Bundle or canonical Composition to `digitaltwin/.../Composition/_batch`.
- Treat the direct Composition batch only as explicitly scoped adapter/compatibility plumbing for a pre-authorized registered twin; keep it outside the portal 101.

## Preserve MVP discovery and organization authorization

- Use one public search contract for discovery and saved selections:
  `digitaltwin/.../ResearchSubject/_search` with a FHIR `Parameters` body.
- A ResearchSubject is the public twin aggregate. In `org.hl7.fhir.api`, its
  claims-first `meta.claims` may intentionally mix `ResearchSubject.*` and
  `Composition.*`; in strict R4/R5, the translated canonical Composition lives
  in `ResearchSubject.contained[]`. Never emit an ad-hoc
  `ResearchSubject.composition` wire property. The SDK may expose a normalized
  `match.composition` convenience only after decoding either representation.
  Do not expose `Composition/_search` as the app contract.
- `saveSelection(...)` selects a ResearchSubject. Its private persistence may
  use a researcher-owned Composition, but `searchSelections(...)` reopens it
  through the same public `ResearchSubject/_search` route.
- For employee-specific selections, search with `section` plus
  `Composition.meta-tag`; the SDK binds `Composition.author` to the employee
  DID and GW verifies it against the authenticated SMART `sub`.
- The default SMART reader scope is
  `organization/ResearchSubject.rs?subject=*`; the SDK also completes an
  explicitly supplied bare `organization/ResearchSubject.rs` to that form.
- Basic search accepts one or more IPS sections, inclusive `dateFrom`, optional
  inclusive `dateTo`, and non-empty `text`; the SDK omits the end date and lets
  GW resolve current time when the application does not provide one.
- Sections use OR. Text and date use AND on the same clinical resource. The BFF
  never selects a resource type for basic search.
- Derived search text/date/language stays private and is absent from matches
  and materialized resources. Age and host-wide aggregation are post-MVP.
- For a tenant DID created before ResearchSubject became the public aggregate,
  accept its existing read-only digitaltwin Composition `_search` declaration
  as authorization for replacement `ResearchSubject/_search`; do not require
  tenant reactivation or DCR and do not widen mutation authority.
- Same-tenant access uses employee proof. Foreign access also needs a matching
  FHIR Contract VC and provider authorization.
- Recover the full hosted organization DID from both `:employee:` and
  `:member:` actor DIDs. A root `did:web` domain is only an alias/discovery
  identity and must not turn a same-tenant employee into a foreign consumer.
- Emit `provider-authorized-signatory` and `consumer-authorized-signatory`;
  legacy controller labels are read-only aliases.
- Require both verified `contractAgreement` proofs. `RESPRSN` is technical
  control, not legal signing authority without separate verified delegation.

## Preserve lifecycle semantics

- `deny` is reversible disable: pause later synchronization, retain the private alias and freeze published anonymous data.
- A later `permit` reuses the alias and rebuilds from current operational data.
- `purgeDigitalTwinSubjectLink(...)` is provider offboarding only: delete the private operational-subject to twin correspondence, never anonymous research data.
- A later enrollment after purge receives a new twin UUID and cannot reconnect the old projection.
- Administrative cleanup of erroneous direct records must resolve the exact tenant, section, document ids and subject first. Delete only proven erroneous index records; do not represent cleanup as patient purge, and do not claim immutable audit anchors were erased.

## Preserve authored clinical deletion

- For the current direct `updateClinicalSummary(...)` call, set `sender` to
  the operational `ActorSession.actorDid` returned by the role-specific loaded
  profile wrapper (`loadedActorProfile.session.actorDid`), never a stable
  multibase URN or a
  DID/alias owned by the portal. Set `recipient` to the real provider-tenant
  DID inside the host that accommodates that tenant, never the host DID or a
  portal alias. The subject remains the individual DID.
- To edit an imported IPS in a demo, first call
  `cloneImportedClinicalDocumentForDemo(...)` with that same session `actorDid`.
  The helper receives the protected `clinicalCreator` export, gives the copy new
  resource ids and applies stable FHIR provenance. `ActorSession.actorDid`
  remains sender; the helper never rewrites the imported source document.
- Use `Bundle.type = batch`; each entry independently selects `.create()`, `.update()` or `.delete()`. Do not turn this flow into a transaction.
- A typed delete addresses exactly `ResourceType/id`, has no resource body and may carry `.ifMatch(versionId)`.
- For generated clinical data, resolve provenance from the authenticated
  protected profile. A member/controller uses its registered RelatedPerson as
  both author and attester when it creates the content. A professional uses the
  jurisdictional CDS legal-organization URN as author and its PractitionerRole
  as attester. The legacy closed `owner | creator` selection is compatibility
  only.
- Never accept a FHIR author/attester reference from browser JSON. Never place
  email, phone, stable contact hashes, DIDComm sender, DCR client id or signing
  key in these provenance fields.
- Treat an external `Composition.author = urn:*` on an imported IPS as
  provenance, never as controller authority. The local controller/importing
  BFF may import it once but cannot update or delete those source-authored
  facts.
- Never authorize a correction merely because a new payload repeats the same
  external author URN. Require independently verified source provenance. When
  that proof is unavailable, including unsigned demo imports, fail closed and
  keep the imported record locally immutable under its identifier.
- At delete time, authorize the exact subject and creator. Resolve linked verified email/phone login channels from private identity metadata outside the resource, so phone-created and email-created data remain manageable after account linking.
- Remove the exact fact from later operational summaries and the synchronized research projection when enabled. This is neither secondary-use `deny` nor provider-offboarding link purge.
- Keep 101 documentation at application level: actor, subject, hosted
  provider-tenant recipient, typed batch entry, authorization result and
  visible summary behavior, without DIDComm rendering, vault, queue or hashing
  plumbing.
- Never expose ledger routing as an SDK/BFF input or deployment setting. GW
  managers derive the governed channel and canonical contract internally; the
  application sees only the authenticated operation and its returned evidence.

## Keep every artifact aligned

For any contract change, update together:

- manager/utility tests and route integration tests in GW CORE;
- SDK JSDoc and exported types/functions;
- executable `tests/101-digital-twin-sdk.test.mjs` showing that the BFF stores only its stable research-use reference;
- copyable snippets in `docs/101-DIGITAL_TWIN_SDK.md`;
- GW high-level lifecycle and SEDIA capability matrix;
- README public-surface inventory and changelogs;
- this skill in both repository-local copies.
- Cross-link and synchronize `docs/101-BFF_CLINICAL_WRITES.md` with GW CORE
  `docs/01-OVERVIEW-AND-GUIDES/101-01.N-AUTHENTICATED-CLINICAL-AUTHOR.md`.

Search for stale claims before finishing, especially `researchOrganizationDid`, `secondaryUseClaimKey`, ODRL in the provider toggle, operational `Composition.subject`, one Composition per section, and portal calls to direct digitaltwin Composition batch.

## Verification

- Run targeted GW consent, projection and Composition route tests plus typecheck/build/Swagger when the GW contract changes.
- Run SDK build, product-neutrality, typecheck, executable 101 and full tests when the SDK surface changes.
- Confirm branch, commit, push and merge state in each changed repository.
- For npm, verify `npm view <package>@<version>`, `dist.integrity`, `latest`, a clean install and the exported public surface before declaring publication.
- For deployed cleanup or behavior, verify the exact target runtime tuple and
  never infer product identity from a legacy project, cluster or workload name.

## Mandatory release authorization continuity

For any release chain that requires npm authorization, make at most three
attempts and keep each command session and browser window alive for up to five
minutes. Never end the turn or imply continued work while a window is pending.
After all three attempts fail, an immutable `npm pack` tarball may be used only
to prepare a downstream consumer and continue local tests; never commit a
`file:` dependency. The registry dependency must publish and its exact npm
version must be reinstalled and verified before the consumer may publish, merge
to `main`, build an image, or deploy. Final order remains: push the branch,
run `npm publish` from it, verify, merge to `main`, push and delete the branch.

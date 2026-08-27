# Digital Twin 101: Consent, Projection, Search, Tag, and Read

This is the complete server-side application flow shared by the subject BFF
and the research-organization BFF. The subject first permits or denies
secondary use. GW alone creates the pseudonymous projection. A verified
employee can then search, tag and materialize permitted twins.

The executable version of this guide is
[`tests/101-digital-twin-sdk.test.mjs`](../tests/101-digital-twin-sdk.test.mjs).

## 1. Mental model

There are two different `Composition` records:

```text
canonical twin Composition
  Composition.subject = pseudonymous twin subject
  coded, research-safe claims
             |
             | DigitalTwinSdk.saveSelection(...)
             v
researcher working-selection Composition
  Composition.identifier = opaque FHIR logical id
  Composition.subject = the same pseudonymous twin subject
  Composition.author  = verified hosted employee DID (private owner)
  Composition.meta.tag = employee-defined personal system/code markers
```

The working selection does not modify the canonical twin and does not copy its
clinical content. It is a small researcher-owned record used to recover a
workset or another employee-defined classification.
“Workset” is only the application's name for all saved selections carrying the
same tag; it is not a FHIR resource or a new persisted claim.

The subject lifecycle precedes that researcher lifecycle:

```text
current operational IPS
  -> Consent purpose=HRESCH, action=organization/ResearchSubject.rs
     -> decision=permit: enable one registered urn:uuid twin; normal IPS Communications refresh it
     -> decision=deny:   pause synchronization, preserve alias and published twin
```

`deny` is reversible disable, not purge. A later `permit` reuses the private
tenant alias and rebuilds the same twin from current operational data,
including changes made while publication was disabled. The already published
anonymous twin remains frozen while disabled.

`purgeDigitalTwinSubjectLink` is a different provider-lifecycle command. It is
used only when the subject deletes the index service or migrates to another
index provider. It deletes the tenant-private operational-subject ↔ twin UUID
correspondence, never the anonymous twin. A later enrollment creates a new
`urn:uuid`; the old twin remains anonymous and cannot be reconnected or
updated.

## 2. Subject BFF: read and change secondary-use consent

The browser sends only the user's product-level choice, for example
`{ "enabled": false }`. The Next.js BFF resolves the authenticated subject and
its existing index enrollment. Nothing in the browser request identifies a
research organization, selects a FHIR identifier or supplies ODRL.

```ts
import {
  ActorCapabilities,
  ActorKinds,
  HttpRuntimeClient,
  NodeActorSession,
  TransportProfiles,
} from 'gdc-sdk-node-ts';

const runtimeClient = new HttpRuntimeClient({
  baseUrl: process.env.GW_BASE_URL!,
  ctx,
  runtimeVpToken: process.env.GW_RUNTIME_VP_TOKEN,
  transportProfile: TransportProfiles.DidcommPlainJson,
});

const individualController = new NodeActorSession({
  actorKind: ActorKinds.IndividualController,
  actorDid: authenticatedSubjectControllerDid,
  capabilities: [ActorCapabilities.IndividualGenerateDigitalTwin],
}, runtimeClient).asIndividualController();

// Server-only enrollment state. Do not accept these values from request JSON.
const {
  subjectDid,
  indexProviderOrganizationDid,
} = await loadAuthenticatedIndexEnrollment();
// Server configuration owned by this BFF. Use a stable URL/URI for each
// portal, software product or research study.
const researchUseReference = 'https://portal.example.org/research';

const { enabled } = await request.json() as { enabled: boolean };

const current = await individualController.getDigitalTwinSecondaryUseConsentStatus(ctx, {
  subjectDid,
  indexProviderOrganizationDid,
  researchUseReference,
});

// The SDK sends those same values as FHIR Parameters through the auditable
// Communication -> Subject/_search read. GW matches the contextualized Consent
// rule; the browser still sends only { enabled } to this BFF.

const updated = await individualController.setDigitalTwinSecondaryUseConsent(ctx, {
  subjectDid,
  indexProviderOrganizationDid,
  decision: enabled ? 'permit' : 'deny',
  researchUseReference,
});

// Only during account deletion or index-provider migration:
await individualController.purgeDigitalTwinSubjectLink(ctx, { subjectDid });
```

The exact canonical claims authored by that facade are:

```text
@context                = org.hl7.fhir.api
Consent.subject         = authenticated subject DID
Consent.actor-identifier = index-provider organization DID
Consent.actor-role      = *
Consent.source-reference = stable portal/software/study URL or URI
Consent.identifier      = assigned and retained privately by GW
Consent.purpose         = HRESCH
Consent.action          = organization/ResearchSubject.rs
Consent.decision        = permit | deny
```

They are sent in `resource.meta.claims` and `entry.meta.claims` of one FHIR
`Consent`. This index-level setting has no ODRL attachment. The provider
organization identified by `Consent.actor-identifier` is the tenant that owns
and stores the individual's index; it is not a research organization selected
by the browser.

There is no `secondaryUseClaimKey` configuration. `Consent.action` is the
claim key and `ServiceCapability.DigitalTwinReader` supplies its canonical
value.

`researchUseReference` is the only application/study discriminator. Given that
same stable URL or URI, GW finds the existing rule and reuses its internal
`Consent.identifier`; if none exists, GW creates it. The BFF does not generate,
store, send or receive that internal identifier, so existing installations need
no consent-id backfill. A different portal, product or study reference creates
a separate FHIR Consent and never overwrites another use's choice.

The browser still sends only `{ enabled }`. Prefer configuring
`researchUseReference` in the BFF instead of accepting an arbitrary reference
from browser JSON. The authenticated route supplies the subject and index
provider; the tenant remains the source of truth for all these Consent rules.

The product API should expose `permit`/`deny` as a settings change and `purge`
only inside the account/provider offboarding transaction. It must never map a
normal consent toggle to purge.

The BFF must inspect both the top-level submit result and the terminal bundle
entry. Success is an initial `202`, a terminal poll response, and entry status
`201`. It must not report success from the initial HTTP response alone.

## 3. Project from the normal IPS Communication flow

Enabling consent does not make the portal publish a canonical `Composition`.
The portal keeps using its existing clinical outbox and submits the IPS Bundle
through the individual route:

```ts
await individualController.ingestCommunicationAndUpdateIndex(ctx, {
  communicationJob, // existing server-built Communication carrying the IPS Bundle
  clinicalFormat: 'r4',
});
```

This resolves to
`individual/org.hl7.fhir.r4/Communication/_batch`; GW processes the clinical
resources, updates the operational index and, when the FHIR Consent rule is
`permit`, creates or refreshes the pseudonymous digital-twin projection. The
portal must not split the IPS into one `Composition` per section and must not
submit the IPS Bundle to `digitaltwin/.../Composition/_batch`.

The `communicationJob` is server-owned and comes from the same outbox builder
the portal already uses for IPS/FHIR ingestion. The browser supplies the
clinical document to its authenticated BFF; it does not select GW paths or
author the digital-twin `Composition`.

## 4. Projection and subject-identifier invariant

Application code never posts the IPS or a canonical Composition to
`digitaltwin/Composition/_batch`. GW projects current operational data after a
`permit` and assigns `Composition.subject = urn:uuid:<uuid>` from the tenant's
private alias registry.

Syntax alone is insufficient: GW rejects UUID URNs that are not registered for
that tenant. The direct Composition batch accepts only
`@type = Composition:ResearcherWorkingSelection`, with an existing registered
twin subject. The SDK also rejects non-UUID subjects before save or
materialization.

## 5. Current authorization boundary

- A verified employee of the provider organization can currently request
  `organization/ResearchSubject.rs` and use the tenant's digital-twin search.
- This MVP does not require an employee to have a separate researcher role.
- Access from another organization additionally requires the matching
  inter-tenant contract and consent proof in the VP used for SMART issuance.
- That FHIR Contract VC names `provider-authorized-signatory` and
  `consumer-authorized-signatory` and carries a verified `contractAgreement`
  proof from each. A technical controller may present the proof but `RESPRSN`
  alone does not make that controller a legal signatory.
- Research-group membership and finer policies can be added later without
  changing the search/tag/reopen API shown here.

The portal/BFF must authenticate the employee, translate any public card or
portal alias to the canonical hosted employee DID, and create the actor session
with that operational DID. `sameAs` is continuity/discovery data; it is not an
authorization claim. The SDK then retains the returned SMART bearer for
`search`, `saveSelection`, and `materialize`.

## 6. Create the research facade and request SMART access

```ts
import {
  ActorKinds,
  NodeActorSession,
  resolveOperationalActorDid,
  type DigitalTwinWorksetTagInput,
  type RouteContext,
} from 'gdc-sdk-node-ts';
import {
  buildOrganizationDidWeb,
  buildProfessionalDidWeb,
} from 'gdc-common-utils-ts/utils/did';
import {
  stableActorIdentifierFromDidWeb,
} from 'gdc-common-utils-ts/utils/actor-identifier';
import {
  ExampleEmployeeEmails,
  ExampleEmployeeRoles,
} from 'gdc-common-utils-ts/examples';
import {
  DataspaceSectors,
  HealthcareCoreSections,
  HealthcareConsentPurposes,
  ServiceCapability,
} from 'gdc-common-utils-ts/constants';
import { CompositionClaim } from 'gdc-common-utils-ts/models';

// These three values are the route segments configured for this tenant.
const ctx: RouteContext = {
  tenantId: 'acme-id',
  jurisdiction: 'ES',
  sector: DataspaceSectors.HealthCare,
};

const hostedOrganizationDid = buildOrganizationDidWeb({
  hostDidWeb: 'did:web:api.acme.org',
  tenantId: ctx.tenantId,
  jurisdiction: ctx.jurisdiction,
  version: 'v1',
  sector: ctx.sector,
});
const fixtureEmployeeDid = buildProfessionalDidWeb({
  organizationDidWeb: hostedOrganizationDid,
  email: ExampleEmployeeEmails.SharedProfessional,
  role: ExampleEmployeeRoles.Doctor,
});
const employeeDid = fixtureEmployeeDid;

const digitalTwin = new NodeActorSession({
  actorKind: ActorKinds.OrganizationEmployee,
  actorDid: employeeDid,
}, runtimeClient).asDigitalTwin();

await digitalTwin.requestSmartToken({
  idToken,
  vpToken: verifiedEmployeeVp,
  actorDid: employeeDid,
  clientId,
  purpose: HealthcareConsentPurposes.Research,
  scopes: [`${ServiceCapability.DigitalTwinReader}?subject=*`],
  smartTokenKind: 'openid-smart',
});
```

The SDK supplies `?subject=*` by default and also completes an explicitly
passed bare `ServiceCapability.DigitalTwinReader`. GW requires that root query;
the portal does not need to concatenate the SMART scope string itself.

In production, replace the fixture assignment with the portal BFF's issued-card
binding lookup. The callback returns the hosted primary DID and proves the
public card identifier is one of its aliases:

```ts
const employeeDid = await resolveOperationalActorDid(
  publicEmployeeCardDid,
  (did) => employeeCardRegistry.resolveDidDocument(did),
);
```

For a foreign consumer organization, `vpToken` also carries the applicable
contract and consent evidence. Application code should not substitute an
unsigned claim for that evidence.

## 7. Basic search by sections, clinical date and text

```ts
const medicationSection =
  HealthcareCoreSections.HistoryOfMedicationUse.attributeValue;
const resultsSection =
  HealthcareCoreSections.Results.attributeValue;

const result = await digitalTwin.search(ctx, {
  sections: [medicationSection, resultsSection],
  dateFrom: '2026-01-01',
  // dateTo is optional; GW uses its current time when it is absent.
  text: searchTextFromForm,
});

const twinSubjectId =
  result.matches[0][CompositionClaim.Subject];
```

`search(...)` posts a FHIR `Parameters` resource to
`digitaltwin/.../ResearchSubject/_search`. The public result is a
`ResearchSubject`; its `composition` property is the canonical Composition GW
uses internally to index that twin and connect its projected FHIR resources.
There is no separate public `Composition/_search` flow.

The identifier retained in `Composition.subject` for compatibility is the research-safe,
pseudonymous twin identifier. It is not the individual's DID and must not be
replaced with a `Patient` reference. Sections use OR semantics. Text and date
must match the same resource inside one selected section. The portal does not
choose a FHIR resource type: a section may contain several resource families.
GW searches a private derived text/date/language document and never returns
those internal fields. Age filtering is deliberately outside this MVP.

## 8. Save the selected twin with custom tags

```ts
const worksetTag: DigitalTwinWorksetTagInput = {
  system: stableActorIdentifierFromDidWeb(employeeDid),
  code: 'medication-review-april-2026',
};

await digitalTwin.saveSelection(ctx, {
  twinSubjectId,
  section: medicationSection,
  tags: [worksetTag],
});
```

`saveSelection` selects one ResearchSubject. Internally the SDK posts a small,
researcher-owned working-selection `Composition` through
`digitaltwin/org.hl7.fhir.r4/Composition/_batch` and polls its
`_batch-response`. The employee DID cached by the facade becomes
`Composition.author`. It generates one opaque FHIR logical id for the saved
Composition unless a low-level caller supplies `selectionId`. There are no
`Composition.branch` or `Composition.branch-version` claims: worksets are
recovered using standard author/subject/identifier claims plus `meta.tag`.

Tags are deliberately ledger-safe metadata. The SDK accepts only:

- `id` (optional; generated as `Composition.meta.tag[n]`)
- `system`
- `code`
- `version` (optional)

Application code does not send `userSelected`. `saveSelection(...)` is the
professional's explicit save action, so the SDK always persists
`userSelected: true`. Tags inferred automatically from clinical twin data must
use a separate system-owned projection path, which persists
`userSelected: false`; they are not accepted by this workset API.

For a workset tag, the two relevant values have distinct jobs:

- `system` is the employee's existing stable actor URN. The helper extracts
  `urn:multibase:z<hash-of-normalized-email>` from the hosted employee DID, so
  neither the clear email, role, organization nor a DID URL path is stored in
  the tag. The same `system` is reused for every personal workset.
- `code` is the descriptive, machine-safe workset name chosen by the
  professional, such as `medication-review-april-2026` or
  `trial-42-candidates`. It groups all their saved selections for that work.

The exact stored tag is therefore
`urn:multibase:z<employee-email-hash>|medication-review-april-2026`.
Private authorization still comes from the verified `Composition.author` that
GW binds to the SMART `sub`; the stable actor URN is only the employee's tag
namespace. A role change does not rename their worksets because the role is not
part of that URN.

Do not put an email, email hash, subject identifier, clinical observation,
display text, or free-text note in either value. Those data do not belong in a
ledger-safe tag.

## 9. Reopen the saved workset

```ts
const workset = await digitalTwin.searchSelections(ctx, {
  section: medicationSection,
  tag: worksetTag,
});

const savedSelections = workset.matches;
```

`searchSelections` uses the same public `ResearchSubject/_search` route as
normal discovery and converts the tag to the exact
`Composition.meta-tag=system|code` query and binds `Composition.author` to the
current actor session. GW repeats that ownership check from the verified SMART
`sub`, so another employee cannot retrieve the selection by guessing the same
tag. The returned selection still carries the same pseudonymous
ResearchSubject identifier, so the portal can list saved selections without
materializing all clinical data.

This 101 deliberately uses one workset tag only. The employee can create more
codes in the same personal namespace; application code does not invent extra
status or organization vocabularies.

## 10. Materialize only the selected twin

```ts
const selected = savedSelections[0];

const summary = await digitalTwin.materialize(ctx, {
  twinSubjectId: selected[CompositionClaim.Subject],
  sections: [medicationSection],
});
```

Materialization uses the public asynchronous `Communication` transport and
`ResearchSubject/$summary`. The same SMART bearer obtained in step 6 is used
unless an operation explicitly supplies another `accessToken`.

## 11. What this flow is not

- `IndividualControllerSdk.generateDigitalTwinFromSubjectData(...)` is a
  deprecated legacy direct-transfer hook and is intentionally not the
  canonical Node runtime flow. Use `setDigitalTwinSecondaryUseConsent(...)`;
  GW owns projection and alias generation.
- A saved tag is not a FHIR display label and is not free-text annotation.
- Saving a selection does not mutate or duplicate the canonical twin.
- Moving projection/anonymization to DataConv later does not change this SDK
  lifecycle; GW currently exposes the research-safe subject and coded index.

The full developer journey is therefore:

```text
verified employee -> SMART token -> coded search -> save tagged selection
                  -> reopen by tag -> materialize selected twin
```

The executable contract is:

```bash
npm run build
node --test tests/101-digital-twin-sdk.test.mjs tests/digital-twin.test.mjs
```

The 101 test proves the BFF-facing orchestration in memory. A deployed
environment must additionally run the live GW suite with a licensed active
research employee, signed `id_token`/VP evidence and the configured secure
transport profile.

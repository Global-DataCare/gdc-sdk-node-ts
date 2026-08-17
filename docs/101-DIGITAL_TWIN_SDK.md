# DigitalTwinSdk 101: Search, Tag, Reopen, and Read

This is the complete application flow for an organization employee who works
with pseudonymous digital twins. Searching and tagging are one journey: a
result only becomes part of a researcher's durable work when the researcher
saves a tagged working selection.

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
  Composition.meta.tag = organization-defined system/code markers
```

The working selection does not modify the canonical twin and does not copy its
clinical content. It is a small researcher-owned record used to recover a
workset, status, cohort, score, or another organization-defined classification.
“Workset” is only the application's name for all saved selections carrying the
same tag; it is not a FHIR resource or a new persisted claim.

## 2. Current authorization boundary

- A verified employee of the provider organization can currently request
  `organization/ResearchSubject.rs` and use the tenant's digital-twin search.
- This MVP does not require an employee to have a separate researcher role.
- Access from another organization additionally requires the matching
  inter-tenant contract and consent proof in the VP used for SMART issuance.
- Research-group membership and finer policies can be added later without
  changing the search/tag/reopen API shown here.

The portal/BFF must authenticate the employee, translate any public card or
portal alias to the canonical hosted employee DID, and create the actor session
with that operational DID. `sameAs` is continuity/discovery data; it is not an
authorization claim. The SDK then retains the returned SMART bearer for
`search`, `saveSelection`, and `materialize`.

## 3. Create the research facade and request SMART access

```ts
import {
  ActorKinds,
  buildDigitalTwinWorksetTagSystem,
  DigitalTwinSearchParameter,
  NodeActorSession,
  resolveOperationalActorDid,
  type DigitalTwinResearchTag,
  type RouteContext,
} from 'gdc-sdk-node-ts';
import {
  buildOrganizationDidWeb,
  buildProfessionalDidWeb,
} from 'gdc-common-utils-ts/utils/did';
import {
  EXAMPLE_MEDICATION_STATEMENT_CODE,
  ExampleEmployeeEmails,
  ExampleEmployeeRoles,
} from 'gdc-common-utils-ts/examples';
import {
  DataspaceSectors,
  HealthcareCoreSections,
  HealthcareConsentPurposes,
  ServiceCapability,
} from 'gdc-common-utils-ts/constants';
import {
  CompositionClaim,
  MedicationStatementClaim,
} from 'gdc-common-utils-ts/models';

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
  scopes: [ServiceCapability.DigitalTwinReader],
  smartTokenKind: 'openid-smart',
});
```

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

## 4. Search with coded research claims

```ts
const medicationSection =
  HealthcareCoreSections.HistoryOfMedicationUse.attributeValue;
const medicationCode = EXAMPLE_MEDICATION_STATEMENT_CODE;

const result = await digitalTwin.search(ctx, {
  filters: {
    [DigitalTwinSearchParameter.Section]: medicationSection,
    [MedicationStatementClaim.Code]: medicationCode,
  },
});

const twinSubjectId =
  result.matches[0][CompositionClaim.Subject];
```

The identifier returned in `Composition.subject` is the research-safe,
pseudonymous twin identifier. It is not the individual's DID and must not be
replaced with a `Patient` reference. Search uses codes because display and free
text are removed from the research projection.

## 5. Save the selected twin with custom tags

```ts
const worksetTag: DigitalTwinResearchTag = {
  system: buildDigitalTwinWorksetTagSystem(hostedOrganizationDid),
  code: 'medication-review-april-2026',
  userSelected: true,
};

await digitalTwin.saveSelection(ctx, {
  twinSubjectId,
  section: medicationSection,
  tags: [worksetTag],
});
```

`saveSelection` posts a new working-selection `Composition` through
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
- `userSelected` (optional)

For a workset tag, the two relevant values have distinct jobs:

- `system` is the stable organization-owned vocabulary URI. Do not invent it
  per employee or per workset. `buildDigitalTwinWorksetTagSystem(...)` derives
  it from the hosted organization DID.
- `code` is the descriptive, machine-safe workset name chosen by the
  professional, such as `medication-review-april-2026` or
  `trial-42-candidates`. It groups all their saved selections for that work.

The exact stored tag is therefore
`did:web:api.acme.org:.../fhir/CodeSystem/digital-twin-workset|medication-review-april-2026`.
The organization namespace does not make the workset shared: private ownership
comes exclusively from the verified `Composition.author` that GW binds to the
SMART `sub`. Two employees may use the same code and still retrieve only their
own selections.

Do not put an email, email hash, subject identifier, clinical observation,
display text, or free-text note in either value. Those data do not belong in a
ledger-safe tag.

## 6. Reopen the saved workset

```ts
const workset = await digitalTwin.searchSelections(ctx, {
  section: medicationSection,
  tag: worksetTag,
});

const savedSelections = workset.matches;
```

`searchSelections` converts the tag to the exact
`Composition.meta-tag=system|code` query and binds `Composition.author` to the
current actor session. GW repeats that ownership check from the verified SMART
`sub`, so another employee cannot retrieve the selection by guessing the same
tag. The returned selection still carries the same pseudonymous
`Composition.subject`, so the portal can list saved selections without
materializing all clinical data.

This 101 deliberately uses one workset tag only. Status, cohort, scoring, and
other classifications require separately defined organization vocabularies;
they are not implicit parts of the workset contract and should not be invented
inside application code.

## 7. Materialize only the selected twin

```ts
const selected = savedSelections[0];

const summary = await digitalTwin.materialize(ctx, {
  twinSubjectId: selected[CompositionClaim.Subject],
  sections: [medicationSection],
});
```

Materialization uses the public asynchronous `Communication` transport and
`ResearchSubject/$summary`. The same SMART bearer obtained in step 3 is used
unless an operation explicitly supplies another `accessToken`.

## 8. What this flow is not

- `IndividualControllerSdk.generateDigitalTwinFromSubjectData(...)` is an
  explicit generation/transfer operation. It is not the normal researcher
  search or working-selection API.
- A saved tag is not a FHIR display label and is not free-text annotation.
- Saving a selection does not mutate or duplicate the canonical twin.
- Moving projection/anonymization to DataConv later does not change this SDK
  lifecycle; GW currently exposes the research-safe subject and coded index.

The full developer journey is therefore:

```text
verified employee -> SMART token -> coded search -> save tagged selection
                  -> reopen by tag -> materialize selected twin
```

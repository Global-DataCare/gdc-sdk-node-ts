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
  Composition.subject = the same pseudonymous twin subject
  Composition.author  = verified hosted employee DID (private owner)
  Composition.branch  = stable hash(twin + employee)
  Composition.branch-version = one generated version
  Composition.meta.tag = organization-defined system/code markers
```

The working selection does not modify the canonical twin and does not copy its
clinical content. It is a small researcher-owned branch used to recover a
workset, status, cohort, score, or another organization-defined classification.

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
  NodeActorSession,
  resolveOperationalActorDid,
} from 'gdc-sdk-node-ts';
import {
  buildOrganizationDidWeb,
  buildProfessionalDidWeb,
} from 'gdc-common-utils-ts/utils/did';
import {
  EXAMPLE_HOST_PUBLIC_HOSTNAME,
  EXAMPLE_ROUTE_VERSION,
  EXAMPLE_TENANT_ROUTE_CONTEXT,
  ExampleEmployeeEmails,
  ExampleEmployeeRoles,
} from 'gdc-common-utils-ts/examples';

const ctx = EXAMPLE_TENANT_ROUTE_CONTEXT;

const hostedOrganizationDid = buildOrganizationDidWeb({
  hostDidWeb: `did:web:${EXAMPLE_HOST_PUBLIC_HOSTNAME}`,
  tenantId: ctx.tenantId,
  jurisdiction: ctx.jurisdiction,
  version: EXAMPLE_ROUTE_VERSION,
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
  purpose: 'RESEARCH',
  scopes: ['organization/ResearchSubject.rs?subject=*'],
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
const medicationSection = 'LOINC|10160-0';
const medicationCode = 'http://snomed.info/sct|108575001';

const result = await digitalTwin.search(ctx, {
  filters: {
    section: medicationSection,
    'MedicationStatement.code': medicationCode,
  },
});

const twinSubjectId =
  result.matches[0]['Composition.subject'];
```

The identifier returned in `Composition.subject` is the research-safe,
pseudonymous twin identifier. It is not the individual's DID and must not be
replaced with a `Patient` reference. Search uses codes because display and free
text are removed from the research projection.

## 5. Save the selected twin with custom tags

```ts
const worksetTag = {
  system: 'urn:acme:research:workset',
  code: 'study-2026-04',
  userSelected: true,
};

await digitalTwin.saveSelection(ctx, {
  twinSubjectId,
  section: medicationSection,
  tags: [
    worksetTag,
    {
      system: 'urn:acme:research:status',
      code: 'to-review',
    },
  ],
});
```

`saveSelection` posts a new working-selection `Composition` through
`digitaltwin/org.hl7.fhir.r4/Composition/_batch` and polls its
`_batch-response`. The employee DID cached by the facade becomes
`Composition.author`. By default the SDK derives one stable, opaque branch ID
from the twin subject plus employee DID and appends a new version UUID on every
save. Neither identifier appears in clear inside the branch ID. Low-level
callers can provide `branchId` and `versionId`; `compositionId` remains only as
a deprecated compatibility override.

Tags are deliberately ledger-safe metadata. The SDK accepts only:

- `id` (optional; generated as `Composition.meta.tag[n]`)
- `system`
- `code`
- `version` (optional)
- `userSelected` (optional)

Use an organization-owned, stable coding system. Do not place names, notes,
display text, individual identifiers, or clinical observations in a tag.
These tags describe the researcher's work, not the patient's clinical state.

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
`sub`, so another employee cannot retrieve the branch by guessing the same
tag. The returned branch still carries the same pseudonymous
`Composition.subject`, so the portal can list saved selections without
materializing all clinical data.

Different tag systems may coexist, for example:

- `urn:acme:research:workset | study-2026-04`
- `urn:acme:research:status | reviewed`
- `urn:acme:research:cohort | medication-a`

## 7. Materialize only the selected twin

```ts
const selected = savedSelections[0];

const summary = await digitalTwin.materialize(ctx, {
  twinSubjectId: selected['Composition.subject'],
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

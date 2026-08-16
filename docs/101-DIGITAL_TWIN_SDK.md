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
  Composition.author  = verified employee DID
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

The portal/BFF must authenticate the employee and create the actor session.
The SDK then retains the returned SMART bearer for `search`, `saveSelection`,
and `materialize`.

## 3. Create the research facade and request SMART access

```ts
import { ActorKinds, NodeActorSession } from 'gdc-sdk-node-ts';

const ctx = {
  tenantId: 'acme-id',
  jurisdiction: 'ES',
  sector: 'health-care',
};

const employeeDid =
  'did:web:api.acme.org:employee:researcher-1:ISCO-08|2211';

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
  result.poll.body.data[0].resource.data[0]['Composition.subject'];
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
`_batch-response`. Unless `compositionId` is supplied, each save creates a new
URN. The employee DID cached by the facade becomes `Composition.author`.

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
const workset = await digitalTwin.search(ctx, {
  filters: {
    section: medicationSection,
    'Composition.meta-tag':
      `${worksetTag.system}|${worksetTag.code}`,
  },
});

const savedSelections =
  workset.poll.body.data[0].resource.data;
```

`Composition.meta-tag` is an exact `system|code` match. The returned branch
still carries the same pseudonymous `Composition.subject`, so the portal can
list saved selections without materializing all clinical data.

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

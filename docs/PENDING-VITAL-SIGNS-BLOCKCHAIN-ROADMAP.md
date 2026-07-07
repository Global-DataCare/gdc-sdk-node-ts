# Pending Vital Signs And Blockchain Roadmap

> Status: draft roadmap for the next implementation slice

This document records the pending work around clinical measurement batches,
ledger certification, Swagger coverage, and test coverage across:

- `gwtemplate-node-ts`
- `gdc-common-utils-ts`
- `gdc-sdk-core-ts`
- `gdc-sdk-node-ts`
- `gdc-sdk-front-ts`

It is intentionally separate from the current runtime docs because the desired
flow is not fully implemented yet.

## 1. What is already current

Current GW CORE behavior separates two real contracts:

1. `Communication/_batch`
   - updates the individual/subject index
   - carries clinical bundles or other auditable exchanged payloads
   - is the canonical runtime path for the current index-update story
2. `blockchain/org.hl7.fhir.api/Bundle/_seal`
   - certifies a bundle on-ledger
   - does not implicitly update the individual's index
   - is the ledger-side certification path, not the same thing as index ingestion

That split is already documented in GW architecture and integrator notes.

## 2. What is still pending

The next slice is a dedicated clinical measurement-batch path for vital signs.

The intended behavior is:

- a smartwatch, device, professional, or individual can add measurements into a
  vital-signs bundle
- the bundle updates the individual's index when the system decides it is
  meaningful
- the bundle does not automatically register on blockchain on every write
- ledger certification can happen later, by policy or by explicit user/professional decision
- the measurement bundle hash/CID, not every single sample, is the meaningful
  certification unit

This is the key design point:

- document-style bundles belong to the Communication/document flow
- high-frequency vital-sign batches belong to a dedicated measurement-batch flow
- the batch can later be referenced in Communication if the user or professional
  wants to publish or share it
- that Communication reference should not force automatic blockchain registration

### 2.1 Telephone assistant day-batch workflow

This is the practical flow for the phone assistant use case:

1. open or create the subject's current day batch for vital signs
2. append each new `Observation` that the caller provides
3. keep the daily batch keyed by date so repeated calls land in the same day
4. use that batch as the index/search target for the individual
5. only certify the whole batch later if policy or the user/professional decides

Ownership rule for multi-caregiver shifts:

- one caregiver, professional, or device may own one daily batch for the same
  individual
- another caregiver on a different shift may create a different batch for the
  same individual and same date if that is the operational model
- the bundle id is therefore scoped by subject + day + actor/role ownership,
  not by subject alone
- if no batch exists for that actor/day combination, create a new UUID-backed
  batch id and start a fresh batch
- if a batch exists, recover its id first and append to that existing bundle

Practical retrieval rule:

- first search for the day batch that belongs to the current actor and subject
- if the search returns no entry, create a new UUID for the batch and persist it
- do not force all caregivers into one shared mutable bundle unless the product
  explicitly wants a single shared day log

Important implementation note:

- the current shared model already has a `createdAtTimestamp` on the job side
- the bundle helper/reader path today is still entry-date driven, not bundle-
  patch driven
- there is no `_patch` route for these bundle batches yet
- the current usable path is to reopen/select the existing daily batch, append
  the new observation entry, and resubmit the full batch or hand it to the next
  indexing step

So for now the assistant should not think in terms of partial bundle patching.
Think in terms of:

- locate today's batch by date
- append the new vital-sign observation(s)
- persist the updated batch
- optionally send a later Communication containing the batch or its id
- optionally seal the batch later if policy requires ledger certification

## 3. Proposed endpoint split

The proposed route family is:

- `POST /cds-<jurisdiction>/v1/<sector>/individual/org.hl7.fhir.<release>/Bundle/_batch`
  - intended for vital-signs batch ingestion into the individual's index
  - should not auto-seal to blockchain
  - should accept bundles created by an individual, a professional, or a trusted device
- `POST /cds-<jurisdiction>/v1/<sector>/blockchain/org.hl7.fhir.<release>/Bundle/_seal`
  - intended for ledger-only certification of an already prepared bundle
  - should not mutate the individual's index

If a future `individual/.../Bundle/_seal` route is ever exposed, it should keep
the same ledger-only contract as the blockchain route and still avoid index
mutation.

## 4. Endpoint And Use-Case Matrix

This matrix is the short version new readers should keep in mind.

| Scenario | Payload shape | Primary endpoint | Index update | Automatic blockchain seal | Communication wrapper | LOINC / section signal | Notes |
|---|---|---|---|---|---|---|---|
| Clinical document communication | `Bundle type="document"` with `Composition` first | `individual/.../Communication/_batch` | Yes | No, not automatically | Yes | `Composition.section` | Main clinical document path; this is the current reading/indexing story. |
| Vital signs measurement batch | `Bundle type="batch"` with `Observation` entries | `individual/.../Bundle/_batch` | Yes | No, not automatically | Optional later | `HealthcareBasicSections.VitalSigns` or equivalent LOINC section | High-frequency measurements are accumulated as a batch first; do not seal every sample. |
| Vital signs communication with batch bundle | `Communication` carrying a batch bundle or batch id | `individual/.../Communication/_batch` | Yes | No, not automatically | Yes | Vital-signs LOINC section in the Communication topic / claims | Wrapper for sharing or indexing a batch; keep the batch hash separate from the wrapper. |
| Consent batch bundle | `Bundle type="batch"` with consent resources | `individual/.../Communication/_batch` or the consent manager route when defined | Yes, when the consent manager indexes it | No, not automatically | Optional | Consent-related section / purpose codes | This repo still needs the final consent-specific contract to be documented and tested. |
| Blockchain certification only | `Bundle type="batch"` or equivalent artifact bundle | `blockchain/.../Bundle/_seal` | No | Yes, by policy | No | N/A | Ledger-side certification only; does not mutate the individual's index. |

Reading rule:

- if the bundle is a clinical document, think `Composition` first and use
  Communication as the wrapper/index path
- if the bundle is a high-frequency measurement set, think `Observation`
  batch first and keep blockchain optional until policy says otherwise
- if the payload is only being certified, think `_seal`
- do not mix the wrapper, the batch payload, and the ledger certification step
  into one mental model
- for the phone assistant, the daily batch is found by date, not by patching a
  single observation into a sealed bundle

## 4. Required implementation work by repo

### `gwtemplate-node-ts`

Pending backend work:

- add the measurement-batch route and manager logic for the individual side
- keep `Communication` ingestion as the current index-update path for document
  bundles
- keep `_seal` as a separate certification route
- add Swagger/OpenAPI entries for the new route family
- add route/manager tests that prove:
  - index update happens for the measurement batch route
  - blockchain certification does not happen automatically
  - `_seal` stays ledger-only

Suggested test layers:

- unit tests for the manager and route normalization
- integration tests for the HTTP contract and response bundles
- live E2E for the route in a real GW deployment

### `gdc-common-utils-ts`

Pending shared work:

- add or extend a vital-sign batch helper/editor so callers can build a batch
  bundle without hand-shaping raw claims
- keep `BundleEditor` / `VitalSignEntryEditor` as the authoring surface for the
  atomic measurements
- add reader helpers if the batch needs to be reopened and appended later
- add tests for:
  - positive batch creation
  - validation of missing or invalid measurement fields
  - compatibility of batch reopening/appending if that path is supported

### `gdc-sdk-core-ts`

Pending shared facade work:

- define the canonical facade method names for the measurement-batch flow
- keep the claim vocabulary aligned with the shared helper surface
- add tests that prove the facade surface exposes the intended batch flow

### `gdc-sdk-node-ts`

Pending runtime work:

- expose the new measurement-batch submit/poll method on the Node runtime
- keep the current Communication flow unchanged for document bundles
- add Node runtime tests for the new route helper and the public facade
- add live E2E coverage for the batch lifecycle when GW supports it

### `gdc-sdk-front-ts`

Pending frontend/runtime work:

- expose the same batch creation and submit surface from the front facade
- keep the UI flow separate from the document/Communication flow
- add client-side tests that prove a batch can be created without forcing a
  blockchain seal step

## 5. Acceptance criteria

The roadmap is ready when the following is true:

1. a vital-signs bundle can be created and updated as a dedicated measurement
   batch
2. that batch updates the individual's index without automatic blockchain
   registration
3. `_seal` can certify the bundle later, when policy or the operator decides
4. Communication-based document bundles continue to work as they do today
5. Swagger, unit tests, integration tests, and live E2E examples all describe
   the same split contract

## 6. Notes for docs and examples

- do not teach every confidential-storage write as if it were a blockchain
  certificate
- do not teach every vital sign as if it must be sealed immediately
- do not mix document-style Communication ingestion with the measurement-batch
  route
- when an example needs a later certification step, show the bundle id or batch
  hash/CID explicitly and keep the index-update step separate

## 7. Related docs

- [101-SDK_END_TO_END.md](./101-SDK_END_TO_END.md)
- [101-PROFILE-ORCHESTRATION.md](./101-PROFILE-ORCHESTRATION.md)
- [gdc-common-utils-ts/docs/101-COMMUNICATION_LAYERING.md](../../gdc-common-utils-ts/docs/101-COMMUNICATION_LAYERING.md)
- [gdc-common-utils-ts/docs/101-VITAL_SIGN_ENTRY_EDITOR.md](../../gdc-common-utils-ts/docs/101-VITAL_SIGN_ENTRY_EDITOR.md)
- [NEXT_STEPS.md](./NEXT_STEPS.md)
- [gwtemplate-node-ts/docs/90.A-API_INTEGRATORS_GUIDE.md](../../gwtemplate-node-ts/docs/90.A-API_INTEGRATORS_GUIDE.md)
- [gwtemplate-node-ts/docs/01-OVERVIEW-AND-GUIDES/01.A-ARCHITECTURE-OVERVIEW.md](../../gwtemplate-node-ts/docs/01-OVERVIEW-AND-GUIDES/01.A-ARCHITECTURE-OVERVIEW.md)

## 8. Immediate Execution Order

If you want to start now, do it in this order:

1. `gdc-common-utils-ts`
   - add the shared vital-sign batch reader/helper surface that can reopen or
     create a day batch by subject + actor + date
   - add tests proving date-based lookup, UUID fallback when missing, and
     append-to-existing-batch behavior
2. `gdc-sdk-core-ts`
   - expose the canonical facade names for the batch flow
   - keep the batch/document/ledger contract wording aligned with the shared
     helper surface
3. `gdc-sdk-node-ts`
   - wire the Node runtime method that calls the shared batch helper
   - add route/helper tests for the new submit/poll path
   - add the phone-assistant 101 example that creates/reuses one day batch per
     actor
4. `gwtemplate-node-ts`
   - add the actual individual-side measurement-batch route and manager
   - keep `_seal` ledger-only
   - keep Communication as the index-updating document path
   - add unit + integration tests for batch append, index update, and no-auto-
     seal
5. `gdc-sdk-front-ts`
   - expose the same batch creation and submit surface to the frontend
   - add the client-side vital-sign capture example

First concrete coding slice:

- implement the shared day-batch lookup/create helper in `gdc-common-utils-ts`
- use `createdAtTimestamp` only as a job/workflow timestamp, not as a hidden
  patch mechanism
- make the helper return either the existing actor-owned batch id or a freshly
  generated UUID-backed batch id when nothing exists for that day

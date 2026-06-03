# TEST_CORE - gdc-sdk-node-ts

Purpose: define exactly what the new converged Node runtime already proves live against the GlobalDataCare GW core profile.

This file is the canonical summary to justify the core-memory baseline from the new Node runtime side.

Important transition note:
- this package already owns the actor-scoped session/facade model
- the live E2E now runs without `dataspace-client-sdk-node`
- transport/runtime seam for this suite is now owned by `gdc-sdk-node-ts` (`GdcNodeHttpClient`)

## Scope

This suite validates:
- actor-scoped Node sessions/facades against a real GW core
- host onboarding through the new runtime facade
- organization controller employee creation
- individual controller start/order/consent/token flow
- Communication ingestion and indexed `DocumentReference` retrieval through the new runtime facade
- IPS ingestion of two medication bundles and later indexed retrieval of both `MedicationStatement` rows

It does not yet validate:
- RelatedPerson parity with the legacy `4/4` suite
- full bearer-shape parity coverage
- full secure-script parity moved into this package

## Command

Before running the live suite, use:

- [docs/101-LIVE_GW_LOCAL.md](./docs/101-LIVE_GW_LOCAL.md)

Local GW default:

```bash
npm run test:e2e:live-gw
```

Local GW with IPS ingestion branch and debug artifacts:

```bash
BASE_URL=http://127.0.0.1:3000 \
RUN_LIVE_GW_E2E_IPS_INGESTION=1 \
LIVE_GW_NODE_E2E_DEBUG=1 \
npm run test:e2e:live-gw
```

Docker-exposed GW override:

```bash
BASE_URL=http://127.0.0.1:8000 \
RUN_LIVE_GW_E2E_IPS_INGESTION=1 \
LIVE_GW_NODE_E2E_DEBUG=1 \
npm run test:e2e:live-gw
```

## Coverage Table

| Layer | Live test / assertion | What it proves in GW core | New runtime surface involved | Evidence artifact |
| --- | --- | --- | --- | --- |
| Host onboarding facade | `LIVE actor-scoped node runtime chain on GW` | The new `host_onboarding` actor facade can activate an organization against real GW core | `GdcNodeActorSession(...).asHostOnboarding().activateOrganizationInGatewayFromIcaProof(...)` | `test-results/live-gw-node-runtime-debug-*.jsonl`, `test-results/live-gw-http-trace-*.jsonl` |
| Organization controller facade | `LIVE actor-scoped node runtime chain on GW` | The new `organization_controller` facade can create the controller employee through real GW core | `asOrganizationController().createOrganizationEmployee(...)` | same run artifacts |
| Individual/family start | `LIVE actor-scoped node runtime chain on GW` | The new `individual_controller` facade can start individual organization registration against core routes | `asIndividualController().startIndividualOrganizationSimple(...)` | same run artifacts |
| Individual/family order confirmation | `LIVE actor-scoped node runtime chain on GW` | The new `individual_controller` facade can confirm the core order path | `asIndividualController().confirmIndividualOrganizationOrderSimple(...)` | same run artifacts |
| Consent grant | `LIVE actor-scoped node runtime chain on GW` | The new `individual_controller` facade can grant subject access to a professional under the core consent path | `asIndividualController().grantProfessionalAccessSimple(...)` | same run artifacts |
| SMART token | `LIVE actor-scoped node runtime chain on GW` | The new actor-scoped runtime can request the core SMART token successfully | `asIndividualController().requestSmartTokenSimple(...)` | same run artifacts |
| Communication ingestion | `LIVE communication ingestion through individual controller facade persists DocumentReference baseline` | The new `individual_controller` facade can ingest Communication through the canonical core route | `asIndividualController().ingestCommunicationAndUpdateIndex(...)` | same run artifacts |
| Indexed retrieval | `LIVE communication ingestion through individual controller facade persists DocumentReference baseline` | The new runtime can verify that GW indexed `DocumentReference` entries are later searchable and CID-backed | `runtimeClient.submitAndPoll(...)` through the actor-scoped flow | same run artifacts |
| IPS medications ingestion | `LIVE communication ingestion indexes two medication statements from two bundles` | The new runtime can ingest two separate IPS bundles and project both medication statements into the subject index | `asIndividualController().ingestCommunicationAndUpdateIndex(...)` | same run artifacts |
| IPS medications retrieval | `LIVE communication ingestion indexes two medication statements from two bundles` | The new runtime can read back both indexed medications with structured dosage/timing/PRN claims | `runtimeClient.searchClinicalBundle(...)` | same run artifacts |
| IPS consolidated bundle retrieval | `LIVE communication ingestion indexes two medication statements from two bundles` | The new runtime can request the subject IPS as `Bundle/_search` filtered by `composition.subject + composition.type` and validate the consolidated bundle document returned by GW | `submitAndPoll(... individualBundleSearchPath/_response ...)` | same run artifacts |

## Why this matters for the core-memory baseline

This suite proves that the new runtime architecture is not only unit-tested but already interoperable with the real GW core profile.

That matters because the migration is architectural, not only cosmetic:
- actor-scoped sessions
- actor-specific facades
- converged runtime contracts
- preserved core flow behavior against the real gateway

## Relationship to other docs

- GW-side canonical flow: `../gwtemplate-node-ts/docs/API_CORE_INTEGRATION.md`
- Current package overview: `README.md`
- Local live command reference: `docs/101-LIVE_GW_LOCAL.md`

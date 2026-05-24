# gdc-sdk-node-ts

Target Node runtime package for the converged GDC SDK family.

Key docs:

- [CHANGELOG.md](CHANGELOG.md)
- [SECURITY.md](SECURITY.md)
- [TEST_CORE.md](TEST_CORE.md)
- [SDK_INTEGRATION_101.md](SDK_INTEGRATION_101.md)

Current status:

- package created
- build/test baseline created
- migration target from `dataspace-client-sdk-node` completed for live runtime path
- runtime contract skeleton declared
- actor-scoped node session bridge implemented
- first actor-scoped orchestration facades implemented on top of `GdcNodeRuntimeClient`
- shared async submit/poll helpers implemented for converged Node orchestration
- live GW E2E migrated here with `gdc-sdk-node-ts` runtime client only, with JSONL debug/HTTP trace artifacts under `test-results/`

Not migrated yet:

- full wallet/runtime adapter parity from legacy package
- secure E2E script parity in this package
- full live use-case parity matrix vs legacy suite

Live validation:

- `npm run test:e2e:live-gw`
- core coverage summary for memory/thesis justification: `TEST_CORE.md`
- optional:
  - `BASE_URL=http://127.0.0.1:8000`
  - `RUN_LIVE_GW_E2E_IPS_INGESTION=1`
  - `LIVE_GW_NODE_E2E_DEBUG=1`
- artifacts:
  - `test-results/live-gw-node-runtime-debug-*.jsonl`
  - `test-results/live-gw-http-trace-*.jsonl`

Runtime migration note:

- the live E2E in this package no longer imports `dataspace-client-sdk-node`
- actor-scoped facades now run on the in-package `GdcNodeHttpClient`
- remaining migration scope is parity hardening, not runtime ownership
- this package now consumes the published `gdc-common-utils-ts` `^1.4.22` line; the sibling checkout is only needed for source browsing and optional local cross-repo work

Role in the transition:

- `gdc-sdk-core-ts` will own shared actor/capability contracts
- `gdc-sdk-node-ts` will own Node runtime adapters and backend-facing orchestration
- `dataspace-client-sdk-node` is now the legacy source repo for migration, not the final name

Reusable payload source of truth:

- [../gdc-common-utils-ts/src/examples/organization-controller.ts](../gdc-common-utils-ts/src/examples/organization-controller.ts)
  - `_activate`, legal order, employee creation, employee device activation
- [../gdc-common-utils-ts/src/examples/individual-controller.ts](../gdc-common-utils-ts/src/examples/individual-controller.ts)
  - individual bootstrap, consent, search, communication ingestion, digital twin
- [../gdc-common-utils-ts/src/examples/professional.ts](../gdc-common-utils-ts/src/examples/professional.ts)
  - SMART token and clinical access request examples
  - reusable professional role/permission scenarios by section and expected FHIR types
  - reusable consent-vs-smart matrices for actor targeting by email, organization, or jurisdiction
- [../gdc-common-utils-ts/src/examples/shared.ts](../gdc-common-utils-ts/src/examples/shared.ts)
  - shared route contexts and helper builders
- [../gdc-common-utils-ts/src/examples/api-flow-examples.ts](../gdc-common-utils-ts/src/examples/api-flow-examples.ts)
  - preferred compatibility aggregator when one import surface is needed without using the overloaded term `contract`
- [tests/fixtures/ica-vp-minimal.json](tests/fixtures/ica-vp-minimal.json)
  - minimal VP fixture used by live GW onboarding/smart flows

CORE vs extension note:

- shared CORE examples are email-first for individual/controller bootstrap
- `subjectPhone`, `subjectGivenName`, and phone-first controller onboarding are compatibility or extension concerns, not required CORE GW contract fields
- route `tenantId` examples use identifier-style values such as `acme-id`, not friendly alternate names
- individual/family bootstrap uses `org.schema.Organization.owner.*` claims for the human owner/controller
- legal organization activation uses `Person` representative semantics plus VC `memberOf` / `hasOccupation`

## API Index

The canonical API contract should live in JSDoc on exported code. The README is the linked index.

### Core document helpers re-exported from `gdc-sdk-core-ts`

- [`createCommunicationResource(...)`](../gdc-sdk-core-ts/src/communication-resource-helpers.ts)
  - Creates a minimal FHIR `Communication` resource.
  - Main params: `subject`, `sender?`, `recipient?`, `sent?`, `status?`, `category?`, `noteText?`, `claims?`.
- [`addFhirResourceToCommunication(...)`](../gdc-sdk-core-ts/src/communication-resource-helpers.ts)
  - Attaches a FHIR resource to `Communication.payload`, optionally wrapped as `DocumentReference`.
  - Main params: `communication`, `resource`, `noteText?`, `asDocumentReference?`, `attachmentTitle?`, `attachmentContentType?`, `documentDescription?`, `documentDate?`, `documentSubject?`.
- [`addClaimsResourceToCommunication(...)`](../gdc-sdk-core-ts/src/communication-resource-helpers.ts)
  - Attaches a claims-only pseudo-resource using `meta.claims`.
  - Main params: `communication`, `resourceType`, `claims`, `options?`.
- [`buildCommunicationBatchMessage(...)`](../gdc-sdk-core-ts/src/communication-resource-helpers.ts)
  - Wraps a FHIR `Communication` into a GW-ready batch envelope.
  - Main params: `communication`, `thid?`, `jti?`, `iss?`, `aud?`, `requestUrl?`, `entryType?`, `messageType?`, `fhirVersion?`.
- [`createCommunicationFacade()`](../gdc-sdk-core-ts/src/communication-document-facade.ts)
  - Creates the high-level document access facade.
- [`getDocumentFromCommunication(...)`](../gdc-sdk-core-ts/src/communication-document-facade.ts)
  - Resolves the first attached document and hides direct attachment vs `DocumentReference`.
- [`createFhirDocumentFacade(...)`](../gdc-sdk-core-ts/src/communication-document-facade.ts)
  - Exposes `getBundle()`, `getSections()`, `getResources(resourceType?)`, `getByDates(resourceType, start, end?)`, `getContainingTextOrDisplay(resourceType, text)`.
- [`createCommunicationDraft(...)`](../gdc-sdk-core-ts/src/communication-draft.ts)
  - Starts an in-memory communication draft.
- [`addFhirResourceToDraft(...)`](../gdc-sdk-core-ts/src/communication-draft.ts)
  - Appends a concrete FHIR resource to the draft.
- [`addClaimsResourceToDraft(...)`](../gdc-sdk-core-ts/src/communication-draft.ts)
  - Appends a claims-only pseudo-resource to the draft.
- [`createOutboxJobFromDraft(...)`](../gdc-sdk-core-ts/src/communication-draft.ts)
  - Freezes the draft into a transport-oriented outbox job.
- [`updateOutboxJobStatus(...)`](../gdc-sdk-core-ts/src/communication-draft.ts)
  - Updates the outbox job status and transport result metadata.
- [`IOutboxRepository`](../gdc-sdk-core-ts/src/communication-outbox.ts)
- [`OutboxRepositoryMemory`](../gdc-sdk-core-ts/src/communication-outbox.ts)
- [`createHeartRateObservation(...)`](../gdc-sdk-core-ts/src/vital-signs.ts)
- [`createBodyTemperatureObservation(...)`](../gdc-sdk-core-ts/src/vital-signs.ts)
- [`createBloodPressureObservation(...)`](../gdc-sdk-core-ts/src/vital-signs.ts)

### Node runtime client

- [`NodeHttpClient`](src/node-runtime-client.ts)
  - Main runtime class for submit/poll orchestration against the GW.
- [`NodeHttpClient.ingestCommunicationAndUpdateIndex(...)`](src/node-runtime-client.ts)
  - Sends a `Communication` ingestion request and polls until indexed.
  - Main params: `ctx`, `input.communicationPayload`, `input.pathFormatSegment?`, `input.autoConvertClaimsToFhirR4?`, `input.pollOptions?`.
- [`NodeHttpClient.submitCommunicationAndPoll(...)`](src/node-runtime-client.ts)
  - Alias of `ingestCommunicationAndUpdateIndex(...)`.
- [`NodeHttpClient.searchClinicalBundle(...)`](src/node-runtime-client.ts)
  - Executes clinical `Bundle/_search`.
  - Main params: `ctx`, `input.subject`, `input.section?`, `input.date?`, `input.includedTypes?`, `input.code?`, `input.category?`, `input.author?`, `input.pollOptions?`.
- [`NodeHttpClient.searchLatestIps(...)`](src/node-runtime-client.ts)
  - Shortcut for latest IPS-oriented document search.
- [`NodeHttpClient.grantProfessionalAccess(...)`](src/node-runtime-client.ts)
  - Sends a consent-grant flow for a professional actor.
- [`NodeHttpClient.requestSmartToken(...)`](src/node-runtime-client.ts)
  - Requests SMART/OpenID token material through the GW.
  - Main params: `input.actorDid`, `input.subjectDid`, `input.scopes`, `input.idToken`, optional `input.vpToken`, and optional route compatibility fields when the client was not initialized with a default `ctx`.

### Runtime configuration

- [`NodeRuntimeConfig`](src/runtime-contracts.ts)
  - Includes `interopMode?`, `persistencePolicy?`, and `outboxRepositoryFactory?` so node runtimes can declare `demo`/`compat`/`strict` mode and choose `memory` vs `server-remote` persistence explicitly.
- [`initializeCommunicationIdentityFromSeed(...)`](src/identity-bootstrap.ts)
  - Node SDK wrapper for the shared technical communication identity bootstrap helper from `gdc-common-utils-ts`.

### Low-level orchestration helpers

- [`createOrganizationEmployeeWithDeps(...)`](src/resource-operations.ts)
  - Creates an employee/person batch payload for CORE GW using canonical `org.schema.Person.*` claims.
- [`importIpsOrFhirAndUpdateIndexWithDeps(...)`](src/resource-operations.ts)
- [`upsertRelatedPersonAndPollWithDeps(...)`](src/resource-operations.ts)
  - Creates or updates a `RelatedPerson` for family/caregiver roles outside employee/controller flows.
- [`ingestCommunicationAndUpdateIndexWithDeps(...)`](src/resource-operations.ts)
- [`searchClinicalBundleWithDeps(...)`](src/resource-operations.ts)
- [`searchLatestIpsWithDeps(...)`](src/resource-operations.ts)
- [`grantProfessionalAccessWithDeps(...)`](src/resource-operations.ts)
  - Builds a consent grant where actor targeting should normally be passed as canonical `Consent.actor-identifier` input: a `did:web`, email, `tel:+...`, country code, or comma-separated list of those values.

These functions are runtime-oriented building blocks. For application-level document handling, prefer the re-exported communication/document helpers from `gdc-sdk-core-ts`.

### Documentation rule

- JSDoc on exported code is canonical.
- README entries should link to source and summarize the most important parameters.
- If you add a public method/function, document it in JSDoc first and then add it here.
- If a public payload shape is used in tests or docs, keep its reusable example in the relevant module under [`../gdc-common-utils-ts/src/examples/`](../gdc-common-utils-ts/src/examples/) and link that specific flow file from the relevant markdown section.

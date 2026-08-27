# 101 Reading Path

> 101 note
> - Start here when you need the `gdc-sdk-node-ts` learning order.
> - `gdc-common-utils-ts` owns the canonical step-by-step editors/readers and shared fixtures.
> - This repo starts after that shared authoring step and owns actor facades, profile/runtime loading, HTTP submit/poll, and Node execution.
> - Reuse lower-layer contracts from `gdc-sdk-core-ts` and `gdc-common-utils-ts` instead of rebuilding them here.

## Read First

1. [gdc-sdk-core-ts/docs/101-USER_STORY_CANON.md](https://github.com/Global-DataCare/gdc-sdk-core-ts/blob/main/docs/101-USER_STORY_CANON.md)
2. [101-SDK_INTEGRATION.md](./101-SDK_INTEGRATION.md)
3. [101-SDK_END_TO_END.md](./101-SDK_END_TO_END.md)
4. [101-WALLET_CONTEXT_AND_KEY_CUSTODY.md](./101-WALLET_CONTEXT_AND_KEY_CUSTODY.md)
5. [101-AUTHORIZED_SUBJECT_DIRECTORY.md](./101-AUTHORIZED_SUBJECT_DIRECTORY.md)
6. [101-DIGITAL_TWIN_SDK.md](./101-DIGITAL_TWIN_SDK.md)
7. [101-ORGANIZATION_CONTROLLER_LIFECYCLE.md](./101-ORGANIZATION_CONTROLLER_LIFECYCLE.md)
8. [101-FHIR-R5-SUBSCRIPTIONS-AND-DEVICE-PUSH.md](./101-FHIR-R5-SUBSCRIPTIONS-AND-DEVICE-PUSH.md)

## User Story Start

For a self-managed user in a BFF, Expo/native app backend, or web backend, the
canonical story starts with shared authoring in `gdc-common-utils-ts`, then
moves into `gdc-sdk-core-ts`, and only then lands here for runtime execution:

1. authenticate the user
2. load/unlock one protected local profile with `loadProfile(...)`
3. materialize one loaded profile workspace/session
4. assume or bootstrap the actor state already owned by that user:
   organization controller, individual controller, professional employee, or
   individual member
5. only then create/read/edit/import/search business data

For individual subject journeys, the Node-side runtime entrypoint is still
`ProfileRuntime.loadProfile(...)` followed by `workspace.asIndividualController()`.
Use `gdc-common-utils-ts` for payload authoring and shared fixtures, but do not
stop the explanation there when the goal is the runtime flow.

Current executable entrypoints:

- high-level complete backend story:
  [tests/101-backend-profile-runtime.test.mjs](../tests/101-backend-profile-runtime.test.mjs)
- chainable profile workspace after load:
  [tests/101-profile-workspace-runtime.test.mjs](../tests/101-profile-workspace-runtime.test.mjs)
- organization-controller lifecycle:
  [tests/101-organization-controller-lifecycle.test.mjs](../tests/101-organization-controller-lifecycle.test.mjs)
- individual-controller runtime:
  [tests/101-individual-controller-backend-runtime.test.mjs](../tests/101-individual-controller-backend-runtime.test.mjs)
- individual clinical summary through Communication `$summary`:
  [tests/101-individual-summary-communication.test.mjs](../tests/101-individual-summary-communication.test.mjs)
- professional access request, subject inbox, correlated Consent and SMART:
  [docs/101-PROFESSIONAL-CONSENT-SMART.md](./101-PROFESSIONAL-CONSENT-SMART.md) and
  [tests/101-professional-access-request-lifecycle.test.mjs](../tests/101-professional-access-request-lifecycle.test.mjs)
- digital-twin coded search, tagged working selection, reopen by tag, and
  materialization:
  [docs/101-DIGITAL_TWIN_SDK.md](./101-DIGITAL_TWIN_SDK.md) and
  [tests/101-digital-twin-sdk.test.mjs](../tests/101-digital-twin-sdk.test.mjs)
- wallet-backed backend/session jobs:
  [tests/101-wallet-backed-job-manager.test.mjs](../tests/101-wallet-backed-job-manager.test.mjs)
- signed-account discovery of already-authorized subjects without VP/SMART
  escalation:
  [101-AUTHORIZED_SUBJECT_DIRECTORY.md](./101-AUTHORIZED_SUBJECT_DIRECTORY.md) and
  [tests/authorized-subject-directory.test.mjs](../tests/authorized-subject-directory.test.mjs)

Teaching rule:

- every beginner flow should be explainable as:
  `login -> loadProfile -> workspace/session -> actor facade -> submit/poll -> assume/bootstrap actor state -> create/read/edit/search`

Responsibility split:

- `ProfileRuntime`:
  load/unlock the user profile and let that profile wallet encrypt outbound
  messages and decrypt inbound replies
- shared authoring in `gdc-common-utils-ts` already builds the business
  payload before this runtime layer sees it
- frontend/BFF readers first decode one DIDComm/plain payload into one
  `Communication`, show metadata, and open the attached payload
- for current health document cases, that attached payload should normally be
  one document bundle with `Composition` first entry
- backend search remains a separate public story taught with FHIR search
  parameters such as `Composition.section`
- BFF/channel service:
  may orchestrate one local outbox for many profiles, apply priority/retry,
  and optionally own a separate service wallet
- GW CORE:
  processes the message only after reception and owns server-side async flow
- do not teach those three responsibilities as one single queue/runtime

Canonical BFF snippet:

```ts
const workspace = await new ProfileRuntime(runtimeClient).loadProfile(loadRequest);
const actor = workspace.asOrganizationController();

// Payload authoring still comes from the shared lower layer:
// document Bundle -> Communication -> DIDComm/plain
//
// This repo teaches what happens next:
// workspace/session -> actor facade -> submit/poll/read decoded response
```

Lower-layer canonical references:

- [gdc-common-utils-ts/__tests__/101-communication-medication-document.test.ts](https://github.com/Global-DataCare/gdc-common-utils-ts/blob/main/__tests__/101-communication-medication-document.test.ts)
- [gdc-common-utils-ts/__tests__/101-profile-manager-mem.test.ts](https://github.com/Global-DataCare/gdc-common-utils-ts/blob/main/__tests__/101-profile-manager-mem.test.ts)

Naming rule:

- the unlocked user profile concept is `ProfileRuntime` in every runtime package
- `node`, `frontend`, `expo`, or `web` belong in adapters/factories, not in the user-facing profile-runtime name
- a tenant/BFF service wallet for DIDComm/plain, signing, encryption, or confidential storage is a separate runtime concern
- if a `101` does not make clear where that entrypoint is tested, link one of
  the files above before dropping into lower-level helpers

## Main Executable 101 Tests

- [tests/101-organization-controller-lifecycle.test.mjs](../tests/101-organization-controller-lifecycle.test.mjs)
- [tests/101-individual-controller-backend-runtime.test.mjs](../tests/101-individual-controller-backend-runtime.test.mjs)
- [tests/101-backend-profile-runtime.test.mjs](../tests/101-backend-profile-runtime.test.mjs)
- [tests/101-digital-twin-sdk.test.mjs](../tests/101-digital-twin-sdk.test.mjs)
- [tests/101-live-full-cycle-bff-runtime.e2e.test.mjs](../tests/101-live-full-cycle-bff-runtime.e2e.test.mjs)

## Boundary

- Teach here: actor facade, profile/runtime, submit/poll, and Node execution.
- Reuse lower-layer builders and shared semantics from `sdk-core` and `common-utils`.
- Do not restart from raw claims or low-level editors unless the file is explicitly about them.

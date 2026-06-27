# Architecture

## Purpose

`gdc-sdk-node-ts` owns node/server runtime orchestration on top of
`gdc-sdk-core-ts` and `gdc-common-utils-ts`.

This repository is the canonical place for:

- runtime adapters for node/server execution
- submit/poll orchestration
- route/path binding to current GW contracts
- actor/profile runtimes for server-side execution in the name of a concrete actor
- server-side facades acting on behalf of concrete users or actors
- backend-generic profile loading, trusted-device, and subject-index runtime implementations
- backend queue/outbox/vault implementations for actor-aware runtime execution

This repository is not the place for:

- shared high-level editor/reader/state abstractions
- neutral domain facades that should live in `sdk-core`
- gateway manager logic

## Ownership Rules

Put code here when it:

- needs node runtime behavior
- depends on real route binding, transport, polling, or execution context
- acts as a server-side facade in the name of a concrete actor
- implements actor-profile runtime concerns such as profile loading, session/runtime state, or job execution
- implements concrete runtime queue, outbox, and vault behavior for backend execution

Do not put code here when it:

- is reusable as a neutral semantic helper
- belongs to a cross-runtime facade
- should be shared with browser/mobile code

## Dependency Rule

`sdk-node` should consume:

- `gdc-common-utils-ts` for shared high-level semantics
- `gdc-sdk-core-ts` for neutral facade contracts and domain surfaces

It should not become the first home of reusable high-level abstractions.

It should also not become the first home of canonical high-level `get...` /
`set...` methods on shared semantic classes.

## Naming Rules

When a method prepares an operation helper rather than executing runtime work,
keep the operation prefix first and the specific target later.

Examples:

- `prepareSearchLicenseList`
- `prepareLifecycleIndividualOrganizationDisable`

Execution methods may use direct verbs such as:

- `search...`
- `disable...`
- `purge...`
- `submit...`

## Boundary With GW

`sdk-node` may know the current GW route behavior.

It must not redefine GW manager behavior as if it were the source of truth.
Shared semantics belong lower; final backend behavior belongs in GW CORE.

## Actor Profile Runtime Rule

`sdk-node` is an actor-aware runtime layer.

It may load one actor profile, apply the actor's capability surface from
`sdk-core`, and execute transport/runtime work in that actor's name.

Its boundary is runtime execution, not reusable semantic modeling.

The intended backend runtime decomposition is:

- `loadProfile(...)`
- `closeProfile(...)`
- `JobManager`
- backend `Outbox`
- backend `Queue`
- backend `Vault...` adapter

Rules:

- `JobManager` is common by responsibility across runtimes; do not rename it
  as if memory/server were its primary identity
- backend-specific details should be specialized at the adapter/factory layer,
  for example:
  - `createJobManagerInMemory(...)`
  - `VaultMemory`
  - future `createServerQueueInMemory(...)`
- the queue belongs to the backend runtime/device/server, not to the shared
  semantic model
- `JobManager` owns profile/session work state; the queue owns scheduling and
  execution; the vault owns persistence

For the current backend call/session model:

- `loadProfile(profilePinPassword)` starts the actor session
- backend runtime may use `VaultMemory` when no durable persistence is needed
- messages/jobs may be sent to GW CORE immediately
- `closeProfile(...)` ends the session and clears memory-owned runtime state

Current implementation guidance in this repository:

- the shared wallet contract may be implemented by a node/backend wallet that
  keeps separate profile-signing and runtime-communication keys
- a backend/BFF/session runtime can use a wallet-backed `JobManager` with a
  memory vault when the process is single-session or short-lived
- that memory-backed path is appropriate for:
  - demos
  - tests
  - one-session BFF flows
  - transient channel/service sessions
- once the runtime becomes multi-user or must survive process restarts, the
  queue must stop being an in-memory detail
- in that case the backend shape is:
  - durable outbox repository
  - durable or rehydratable vault/profile session state
  - durable queue adapter or another worker-backed scheduling adapter
  - worker/executor that reloads the job by id and rehydrates the needed
    profile/runtime context

So the node rule is:

- `JobManager` still owns per-profile work state
- the queue adapter owns scheduling/execution
- `Vault...` owns persistence or session cache
- memory-backed adapters are acceptable defaults, not the target architecture
  for multi-user channel services

## Test And Example Policy

High-level tests should show actor/runtime behavior with as little plumbing as
possible, while still proving node orchestration.

Live E2E suites should be split by purpose:

- platform lifecycle suites
- actor profile-runtime suites
- actor dialogue/interoperability suites

Do not collapse those into one giant test with mixed intent.

Important cleanup rule:

- actor and dialogue suites may create data that another actor consumes
- in those suites, `disable` / `purge` happen at the end as cleanup for the
  scenario that created the state
- only platform lifecycle suites should treat destructive lifecycle from host
  downward as the primary subject of the test

Preferred anchors:

- [tests/101-backend-profile-runtime.test.mjs](/Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts/tests/101-backend-profile-runtime.test.mjs:1)
- [tests/orchestration.test.mjs](/Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts/tests/orchestration.test.mjs:1)
- [tests/gdc-session-bridge.test.mjs](/Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts/tests/gdc-session-bridge.test.mjs:1)
- [tests/resource-operations.test.mjs](/Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts/tests/resource-operations.test.mjs:1)
- [tests/host-onboarding.test.mjs](/Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts/tests/host-onboarding.test.mjs:1)
- [tests/live-gw-node-runtime.e2e.test.mjs](/Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts/tests/live-gw-node-runtime.e2e.test.mjs:1)

Use shared data from `gdc-common-utils-ts` whenever possible instead of
redefining inline literals in node tests.

Prefer step-by-step tests that make the actor flow explicit without rebuilding
shared examples locally unless the test is intentionally about a node-only edge
case.

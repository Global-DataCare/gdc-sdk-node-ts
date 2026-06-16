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

## Test And Example Policy

High-level tests should show actor/runtime behavior with as little plumbing as
possible, while still proving node orchestration.

Preferred anchors:

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

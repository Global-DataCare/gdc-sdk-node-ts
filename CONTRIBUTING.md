# Contributing

Read [ARCHITECTURE.md](./ARCHITECTURE.md) before adding runtime helpers or
facades.

## Main Rule

`gdc-sdk-node-ts` is for node/server runtime orchestration in the name of a
concrete actor.

Do not introduce reusable neutral high-level semantics here when they can live
in `gdc-common-utils-ts` or `gdc-sdk-core-ts`.

Do not add canonical shared `get...` / `set...` methods here; those must be
defined in `gdc-common-utils-ts` first.

For actor runtime work in `sdk-node`, keep this split explicit:

- `JobManager` = common profile/session orchestration concept
- `Outbox` = logical pending work owned by the profile/runtime
- `Queue` = backend scheduling/execution layer
- `Vault...` = persistence adapter
- `loadProfile(...)` / `closeProfile(...)` = runtime lifecycle entry/exit

Concrete backend implementations belong here, but keep the specialization at
the end of the name, for example:

- `createJobManagerInMemory(...)`
- `VaultMemory`
- future `createServerQueueInMemory(...)`

Do not rename the common abstraction itself as if memory/server were its
primary identity.

## Test Rule

Keep node tests as high-level as possible for the actor flow being exercised.

Prefer shared fixtures/examples from `gdc-common-utils-ts` and avoid inline
literals unless the test is explicitly about node-only runtime behavior.

## Live E2E Validation Order

Do not skip validation stages when changing runtime flows, live suites, Docker
packaging, or deployment wiring.

Required order:

1. real-terminal local process E2E
2. local Docker image E2E
3. staging E2E
4. only then production image/deploy work

Practical rule:

- first prove the flow from a real local TTY against local processes
- then prove the same flow against the local Docker image/container
- then prove the same flow against staging
- do not treat staging as the first debugging environment
- do not prepare or promote production deployment work before the staging live
  E2E is green

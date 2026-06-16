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

## Test Rule

Keep node tests as high-level as possible for the actor flow being exercised.

Prefer shared fixtures/examples from `gdc-common-utils-ts` and avoid inline
literals unless the test is explicitly about node-only runtime behavior.

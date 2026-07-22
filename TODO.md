# TODO - Node BFF Runtime Reconciliation

Authoritative plan: `../gdc-sdk-core-ts/docs/MVP_BUNDLE_CHANGE_RECONCILIATION_PLAN.md`.

- [ ] Keep the live “virtual BFF” test as a runtime/GW harness, not as a
  browser-facing BFF API implementation.
- [ ] Add facade/runtime composition for submitting a `changesBundle` and then
  performing the caller-selected authoritative search.
- [ ] Use the Core response analyzer; never accept a frontend display Bundle
  as submission input.
- [ ] Add live tests proving submit/poll acknowledgement remains distinct from
  exact search/readback confirmation.
- [ ] Preserve current public methods during the MVP; migrate adapters
  incrementally and publish before consumers update dependency ranges.


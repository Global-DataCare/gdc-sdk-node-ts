# Next Steps

This file separates the current GW CORE live-validation scope from later
application architecture work.

## Current phase

The current goal is to validate GW CORE end to end from Node tests in a
controlled environment.

The live suite in `tests/live-gw-node-runtime.e2e.test.mjs` currently acts as:

- a controlled `virtual API`
- a realistic E2E harness
- a high-level runtime caller over the real GW CORE async contract
- a `user job manager`-compatible direct mode with local queue disabled

It does not define the final product backend architecture.

## What must pass first

Before evolving local app-side orchestration, validate these phases in order:

1. complete the full user-dialogue lifecycle against local `mem`
2. repeat that same full lifecycle against local `firestore + gcs`
3. deploy the validated GW CORE runtime online
4. rerun the same live lifecycle against the remote environment

## Full lifecycle still pending

The current live suites already prove important slices in `mem`, but they still
do not cover the full user-dialogue lifecycle as one root scenario.

The intended canonical order is:

1. activate host / tenant controller
2. confirm the initial organization bootstrap
3. list organization licenses at the start
4. search/list license offers
5. portal performs the fictitious payment outside GW CORE
6. portal sends the purchase/activation confirmation to GW CORE so the extra
   seats become active
7. list organization licenses again
8. create one employee bundle containing employee `A` and employee `B`
9. search/list employees after creation
10. attempt purge of both while active and verify both fail
11. disable only employee `A`
12. purge employee `A` successfully
13. verify employee `B` still cannot be purged while active
14. list organization licenses again after the valid purge
15. bootstrap the hosted individual
16. confirm the individual order
17. read the initial individual-side index
18. send one clinical `Communication` carrying multiple medication entries in
    the same bundle
19. send one separate IPS `Communication` carrying the full IPS/document bundle
20. read the individual index again and verify the new data
21. create or update the `RelatedPerson`
22. issue one individual/member-side license if the scenario needs it
23. grant a first limited consent to the professional for only a subset of IPS
    sections
24. let the professional try to read broader data and verify the expected
    authorization failure
25. send one follow-up consent/permission update that broadens access to the
    required IPS sections
26. let the professional retry and verify IPS/index reading now succeeds
27. revoke/disable the member-side consent if present
28. revoke/disable the professional consent
29. disable/purge the member if present
30. disable/purge the individual
31. disable/purge remaining employees
32. if the tenant is left without employees or hosted individuals, allow the
    controller to purge the tenant and leave the environment clean

At the end of the test, only the unavoidable audit/trace records should
remain. No active employee, member, individual, or consent state should remain.

## Current gap for extra license activation

`sdk-node` already exposes high-level runtime facades for:

- `listLicenses`
- `searchLicenses`
- `searchLicenseOffers`
- `listLicenseOffers`
- `searchLicenseOrders`
- `listLicenseOrders`

What is still missing as a canonical live/runtime flow is the complete long
dialogue that represents:

- portal-side fictitious payment already resolved
- follow-up confirmation message sent to GW CORE
- resulting license-seat activation reflected in the organization license list
- employee bundle creation for `A` + `B`
- selective disable/purge checks
- final cleanup after the professional/individual dialogue finishes

What is already implemented now:

- `OrganizationControllerSdk.confirmOrganizationLicenseOrder(...)` submits the
  portal-managed confirmation through the public host `Order/_batch` route
- host and individual order responses expose an embedded invoice `Bundle`
  containing:
  - one FHIR `Invoice`
  - one PDF `DocumentReference`
  - one structured JSON/XML `DocumentReference`

So the missing piece is not only test orchestration. One runtime/facade step
still needs to be converged in `sdk-node` for the exact extra-license
activation scenario.

The SDK now exposes that business step explicitly as
`OrganizationControllerSdk.confirmOrganizationLicenseOrder(...)`, but current
runtime clients still fail with a clear unsupported-flow error because GW CORE
has not exposed the public converged write route yet.

## What is intentionally out of scope for this phase

These concerns are important, but they are not blockers for validating the
current GW CORE runtime:

- product BFF design
- queued `user job manager` mode
- offline queue and retry state machine
- local vault persistence
- `ConsentViewModel` and other persistent read models
- reconciliation between local pending jobs and remote indexed state
- frontend-specific sync vs async UX policies

## Current direct-mode assumption

The current live suites intentionally behave as if a future `user job manager`
were present but configured in `direct` mode:

- local queue disabled
- no retry persistence
- no offline cache dependency
- same high-level facades that a future app-side manager will call later

This lets GW CORE lifecycle validation happen first without mixing in app-side
queue complexity.

## Follow-up architecture after live validation

Once GW CORE is validated online, the next app-side layer should be defined
explicitly instead of being mixed into the live test harness.

Recommended split:

- facades
  - high-level business operations
- user job manager
  - direct mode and queued mode over the same high-level facades
  - queue, submit, retry, sent/failed state
- local vault/editors
  - draft editing and offline persistence
- read models
  - `ConsentViewModel`, medication summaries, IPS-derived views

## Actor-facade roadmap

The current canonical actor/facade split already exists across `sdk-core`,
`sdk-node`, and `sdk-front`:

- `OrganizationController`
- `OrganizationEmployee`
- `IndividualController`
- `IndividualMember`
- `Professional`

The live lifecycle suites should keep using those canonical facades first.

When product/runtime coverage grows, the following domain-oriented names should
be treated as specializations over the canonical actor surface, not as a second
independent facade taxonomy:

- `IndividualController`
- `IndividualUser`
- `IndividualMember`
- `OrgController`
- `OrgProfHealthCare`
- `OrgProfVet`
- `OrgProfAdministrative`
- `OrgProfFirstResponder`

Practical rule:

- `IndividualController` maps to the existing individual-controller facade
- `IndividualMember` maps to the existing individual-member facade
- `IndividualUser` should reuse the individual-side/personal facade surface
- `OrgController` maps to the existing organization-controller facade
- the `OrgProf*` variants should converge on the existing `Professional`
  facade plus sector/role-specific capability shaping

This avoids fragmenting the SDK surface before the shared actor/capability
contract is fully converged.

## Terminology rule

Use these terms consistently:

- `virtual API`
  - controlled E2E harness used by Node live tests
- `product BFF`
  - future real backend boundary used by applications
- `user job manager`
  - future app-side orchestration and queue layer

Do not use those three names as if they were interchangeable.

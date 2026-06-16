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

## Live suite taxonomy after platform validation

After the GW CORE platform lifecycle is validated, live tests should be split
into separate families instead of mixing everything into one destructive
platform scenario.

### 1. Platform lifecycle E2E

This suite validates GW CORE as platform/runtime:

- host/bootstrap
- tenant/bootstrap
- employee/professional lifecycle
- individual lifecycle
- final cleanup of platform state

This is not the same as one profile-runtime use case.

### 2. Actor profile-runtime E2E

These suites start with one actor already operating in its expected runtime
context, for example:

- organization controller already managing the tenant organization
- individual controller already managing the individual organization
- professional already operating under an organization
- family member already operating under an individual relationship

These suites should begin with `loadProfile(...)` and then validate only that
actor's allowed operations.

### 3. Actor dialogue/interoperability E2E

These suites validate real inter-actor business flows where one actor creates
the state required by another actor.

Examples:

- controller grants consent and then professional reads allowed data
- controller creates/invites a member and then member accesses the allowed view
- professional creates clinical data and then controller/subject reads indexed
  results

These are not isolated actor tests. They are dialogue tests where data created
by one actor is intentionally consumed by another.

### Cleanup rule

For actor and dialogue suites:

- `disable` / `purge` should happen at the end of the scenario that created the
  resources
- they are cleanup/finalization steps of that scenario
- they should not force the suite to begin with the full GW CORE platform
  lifecycle

Only the platform lifecycle suite should treat host/tenant/employee/individual
destruction as the primary subject of the test.

## Immediate profile-runtime target

The next concrete target is still the current individual-controller baseline on
top of the new v2 profile runtime, but it should be treated as the first
actor-profile suite, not as part of the GW CORE lifecycle suite.

That first actor-profile suite now has a standalone test file:

- `tests/live-profile-runtime-individual.e2e.test.mjs`

It should validate, in order:

1. `loadProfile(...)` backend
2. `startIndividualOrganization(...)`
3. `confirmIndividualOrganizationOrder(...)`
4. the current canonical index/`Composition` read path, after proving which
   runtime helper is the real source of truth today:
   - `getLatestIps(...)`
   - or `searchClinicalBundle(...)`
5. scenario-owned `disable` / `purge` cleanup at the end, only if that actor
   flow created lifecycle state that must be cleaned

Do not freeze the final public wording for that read step until the current GW
CORE runtime proves which route/shape is canonical.

## Full dialogue lifecycle still pending

The current live suites already prove important slices in `mem`, but they still
do not cover the full inter-actor user-dialogue lifecycle as one root scenario.

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

## Continuation TODO

Use this section to resume the v2 profile-runtime work in another thread
without rebuilding context from scratch.

### Current completed state

- `sdk-core` already defines the neutral profile-runtime contract:
  - `ProfileLoadRequest`
  - `SubjectIndexConnectionRequest`
  - `SubjectIndexCompositionRequest`
  - `IJobManager`
- `sdk-node` already implements:
  - `DirectBackendProfileRuntime`
  - `createJobManagerInMemory(...)`
  - `closeProfile(...)` / `closeBackendProfile(...)`
  - `IndividualControllerBackendRuntime`
- standalone actor-profile live suite already exists:
  - `tests/live-profile-runtime-individual.e2e.test.mjs`
- GW CORE platform lifecycle suite still exists separately:
  - `tests/live-gw-node-runtime.e2e.test.mjs`

### Immediate next implementation targets

1. Execute `tests/live-profile-runtime-individual.e2e.test.mjs` from a real
   terminal/TTY against the current GW CORE runtime and capture the exact
   failures.
2. Fix any contract drift found in:
   - `loadProfile(...)`
   - `startIndividualOrganization(...)`
   - `confirmIndividualOrganizationOrder(...)`
   - subject-index read helper
3. Freeze which read helper is canonical for the actor-profile suite:
   - `getLatestIps(...)`
   - or `searchClinicalBundle(...)`
4. Add the next standalone actor-profile suite:
   - `tests/live-profile-runtime-professional.e2e.test.mjs`
5. Add the first actor-dialogue suite:
   - controller grants consent
   - professional reads allowed data
   - cleanup with scenario-owned `disable` / `purge` only at the end

### Important constraints for the next agent

- Do not merge profile-runtime actor suites back into the GW CORE platform
  lifecycle suite.
- Actor-profile suites start from one already operational tenant/runtime
  context.
- Dialogue suites may reuse setup helpers, but the business focus is the actor
  interaction, not host/tenant lifecycle.
- `disable` / `purge` belong at the end of the actor/dialogue scenario that
  created the state.
- Keep reusing shared examples from `gdc-common-utils-ts`; do not add ad-hoc
  literals in new `101` tests or live suites unless strictly necessary.

### Minimal handoff package for the next thread

The next agent should be given these files first:

- `gdc-sdk-node-ts/docs/NEXT_STEPS.md`
- `gdc-sdk-node-ts/ARCHITECTURE.md`
- `gdc-sdk-node-ts/README.md`
- `gdc-sdk-node-ts/src/backend-profile-runtime.ts`
- `gdc-sdk-node-ts/src/individual-controller-backend-runtime.ts`
- `gdc-sdk-node-ts/tests/101-backend-profile-runtime.test.mjs`
- `gdc-sdk-node-ts/tests/101-individual-controller-backend-runtime.test.mjs`
- `gdc-sdk-node-ts/tests/live-profile-runtime-individual.e2e.test.mjs`
- `gdc-sdk-node-ts/tests/live-gw-node-runtime.e2e.test.mjs`
- `gdc-sdk-node-ts/docs/V2_INDIVIDUAL_REGISTRATION_RECONCILIATION.md`

And this short instruction:

- continue the standalone profile-runtime E2E work
- start by running/fixing `live-profile-runtime-individual.e2e.test.mjs`
- keep platform lifecycle and actor/dialogue suites separated
- next deliverables are one stable individual actor-profile suite, one
  professional actor-profile suite, and one first consent dialogue suite

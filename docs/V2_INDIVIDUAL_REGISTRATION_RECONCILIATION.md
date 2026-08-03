# V2 Individual Registration Reconciliation

## Purpose

This note reconciles the current individual/family registration baseline across:

- legacy product-consumer flows
- the current `gdc-sdk-node-ts` runtime
- the current GW CORE behavior in `gwtemplate-node-ts`

The goal is to preserve the valid CORE registration base while keeping room for
later extensions that add tasks, reminders, or other product-specific
workflows.

## Short Conclusion

The **base individual registration flow is still valid in CORE**:

1. submit family/individual registration
2. receive one offer/order identifier
3. confirm that order

That baseline can later be extended by other runtimes, but the registration
itself remains the CORE part.

## Current CORE Baseline

Current `gdc-sdk-node-ts` already models the registration baseline as:

- [src/individual-start.ts](</Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts/src/individual-start.ts:1>)
- [src/individual-onboarding.ts](</Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts/src/individual-onboarding.ts:1>)
- [src/individual-controller-backend-runtime.ts](</Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts/src/individual-controller-backend-runtime.ts:1>)

Key tests:

- [tests/individual-start.test.mjs](</Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts/tests/individual-start.test.mjs:1>)
- [tests/individual-onboarding.test.mjs](</Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts/tests/individual-onboarding.test.mjs:1>)
- [tests/101-individual-controller-backend-runtime.test.mjs](</Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts/tests/101-individual-controller-backend-runtime.test.mjs:1>)

Current GW CORE references:

- [gwtemplate-node-ts/docs/API_CORE_INTEGRATION.md](</Users/fernando/GITS/gdc-workspace/gwtemplate-node-ts/docs/API_CORE_INTEGRATION.md:127>)
- [gwtemplate-node-ts/src/__tests__/integration/individual/family.test.ts](</Users/fernando/GITS/gdc-workspace/gwtemplate-node-ts/src/__tests__/integration/individual/family.test.ts:105>)
- [gwtemplate-node-ts/src/managers/FamilyManager.ts](</Users/fernando/GITS/gdc-workspace/gwtemplate-node-ts/src/managers/FamilyManager.ts:240>)

The current compatibility endpoints remain:

- `POST /{tenantId}/cds-{jurisdiction}/v1/{sector}/individual/org.schema/Organization/_batch`
- `POST /{tenantId}/cds-{jurisdiction}/v1/{sector}/individual/org.schema/Organization/_batch-response`

And the current order confirmation remains:

- `Family-order-request-v1.0`
- `Order.acceptedOffer.identifier`

## What The Legacy Consumer Was Doing

In a legacy product consumer, the old flow still submitted the registration
through its gateway-client facade.

Important observation:

- that legacy consumer did not define a new registration model
- it reused the CORE family registration flow
- later product logic extended the result with reminders/tasks and subject
  data-plane token requests

So the old consumer is still useful as:

- a functional reference
- an example of what happens **after** CORE registration

It should not be treated as the source of truth for current GW routes.

## Mapping: Legacy Consumer To Current SDK/Core

### Registration

Legacy consumer:

- sends `Family-registration-form-v1.0`
- posts to `individual/org.schema/Organization/_batch`

Current SDK:

- `startIndividualOrganizationWithDeps(...)`
- [src/individual-start.ts](</Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts/src/individual-start.ts:96>)
- `IndividualControllerBackendRuntime.startIndividualOrganization(...)`
- [src/individual-controller-backend-runtime.ts](</Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts/src/individual-controller-backend-runtime.ts:1>)

Current GW CORE:

- `Family-registration-form-v1.0`
- `individual/org.schema/Organization/_batch`

### Order Confirmation

Legacy consumer:

- confirms returned offer/order later

Current SDK:

- `confirmIndividualOrganizationOrderWithDeps(...)`
- [src/individual-onboarding.ts](</Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts/src/individual-onboarding.ts:45>)
- `IndividualControllerBackendRuntime.confirmIndividualOrganizationOrder(...)`
- [src/individual-controller-backend-runtime.ts](</Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts/src/individual-controller-backend-runtime.ts:1>)

Current GW CORE:

- `Family-order-request-v1.0`
- `Order.acceptedOffer.identifier`

### Subject Data Plane / Composition Access

Legacy consumer:

- later requested subject data-plane SMART scopes including `Composition.rs`
- then used that token for subject data-plane operations

The relevant legacy anchor remains in that product's gateway-client facade.

Current SDK baseline:

- token flow lives in [src/smart-token.ts](</Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts/src/smart-token.ts:1>)
- bundle/index search lives in [src/resource-operations.ts](</Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts/src/resource-operations.ts:217>)
- direct profile-runtime loading now lives in [src/backend-profile-runtime.ts](</Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts/src/backend-profile-runtime.ts:1>)
- backend individual-controller wrapper lives in [src/individual-controller-backend-runtime.ts](</Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts/src/individual-controller-backend-runtime.ts:1>)

Important caution:

- the old consumer's data-plane flow is a useful reference
- but it must be revalidated against current GW CORE behavior before becoming
  the canonical v2 backend implementation

## Stable CORE Pieces We Can Reuse Immediately

These pieces are stable enough to keep using as the baseline:

- registration request type `Family-registration-form-v1.0`
- order request type `Family-order-request-v1.0`
- `Organization.owner.email`
- `Organization.owner.telephone`
- `Person.hasOccupation.identifier.value`
- `Order.acceptedOffer.identifier`

## Product/Extension Pieces That Must Stay Out Of CORE Baseline

These do not belong in the baseline registration contract:

- non-core menu logic

Those can extend the registration flow later, but they are not the base flow.

## Planned GW v2: delegated individual onboarding by a professional

The current MVP assumes that individual onboarding has already generated the
canonical `subjectDid`. A professional permission request consumes that DID;
it does not create a subject and it is not a global email-to-DID lookup.

GW v2 must define a distinct delegated-onboarding operation for a professional
who needs to create the individual's index. The planned evidence chain is:

```text
verified professional
  -> signed delegated-onboarding request
      -> attached Consent signed by individual or legal guardian
          -> individual index + canonical DID
              -> controller binding (self or another authorized person)
```

Required GW v2 design work:

1. Define the Communication request type, audience, sender and correlation
   identifiers without reusing a clinical permission request as registration.
2. Define the attached Consent/evidence profile, including individual versus
   legal-guardian authority and attachment integrity.
3. Authenticate and verify the professional signature and organization role.
4. Define assurance policy for the Consent signature. A qualified electronic
   certificate is not universally mandatory, so the accepted signature modes
   and jurisdiction/profile rules must be explicit rather than inferred.
5. Create the individual DID during successful onboarding and bind the selected
   controller, whether self or a different authorized person.
6. Define duplicate/retry behavior, denial, expiry, revocation, audit history
   and recovery when index creation only partially completes.
7. Add negative tests for missing Consent, wrong guardian/subject, altered
   attachment, invalid professional signature and unauthorized controller.
8. Add one live GW v2 lifecycle proving submit, decision, DID/index creation,
   controller binding and exact correlated readback.

This is a documented GW v2 backlog contract, not current SDK capability. No
current MVP method should claim to implement it.

## Immediate Implementation Rule

For the next v2 backend work:

1. keep individual registration based on the current CORE family flow
2. treat legacy product applications only as consumers/references
3. revalidate post-registration subject-index and SMART/token behavior against
   current GW CORE before wiring them as canonical adapters

## Next Validation Step

Before calling the backend profile runtime "done", add live validation that
proves:

1. `loadProfile(...)` backend still materializes the current individual-controller
   facade shape expected by the runtime wrappers
2. `startIndividualOrganization(...)` still works against current GW CORE
3. `confirmIndividualOrganizationOrder(...)` still works against current GW CORE
4. the next subject-index / `Composition` read path still matches current GW CORE
   behavior

Recommended canonical read candidates to validate explicitly before fixing the
public v2 wording:

- `getLatestIps(...)`
- `searchClinicalBundle(...)`

Practical rule for this validation slice:

- do not treat the current read route as final merely because one legacy
  consumer used it
- prove the route against the current GW CORE runtime first
- only then freeze the canonical `loadProfile -> bootstrap -> confirm -> read`
  backend story in docs and examples

That validation should be treated as one actor-profile or actor-dialogue suite,
not as the same thing as the GW CORE platform lifecycle suite.

Current standalone actor-profile entry point:

- [tests/live-profile-runtime-individual.e2e.test.mjs](</Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts/tests/live-profile-runtime-individual.e2e.test.mjs:1>)

If the scenario creates lifecycle-owned resources, the corresponding
`disable` / `purge` steps should be executed at the end of that same scenario
as cleanup.

What still remains is executing that slice from a real terminal/TTY against the
current GW CORE runtime and then freezing the final public read-helper wording
from proven behavior.

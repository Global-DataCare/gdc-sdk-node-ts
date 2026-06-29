# Organization Controller Lifecycle 101

This is the canonical and reproducible guide for the **organization
controller** lifecycle in `gdc-sdk-node-ts`.

Use this guide when you need to prove one narrow contract end to end:

1. onboard a legal organization,
2. optionally materialize additional purchased seats,
3. rebind the **current controller device** with `Organization/_issue`,
4. confirm that purchased seats remain intact,
5. disable the tenant,
6. purge the tenant.

This guide is intentionally **not** about:

- employee creation,
- professional SMART access,
- dialogue/consent,
- clinical ingestion.

Those flows have their own tests and docs. This document stays focused on the
controller lifecycle only.

## What proves this contract

The authoritative executable contract is:

- [../tests/101-organization-controller-lifecycle.test.mjs](../tests/101-organization-controller-lifecycle.test.mjs)

That test proves both onboarding variants:

1. canonical host flow:
   - `Organization/_transaction`
   - `Order/_batch`
2. legacy compatibility flow:
   - `ICA _verify`
   - `Organization/_activate`

And in both variants it then proves:

3. `Organization/_issue`
4. `Token/_exchange`
5. `Device/_dcr`
6. `disableTenant`
7. `purgeTenant`

## Why this test exists

The failure we needed to close was not just “can `_issue` return an activation
code”.

The actual lifecycle invariant is stricter:

- `Organization/_issue` must **reuse** the already-assigned controller seat,
  not consume a random available seat.
- `Organization/_issue` must **not** delete or consume seats purchased after
  the original organization registration.
- the rebind/recovery step must happen **before** tenant disable/purge.

That is why the test explicitly asserts:

- controller activation code returned by `_issue` equals the existing
  controller seat serial number,
- post-`_issue` license inventory equals the expanded inventory from after the
  extra order,
- teardown happens only after `_issue -> _exchange -> _dcr`.

## How to run the reproducible test

From the repo root:

```bash
cd /Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts
npm run build
node --test tests/101-organization-controller-lifecycle.test.mjs
```

Expected result:

- both subtests pass:
  - new `Organization/_transaction` lifecycle
  - legacy `Organization/_activate` lifecycle

## Which SDK surface is used

The test does not use private plumbing. It stays on public runtime helpers and
facades:

- `OrganizationControllerSdk.submitLegalOrganizationVerificationTransaction(...)`
- `HostOnboardingSdk.activateOrganizationInGatewayFromIcaProof(...)`
- `OrganizationControllerSdk.confirmOrganizationLicenseOrder(...)`
- `OrganizationControllerSdk.submitLegalOrganizationIssue(...)`
- `OrganizationControllerSdk.disableTenant(...)`
- `OrganizationControllerSdk.purgeTenant(...)`

If you are building a BFF, these are the methods to copy conceptually.

Technical-slice note:

- `recoverOrganizationControllerWithIssueWithDeps(...)` is still useful inside
  low-level runtime tests because it composes `_issue -> _exchange -> _dcr`
  deterministically.
- Do not teach it as the first public integration surface; app/BFF docs should
  start from `OrganizationControllerSdk` and `HostOnboardingSdk`.

## Minimal sequence for a BFF

### A. Canonical onboarding path

1. `submitLegalOrganizationVerificationTransaction(...)`
2. `confirmOrganizationLicenseOrder(...)`
3. optionally confirm extra post-registration seat orders
4. `submitLegalOrganizationIssue(...)`
5. `Token/_exchange`
6. `Device/_dcr`
7. `disableTenant(...)`
8. `purgeTenant(...)`

### B. Legacy compatibility path

1. `activateOrganizationInGatewayFromIcaProof(...)`
2. `confirmLegalOrganizationOrder(...)` or `confirmOrganizationLicenseOrder(...)`
   depending on the integration surface in use
3. optionally confirm extra post-registration seat orders
4. `submitLegalOrganizationIssue(...)`
5. `Token/_exchange`
6. `Device/_dcr`
7. `disableTenant(...)`
8. `purgeTenant(...)`

## When to use the live runner

If you want a real GW/ICA environment instead of the deterministic runtime
contract test, use the dedicated live controller runner:

```bash
cd /Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts
npm run test:e2e:live-controller-lifecycle
```

That live runner:

- starts local ICA and GW CORE,
- sends `TEST-A4-Antifraud.pdf` by default,
- runs `Organization/_transaction`,
- confirms the returned legal-organization order,
- rebuilds one controller proof `vp_token` from the ICA-issued credentials
  using the deterministic test signer,
- uses that VP as `Authorization: Bearer <vp_token>` for tenant
  `disableTenant(...)` and `purgeTenant(...)`,
- cleans up the host registry afterwards.

Use the live runner when you need to validate:

- real GW routing,
- real ICA `Organization/_transaction`,
- real controller proof bearer validation on tenant lifecycle,
- real host and tenant cleanup ordering.

Shared credential readers now used by the live runner:

- `readLegalOrganizationVerificationCredentialPairFromResponseBody(...)`
- `readLegalOrganizationVerificationTaxIdFromResponseBody(...)`
- `readLegalRepresentativeSameAsFromResponseBody(...)`
- `readLegalRepresentativeBindingFromResponseBody(...)`

If ICA and GW are already running, use the direct entry point instead:

```bash
cd /Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts
LIVE_GW_HOST_VERIFICATION_PDF_PATH=/Users/fernando/GITS/gdc-workspace/examples/TEST-A4-Antifraud.pdf \
BASE_URL=http://127.0.0.1:3000 \
RUN_LIVE_101_ORGANIZATION_CONTROLLER_LIFECYCLE_E2E=1 \
npm run test:e2e:live-controller-lifecycle:direct
```

Do **not** use the live runner as the only contract proof. The deterministic
test remains the baseline because it is reproducible on any machine.

## Relationship to other docs

- For the broader backend/BFF tutorial:
  - [101-SDK_END_TO_END.md](./101-SDK_END_TO_END.md)
- For lower-level integration API notes:
  - [101-SDK_INTEGRATION.md](./101-SDK_INTEGRATION.md)
- For the raw recovery helper contract:
  - [../src/organization-controller-recovery.ts](../src/organization-controller-recovery.ts)

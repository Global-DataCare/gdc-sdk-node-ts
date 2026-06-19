# 101 Live GW Local

This is the canonical live/local reference for running the SDK against a real
local `GW CORE`.

Teaching rule for this `101`:

- start from the exact command order first
- keep local process mode and Docker mode separate
- keep employee smoke meaning separate from the generic live suite

Release-validation order for developers:

1. local process E2E from real TTY
2. local Docker E2E against the built image
3. staging E2E
4. production image/deploy only after staging is green

Use this before asking an AI agent to run live E2E commands, and before running
`npm run test:e2e:101:live-full-cycle`.

Non-negotiable execution rule:

- run the live GW suite from the user's real terminal/TTY
- do not treat an AI agent sandbox as equivalent to the user's shell
- localhost access, Docker access, Firestore/GCS access, and DNS resolution may
  fail inside an agent sandbox even when they work correctly in the user's TTY
- for release validation, the user-terminal result is the authoritative result
- do not accept a sandbox-only result as final validation

Non-negotiable isolation rule:

- never do the final rerun against the same persisted host
- never do the final rerun against the same tenant id
- never do the final rerun against the same individual/subject id
- if a run fails after touching Firestore/GCS state, start the next final run
  with a fresh epoch/run id instead of retrying on top of old state
- the clean final rule is always: new host, new tenant, new individual

## Scope

- `gdc-sdk-core-ts` does not call GW by itself.
- `gdc-sdk-core-ts` owns shared builders, drafts, and capability contracts.
- `gdc-sdk-node-ts` is the canonical runtime package for live GW execution from
  the SDK side.
- `gwtemplate-node-ts` is the local GW process or Docker image you run against.

If you want to prove employee flows against a real local GW, the practical path
is:

1. start `gwtemplate-node-ts`
2. bootstrap the demo tenant
3. run the `gdc-sdk-node-ts` live flow or an employee-focused smoke using the
   same route/base-url values

## Tell The AI Agent Exactly This

When using an AI coding agent, ask it explicitly to run the long-lived GW
process in `TTY` and outside the sandbox.

Be explicit that this applies to both sides:

- GW CORE long-lived process must run in a real TTY
- the `gdc-sdk-node-ts` live E2E command must also run from the user's real TTY
- if the agent cannot leave its sandbox, the user should run the final live
  command directly in their own terminal
- if the first live run fails after creating persisted data, the agent must not
  "rerun" on the same host/tenant/individual identifiers
- the agent must restart the flow with fresh identifiers for the next final run

Use wording like:

- run `npm run api:local-demo` in TTY and keep it open
- run the bootstrap command in a second terminal
- run the live SDK command in a third terminal
- if port `3000` is busy, run `npm run local:close`
- if the Docker host port is busy, run `npm run docker:close`

## Local Process Mode

Final validation discipline:

- for quick local debugging, you may temporarily reuse a local process
- for the final Firestore/GCS validation, do not reuse the same persisted host
- the host id used by GW CORE must be fresh for that execution
- the tenant id used by the SDK must be fresh for that execution
- the individual subject created by the SDK must be fresh for that execution

Free the default local GW port if needed:

```bash
cd /Users/fernando/GITS/gdc-workspace/gwtemplate-node-ts-employee-main
npm run local:close
```

If you need to stop an already-running local API process first, use:

```bash
cd /Users/fernando/GITS/gdc-workspace/gwtemplate-node-ts-employee-main
npm run api:close
```

Start GW CORE locally in TTY:

```bash
cd /Users/fernando/GITS/gdc-workspace/gwtemplate-node-ts-employee-main
npm run api:local-demo
```

Bootstrap the default demo tenant in a second terminal:

```bash
cd /Users/fernando/GITS/gdc-workspace/gwtemplate-node-ts-employee-main
TENANT_ID=acme-id JURISDICTION=ES SECTOR=health-care HOST_NETWORK=test EMPLOYEE_COUNT=3 npm run demo:bootstrap-single-tenant
```

Important:

- with the default bootstrap values, the controller/admin consumes the first
  seat
- `EMPLOYEE_COUNT=2` leaves only one additional employee seat
- `EMPLOYEE_COUNT=3` is the canonical value for the local two-employee lifecycle
  smoke
- `HOST_NETWORK=test` refers to the host runtime/network path segment used
  under `/host/cds-{jurisdiction}/v1/{host-network}`
- the tenant business sector is still the separate `SECTOR=health-care` value

Run the Node SDK live `101` suite in a third terminal:

```bash
cd /Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts
npm run test:e2e:101:live-full-cycle
```

If you want the full host onboarding chain with local ICA verification first,
use the dedicated clean wrapper instead:

```bash
cd /Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts
npm run test:e2e:live-gw:host-transaction:clean
```

What this wrapper adds:

- starts `dataspace-ica-ts` locally on `http://127.0.0.1:3310`
- starts `gwtemplate-node-ts` locally in demo mode on `http://127.0.0.1:3000`
- points GW CORE to the local ICA through `ICA_URL_INTERNAL` / `ICA_URL_EXTERNAL`
- runs the live suite with `RUN_LIVE_GW_E2E_HOST_VERIFICATION_TRANSACTION=1`
- exercises `_transaction -> Order/_batch`

Legacy compatibility path in the same suite:

- keep the same `LIVE professional lifecycle on GW` test
- set `RUN_LIVE_GW_E2E_HOST_VERIFICATION_TRANSACTION=0`
- that skips the new host `_transaction` submit/poll step
- and proves the older `ICA _verify -> Organization/_activate -> Order/_batch` path

Dedicated legacy live command:

```bash
cd /Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts
RUN_LIVE_GW_E2E=1 \
RUN_LIVE_GW_E2E_ACTOR_CHAIN=1 \
RUN_LIVE_GW_E2E_HOST_VERIFICATION_TRANSACTION=0 \
LIVE_GW_E2E_SUITE=professional \
node --test tests/live-gw-node-runtime.e2e.test.mjs
```

Important:

- this path requires both local services to boot correctly
- the legacy `_activate` branch only applies when `RUN_LIVE_GW_E2E_HOST_VERIFICATION_TRANSACTION=0`
- if your local env files differ, override `BASE_URL` / `ICA_BASE_URL` / related env vars explicitly

Signed PDF source for the legal verification step:

- local file mode:

```bash
cd /Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts
LIVE_GW_HOST_VERIFICATION_PDF_PATH=/Users/fernando/GITS/gdc-workspace/examples/TEST-A4-Antifraud.pdf \
npm run test:e2e:live-gw:host-transaction:clean
```

- public URL mode:

```bash
cd /Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts
LIVE_GW_HOST_VERIFICATION_PDF_URL='https://www.dropbox.com/scl/fi/.../TEST-A4-Antifraud.pdf?dl=0' \
npm run test:e2e:live-gw:host-transaction:clean
```

Rules:

- if `LIVE_GW_HOST_VERIFICATION_PDF_URL` is set, the live suite sends the PDF as a remote link attachment
- if `LIVE_GW_HOST_VERIFICATION_PDF_URL` is empty, the live suite falls back to `LIVE_GW_HOST_VERIFICATION_PDF_PATH`
- Dropbox URLs are normalized to direct download mode by forcing `dl=1`
- use the URL mode for real deployed E2E when ICA/GW must fetch the document from the network instead of from local disk

Canonical clean wrapper for final Firestore/GCS validation:

```bash
cd /Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts
RUN_ID="$(date -u +%Y%m%dt%H%M%S)" \
HOST_ID_VALUE="live101-${RUN_ID}-host" \
TENANT_ID="live101-${RUN_ID}" \
TENANT_ROUTE_ID="live101-${RUN_ID}" \
npm run test:e2e:101:live-full-cycle
```

What this direct Node command does:

- keeps the validation entrypoint in the `.mjs` test itself
- lets you provide fresh `HOST_ID_VALUE`, `TENANT_ID`, and `TENANT_ROUTE_ID`
  explicitly from the terminal
- avoids implying that a shell wrapper is the thing proving the SDK contract

## Published Full-Cycle 101

The canonical didactic live walkthrough is now:

- `tests/101-live-full-cycle-bff-runtime.e2e.test.mjs`

That `101` keeps the business conversation in one executable flow:

1. host/tenant activation
2. professional employee provisioning
3. individual-controller profile load
4. individual bootstrap and order confirmation
5. clinical ingestion
6. consent grant
7. professional SMART token request
8. professional read
9. cleanup

Design rules kept by that `101`:

- use public high-level actor facades/profile wrappers for the main steps
- keep the dependency chain explicit: tenant before individual, individual
  before professional read
- avoid inline route plumbing in the main happy path
- keep final cleanup at the end of the conversation lifecycle

One compatibility note remains:

- consent revocation still uses the generic `submitAndPoll(...)` escape hatch in
  cleanup because there is not yet a dedicated high-level revoke helper

Run the same suite with debug artifacts:

```bash
cd /Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts
LIVE_101_FULL_CYCLE_E2E_DEBUG=1 \
npm run test:e2e:101:live-full-cycle
```

## Employee-Focused Smoke Meaning

For employee lifecycle work, the local smoke assumes this sequence:

1. create employee 1
2. create employee 2
3. disable employee 2
4. try to purge both

Expected result:

- purge of employee 1 fails because it is still active
- purge of employee 2 succeeds because it was disabled first

Important limitation of that smoke:

- it is only one slice of the larger live user-dialogue lifecycle
- it does not yet cover extra-seat activation, individual bootstrap, consent
  escalation, professional read retry, or final tenant cleanup

For release-readiness of GW CORE, the target lifecycle is longer:

1. list licenses
2. activate extra seats after the portal-side fictitious payment is confirmed
3. relist licenses
4. create two employees
5. disable and purge only the allowed one
6. bootstrap the individual
7. ingest medication bundle communication
8. ingest full IPS communication
9. grant limited consent
10. verify professional read failure for broader sections
11. broaden consent
12. verify professional IPS read success
13. clean up consent, individual, employees, and tenant

Current public-route boundary:

- `OrganizationControllerSdk.confirmOrganizationLicenseOrder(...)` already
  exists in `sdk-node` as the canonical post-payment business step
- it currently submits through the public host `Order/_batch` route used by GW
  CORE for portal-managed payment confirmations
- what is still missing is the single long live suite that chains this step
  into the full `list -> pay -> confirm -> relist -> employees -> cleanup`
  dialogue

The canonical employee lifecycle/contract details live in:

- [gdc-sdk-core-ts/docs/101-EMPLOYEES.md](https://github.com/Global-DataCare/gdc-sdk-core-ts/blob/main/docs/101-EMPLOYEES.md)

## Docker Local Mode

Build the local GW Docker image:

```bash
cd /Users/fernando/GITS/gdc-workspace/gwtemplate-node-ts-employee-main
./docker_build_local.sh
```

Run the local GW container on the canonical live-test host port:

```bash
cd /Users/fernando/GITS/gdc-workspace/gwtemplate-node-ts-employee-main
HOST_PORT=8000 FORCE_RECREATE=true ./docker_run_local.sh
```

Free that host port when needed:

```bash
cd /Users/fernando/GITS/gdc-workspace/gwtemplate-node-ts-employee-main
npm run docker:close
```

Bootstrap the same tenant against Docker:

```bash
cd /Users/fernando/GITS/gdc-workspace/gwtemplate-node-ts-employee-main
BASE_URL=http://localhost:8000 TENANT_ID=acme-id JURISDICTION=ES SECTOR=health-care HOST_NETWORK=test EMPLOYEE_COUNT=3 npm run demo:bootstrap-single-tenant
```

Run the SDK live suite against Docker:

```bash
cd /Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts
BASE_URL=http://127.0.0.1:8000 npm run test:e2e:live-gw
```

## Practical Boundary

Use this document when you need:

- the exact local commands
- the exact order of terminals
- the exact stop/close commands
- the bridge between `sdk-core` employee contracts and real GW execution

Use `101-EMPLOYEES.md` when you need:

- employee bundle semantics
- lifecycle rules
- search keys
- historical identity behavior after `purge`

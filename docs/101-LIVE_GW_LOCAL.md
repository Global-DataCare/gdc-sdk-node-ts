# 101 Live GW Local

This is the canonical live/local reference for running the SDK against a real
local `GW CORE`.

Teaching rule for this `101`:

- start from the exact command order first
- keep local process mode and Docker mode separate
- keep employee smoke meaning separate from the generic live suite

Use this before asking an AI agent to run live E2E commands, and before running
`npm run test:e2e:live-gw`.

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
TENANT_ID=acme-id JURISDICTION=ES SECTOR=health-care HOST_REGISTRY_SECTOR=test EMPLOYEE_COUNT=3 npm run demo:bootstrap-single-tenant
```

Important:

- with the default bootstrap values, the controller/admin consumes the first
  seat
- `EMPLOYEE_COUNT=2` leaves only one additional employee seat
- `EMPLOYEE_COUNT=3` is the canonical value for the local two-employee lifecycle
  smoke

Run the Node SDK live GW suite in a third terminal:

```bash
cd /Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts
npm run test:e2e:live-gw
```

Canonical clean wrapper for final Firestore/GCS validation:

```bash
cd /Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts
npm run test:e2e:live-gw:clean
```

What this wrapper does:

- generates one fresh epoch/run id
- derives a fresh `HOST_ID_VALUE`
- derives a fresh `TENANT_ID`
- starts `gwtemplate-node-ts` first
- waits for `http://127.0.0.1:3000/host/ping`
- runs the SDK live suite with the same run seed
- stops the local GW process on exit

What this wrapper does not change:

- it still must run from a real user terminal/TTY
- it must not be treated as a sandbox-safe command
- if you want to override ids manually, you still can, but the default path is
  to let the wrapper generate them

## Next 101 To Build After Publish

Do not lose this scope when the current live suite is already green and
published.

The next Node `101` must be a didactic, step-by-step walkthrough that explains
each user action and each resulting API job clearly.

Non-negotiable design rules for that next `101`:

- use the public high-level user facades for each actor type
- route async work through the `JobManager` abstraction agreed for the SDK side
- send requests through the virtual/public API surface, not by assembling route
  plumbing inline in the spec
- prefer bundle editor, bundle viewer, consent view model, and actor-specific
  facades instead of raw `Bundle.entry` manipulation inside the test
- model user conversations, not disconnected technical subflows
- explain each step in JSDoc and docs:
  - what the user is doing in the UI
  - what gets attached or submitted
  - what the GW job is expected to do
  - what the next actor is allowed to view or not view
- keep final cleanup at the end of the conversation lifecycle

The current live suite is allowed to stay more pragmatic so it can prove the
runtime and unblock publish. The next `101` is where the fully explanatory,
facade-first, `JobManager`-driven version must live.

Do not downgrade this requirement:

- this third terminal is the canonical place to validate the live suite
- if an agent-run sandbox gives different connectivity results, trust the real
  terminal run instead

Run the same suite with debug artifacts:

```bash
cd /Users/fernando/GITS/gdc-workspace/gdc-sdk-node-ts
RUN_LIVE_GW_E2E_IPS_INGESTION=1 \
LIVE_GW_NODE_E2E_DEBUG=1 \
npm run test:e2e:live-gw
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
BASE_URL=http://localhost:8000 TENANT_ID=acme-id JURISDICTION=ES SECTOR=health-care HOST_REGISTRY_SECTOR=test EMPLOYEE_COUNT=3 npm run demo:bootstrap-single-tenant
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

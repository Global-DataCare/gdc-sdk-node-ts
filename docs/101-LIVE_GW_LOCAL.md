# 101 Live GW Local

This is the canonical live/local reference for running the SDK against a real
local `GW CORE`.

Teaching rule for this `101`:

- start from the exact command order first
- keep local process mode and Docker mode separate
- keep employee smoke meaning separate from the generic live suite

Use this before asking an AI agent to run live E2E commands, and before running
`npm run test:e2e:live-gw`.

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

Use wording like:

- run `npm run api:local-demo` in TTY and keep it open
- run the bootstrap command in a second terminal
- run the live SDK command in a third terminal
- if port `3000` is busy, run `npm run local:close`
- if the Docker host port is busy, run `npm run docker:close`

## Local Process Mode

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

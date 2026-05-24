# Security

## Scope

`gdc-sdk-node-ts` is the target Node runtime package for:

- backend services
- BFF layers
- Cloud Functions / serverless handlers
- worker processes

It is not yet the full migrated replacement for `dataspace-client-sdk-node`, but its security posture is already defined here.

## Security principles

### 1. Actor-scoped runtime sessions

Node runtime sessions must be actor-scoped:

- `organization_controller`
- `organization_employee`
- `individual_controller`
- `individual_member`
- `professional`

Composite descriptors are allowed as input, but runtime sessions must be built from actor-filtered facades.

The package now also exposes actor-scoped orchestration facades through:

- `GdcHostOnboardingSdk`
- `GdcOrganizationControllerSdk`
- `GdcOrganizationEmployeeSdk`
- `GdcIndividualControllerSdk`
- `GdcIndividualMemberSdk`
- `GdcProfessionalSdk`

Those facades must remain narrower than a catch-all client surface.

### 2. Defensive filtering

Even if an upstream facade is malformed, the Node bridge must re-filter capabilities per actor before creating the runtime session.

Reason:

- avoids privilege widening through bad composition
- avoids accidental “union of everything” bugs
- keeps backend controller/member/professional surfaces distinct

This applies both when:

- expanding a composite session descriptor
- accepting an already-built facade descriptor

### 3. Public clients should not call ICA directly

Recommended production posture:

- public mobile/web clients call a BFF or Cloud Functions layer
- that backend layer talks to ICA and GW
- ICA `_verify` and GW `_activate` should not be coupled directly to the public app surface

This is especially relevant for:

- Expo/mobile apps
- portal web clients
- Firebase-authenticated frontends

### 4. Trust configuration is operator policy

If Firebase or another OIDC provider is used, the operator/backend must explicitly trust that issuer/project before accepting those tokens for privileged flows.

This package should assume:

- token trust is backend-configured
- operator policy decides accepted issuers/audiences/projects
- frontend possession of a token is not enough by itself

### 5. Release and execution safety

Operational reminder from current delivery practice:

- `git push`, `npm publish`, and service-starting scripts must be treated as privileged/outside-sandbox operations
- secure/live E2E that use local TCP listeners or real credentials should run only in the appropriate host context

### 6. Migration seam must stay explicit

`GdcNodeRuntimeClient` is intentionally the seam between:

- new role-scoped orchestration in `gdc-sdk-node-ts`
- legacy implementation details still living in `dataspace-client-sdk-node`

Do not hide this seam by reintroducing a giant undifferentiated client surface in the target package.

### 7. Async orchestration semantics must converge here

Shared backend orchestration behavior such as:

- `submitAndPoll`
- `pollUntilComplete`
- timeout and retry-after interpretation
- simple-order payload construction and poll-option normalization

should converge toward helpers owned by `gdc-sdk-node-ts`, even while the concrete HTTP client still lives in the legacy package.

This reduces the risk of behavioral drift between old and new role-scoped runtimes.

### 8. Live test artifacts must stay local

Live GW validation can now write:

- `test-results/live-gw-node-runtime-debug-*.jsonl`
- `test-results/live-gw-http-trace-*.jsonl`

These files are execution artifacts and must remain excluded from git.

During migration, they are useful because they let maintainers compare:

- facade-level behavior in `gdc-sdk-node-ts`
- transport/runtime behavior still provided by `dataspace-client-sdk-node`

## Current migration status

- Source implementation still lives mainly in `dataspace-client-sdk-node`
- This package is the destination and should accumulate runtime logic incrementally
- During migration, duplicated rules must converge toward `gdc-sdk-core-ts`

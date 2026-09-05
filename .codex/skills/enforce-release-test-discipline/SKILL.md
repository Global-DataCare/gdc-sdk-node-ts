---
name: enforce-release-test-discipline
description: Enforce branch, TDD, fixture, test-layer, product-neutrality, changelog, semantic-version, npm publication, deployment and merge discipline across GW CORE, shared gdc SDKs and product portals. Use for every behavior fix, flow change, test or 101 example, documentation contract, shared-package release, portal dependency promotion, App Hosting rollout, or request to ship with branch, patch, changelog and merge to main.
---

# Enforce Release and Test Discipline

## Start on a branch

1. Read the repository `AGENTS.md` and applicable product/contract skill.
2. Inspect the worktree and preserve unrelated user changes.
3. Update local knowledge of the remote, start from the intended current base,
   and create a named branch before editing.
4. Never implement or commit directly on `main`. If that already happened,
   disclose it; do not rewrite published history to manufacture a merge.
5. Treat the branch as one indivisible patch release. Do not open the next fix
   or feature branch until this branch has changelog, package and lockfile patch,
   green no-skip gates, commit/push, verified npm publication, exact downstream
   pins, explicit merge commit, pushed `main`, matching refs and a clean tree.

## Write the contract test first

- Use red-green-refactor for every behavior or flow change. Run the smallest
  executable test and retain the intended failure before implementation.
- Make this the first physical line of every new or modified test file:
  `// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.`
- Import synthetic identities, routes, DIDs, tokens, codes, dates and other
  governed examples from the canonical shared test-data/example module.
  Prefer the applicable `*-data-utils-ts` package or
  `gdc-common-utils-ts/examples`; add a missing fixture there once instead of
  repeating a local literal.
- Import defined enums, constants, claim names, resource types, transport
  profiles and HTTP methods from their owning package. Never restate their wire
  strings merely to make a test pass.
- Literal values are allowed only when the literal itself is the behavior under
  test, such as malformed input or an exact serialization assertion. State
  that reason beside it.

## Keep test layers separate

- High-level `101`, documentation snippets and E2E journeys use only public
  application/SDK facades and assert user-visible or contract-visible results.
  They must not provision wallets, decode compact JOSE, record raw fetch calls,
  construct internal routes, inspect queues/vaults or instantiate transport
  adapters.
- Put algorithm and helper behavior in unit tests.
- Put HTTP serialization, encrypted transport, persistence adapters and route
  boundaries in focused integration tests.
- Put complete cross-system behavior in numbered E2E journeys with explicit
  authorization and persistence invariants. Mocks never count as boundary
  proof.
- An asynchronous HTTP `200` or `201` proves only submit/poll transport
  completion. It is never sufficient evidence of business success. Use
  `BundleReader.getResponseAnalysis()` through the repository's shared test
  assertion, require `hasErrors === false` and the expected successful
  operation count. Negative journeys must instead require the exact terminal
  `OperationOutcome`; never traverse `data[]`, `entry[]` or `issue[]` manually
  in a high-level E2E, portal BFF or telephone-service test.
- Do not make high-level examples green by embedding internal plumbing. Move
  that proof to the correct lower-level suite and leave the high-level example
  copyable.

## Preserve the release-gate order and identity boundary

- Use `test -> local-network -> test-network -> network`. Finish package tests
  and real-local-GW SDK E2E before building an image or exercising a staging
  portal. Final release evidence must contain zero skipped live E2E cases;
  selectors register only the journeys actually selected.
- Publish shared changes from the lowest dependency upward. Verify each exact
  npm version and integrity from a clean install before pinning it in the next
  package or deployable consumer. A local tarball may support only the bounded
  provisional workflow below; it never satisfies a registry release gate.
- Apply the terminal-Bundle rule identically in GWs, portal BFFs, Node
  telephone services, SDKs and utils. Product skills may add resource/capability
  boundaries but must never weaken this common template invariant.
- DIDComm `from` is a sender DID, JWT `iss` is the signing entity, `kid` is a
  concrete key DID URL, and SMART `sub` is the authorized actor. They may share
  one actor DID in a direct flow, but their roles never collapse.
- Native FHIR `Communication` or `Bundle` input never receives DIDComm identity
  fields. HTTP Authorization proves the caller and `Communication.sender`
  remains a business participant reference.
- For generated clinical content, resolve `Composition.author` and attesters
  from the protected registered creator binding. Member/controller content may
  use one RelatedPerson as both author and attester; professional content uses
  the jurisdictional CDS legal-organization URN as author and PractitionerRole
  as attester. The legacy closed `owner | creator` BFF choice is compatibility
  only. Never accept arbitrary provenance from a UI.
- Keep `docs/101-BFF_CLINICAL_WRITES.md`, the GW CORE authenticated-authorship
  101, public JSDoc, test flow comments, snippets, README summaries and the
  repository-local provenance skill mutually linked and synchronized.
- Clinical evidence and consent ledger routing are GW manager policy. Node
  SDKs, BFFs, portals and deployment environments never accept, expose or
  configure channel or smart-contract names. Their high-level contract ends at
  the authenticated operation and returned transaction/CID/version evidence.

## Preserve shared-package neutrality

- Never place a product name, branded hostname, product route or product policy
  in GW CORE or a shared `gdc-*` package, including tests, examples, docs,
  comments and changelogs.
- Use neutral shared fixtures and enforce the rule with a repository check.
- Keep product-specific names and behavior only in the owning product repo.

## Release the complete change

Mandatory final order: push the branch, run `npm publish` from that branch,
verify the registry artifact and clean installation, merge to `main`, push
`main`, and delete the branch.

1. Update the owning changelog with tested behavior. Shared changelogs remain
   product-neutral.
2. Run focused tests, affected integration/E2E tests, full tests, typecheck,
   build and neutrality/skill checks required by the repository.
3. Commit on the branch and push the branch.
4. For a reusable bug fix, publish the next immutable patch version from that
   branch in a real TTY. Verify `npm view <package>@<version>`, integrity, the
   `latest` tag, clean registry installation and exported surface.
5. Merge the verified branch into `main` with an explicit merge commit unless
   repository policy requires a PR merge. Push `main`, delete the branch, and
   verify both remote refs and a clean worktree.
6. Pin deployable consumers to the exact registry version and update their
   lockfiles. Never substitute GitHub, `file:`, workspace or vendored tarball
   dependencies for a released package.
7. Verify the actual deployment/revision and live boundary before reporting
   completion.

Report separately: branch, commit, pushed branch, merge commit, pushed
`main`, package version/integrity, consumer pin, deployment and live result.

## Mandatory release authorization continuity

For any release chain that requires npm authorization, make at most three
attempts and keep each command session and browser window alive for up to five
minutes. Never end the turn or imply continued work while a window is pending.
After all three attempts fail, an immutable `npm pack` tarball may be used only
to prepare a downstream consumer and continue local tests; never commit a
`file:` dependency. The registry dependency must publish and its exact npm
version must be reinstalled and verified before the consumer may publish, merge
to `main`, build an image, or deploy. Final order remains: push the branch,
run `npm publish` from it, verify, merge to `main`, push and delete the branch.

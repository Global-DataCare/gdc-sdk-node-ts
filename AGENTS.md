# AGENTS.md

## Mandatory TDD

Use red-green-refactor TDD for every behavior or flow change. Write and run the
smallest executable contract test first; it must fail for the intended reason
before implementation begins. Then implement the minimum change and make
focused, integration and affected end-to-end tests green. Begin every new or
modified test suite with a flow-contract comment. Begin every Playwright or
other E2E file with the complete numbered journey and its authorization and
persistence invariants. Mocks may isolate units but never replace real boundary
proof. Never make a test green by accepting an incomplete terminal state.

## Non-negotiable branch and publication closure

One branch is one indivisible patch release. Before opening another fix or
feature branch, require red-green evidence, all affected tests with zero skips,
`CHANGELOG.md`, a semantic patch in package and lockfile, branch commit/push,
verified npm publication, exact downstream consumer pins, explicit merge commit
to `main`, pushed `main`, matching refs and a clean worktree.

Publish changed shared packages from the lowest dependency upward. A consumer
may advance only after `npm view`, integrity and clean-install verification of
the exact dependency version. Then run `test -> local-network -> test-network
-> network`; no later stage substitutes for an earlier one. Never defer a
version, publication or consumer pin while starting the next branch.

# TODO - gdc-sdk-node-ts

## NOW
1. Convert every lifecycle-oriented `101` happy path to the canonical layered teaching contract:
   - `gdc-common-utils-ts` owns the first reusable high-level helper/editor/request builder
   - `gdc-sdk-core-ts` owns the actor/sector facade that consumes those helpers
   - `gdc-sdk-node-ts` only adapts runtime execution, route binding, and submit/poll
   - no primary `101` may start from raw GW payloads, inline VC/VP literals, or transport-shaped request bodies
   - no primary `101` may force integrators to understand `body.*`, `_batch`, `_search`, attachments arrays, or low-level claim paths before the high-level flow works end to end
2. Execute the current lifecycle `101` refactor backlog in this order:
   - legal organization onboarding/activation:
     move the current high-level draft path fully into `gdc-common-utils-ts` and keep `tests/101-live-full-cycle-bff-runtime.e2e.test.mjs` limited to chainable onboarding methods plus actor facades
   - professional SMART/IPS access:
     add shared high-level helpers in `gdc-common-utils-ts` for retrieving the hosted employee credential, preparing one professional SMART VP request, and preparing KMS-signature input for the BFF happy path
   - professional/runtime facade:
     add the corresponding neutral `sdk-core` facade methods so app/backend code can request one professional SMART token without assembling VP payload plumbing inline
   - individual/controller happy path:
     keep the individual-controller lifecycle `101` focused on high-level editors/facades and move any remaining raw claim/payload shaping down into `common-utils`
   - discovery/default-first path:
     keep `101` discovery tests centered on one resolver facade and move catalog parsing/did-document detail behind shared helpers
3. Definition of done for the lifecycle `101` refactor:
   - each primary `101` reads top-down as one production happy path for portal/BFF/backend integrators
   - each high-level step exists first in `gdc-common-utils-ts`, then in one neutral `sdk-core` facade, and only then in `sdk-node`
   - tests may still cover low-level payload builders separately, but those are not the first didactic path
   - live/e2e `101` suites may accept env overrides, but their default copy/paste path must use named high-level helpers instead of hand-built VC/VP/request payloads
   - every new high-level helper has one matching `101`-style test or doc anchor in its owning package
   - the canonical top-level programming model is `loadProfile(...) -> unlock with PIN/secret -> session -> actor facade -> common-utils helpers`
   - the same top-level model must work for browser/frontend, backend/BFF, and conversational/assisted channels; only the runtime adapter changes
   - `profile`/`session` is the top-level integration entrypoint, while employee/consent/IPS/medication editors and viewers remain owned by `common-utils`
4. Track the concrete node-repo surfaces that must be rewritten to follow that rule:
   - `tests/101-live-full-cycle-bff-runtime.e2e.test.mjs`
   - `tests/101-backend-profile-runtime.test.mjs`
   - `tests/101-individual-controller-backend-runtime.test.mjs`
   - `tests/101-default-first-dataspace-discovery.test.mjs`
   - `tests/101-dataspace-resolver.test.mjs`
   - `docs/101-SDK_END_TO_END.md`
   - `docs/101-SDK_INTEGRATION.md`
   - `docs/101-LIVE_GW_LOCAL.md`
5. Mirror backlog that must be closed upstream before this repo can stay thin:
   - `gdc-common-utils-ts`: hosted employee credential retrieval helper, professional SMART VP preparation helper, KMS-signature preparation helper, and any remaining lifecycle editors/builders still missing for the primary `101` paths
   - `gdc-sdk-core-ts`: actor/sector facades for those shared helpers so runtime packages do not invent package-local teaching APIs
   - `gdc-sdk-core-ts`: keep the `profile -> session -> actor facade` contract as the canonical top-level developer model, reusing `common-utils` editors/readers/viewers under each actor capability surface
   - do not add those reusable high-level abstractions directly in `sdk-node`
6. Add node-runtime orchestration for the individual-member licensing/invitation flow by reusing the employee-style license issue pattern where applicable.
7. Add a canonical backend-facing method for resolving active related profiles from GW/index data.
8. Close the gap between runtime capabilities already implemented and facade methods actually exposed:
   - `searchOrganizationEmployees(...)` is exposed from `OrganizationControllerSdk`
   - keep controller-only lifecycle/search methods aligned across runtime client and actor facades
   - avoid forcing callers to bypass facades and call low-level runtime methods directly
9. Add backend-facing license search/list orchestration on top of the shared common-utils builders:
   - submit/poll wrappers for license search
   - filters for `status`, `subjectId`, `email`, `role`, `userClass`, and `type`
   - business summaries for contracted / used / free seats
   - controller-friendly DTOs instead of raw GW storage records
10. Add backend-facing host/tenant `Offer` and `Order` high-level helpers where app code still has to assemble request bodies manually:
   - accept-offer order helpers
   - order/offer lookup helpers
   - response parsing helpers for `offerId`, payment URL, activation code, and seat summary
11. Keep portal/BFF integrations thin:
   - backend endpoint exposes business DTOs
   - node SDK hides GW route, submit/poll, and claim-resolution details
12. Document baseline individual-seat semantics:
   - first seat auto-consumed by controller
   - default free 2-seat bundle
   - payment flow only for future paid expansions, not the baseline
13. Add backend-facing consent-management orchestration on top of GW contracts:
   - list/search grouped consents for frontend views
   - preview grouped consent -> atomic rules before submit
   - submit create/update/disable/enable/delete consent operations once GW routes are stable
   - expose filtering helpers for `email`, `phone`, and `did:web` actor selectors
14. Add backend-facing `RelatedPerson` query helpers for UI/BFF layers:
   - active related profiles
   - professional invitation/contact records
   - emergency-contact records
   - individual/family contact records
15. Add backend-facing clinical-import helpers for "Agregar datos":
   - prepare import draft payloads with `section`, `clinical date`, `code.display`, and target resource family
   - hide GW route/path and submit-poll details for document ingestion
   - keep enough metadata for later FHIR R4 / IPS consolidation requests
16. Add backend-facing unified-view / IPS helpers:
   - query/filter consolidated resources by section
   - query/filter consolidated resources by clinical date/date range
   - expose `code.text` and narrative/XHTML availability in business DTOs
   - generate fallback render DTOs when XHTML must be derived from `meta.claims`
   - add one high-level bundle summary helper suitable for assisted-channel/web/app menus:
     medication count, condition count, allergy count, note count, narrative/XHTML count
   - keep explicit room for future localized XHTML generation when a resource lacks `text.div`
17. Add dataspace resolver abstraction and BFF-oriented discovery DTOs:
   - `resolveHostingOperators(...)`
   - `resolvePublishedProviders(...)`
   - host-catalog-driven provider discovery for individuals
18. Follow `docs/101-DISCOVERY.md` for the current dataspace discovery guide.
19. Align the backend/profile `101` surface with real multi-channel flows:
   - keep one generic source of truth for menu-oriented assisted-channel contracts
   - keep one generic source of truth for menu/field runtime behavior
   - `docs/101-PROFILE-ORCHESTRATION.md` is the current map of which `gdc-common-utils-ts` `101` owns each high-level editor/viewer/builder and how profiles must be chained in `sdk-node`
   - add one `101` path for individual-controller menu use cases:
     load protected profile, list related/managed individuals, choose one by array item or alias, read section summaries, edit medications through high-level editors
   - add one `101` path for professional menu use cases:
     load protected profile, request SMART access, search one document/bundle, summarize sections, read XHTML/narrative when present
   - channel apps must stay thin:
     web/mobile/backend/conversational clients should consume these facades, not rebuild GW payloads
20. Rewrite the backend/profile `101` tests by importing the teaching sequence from existing `common-utils` `101` files instead of inventing fresh slices:
   - onboarding: `101-individual-onboarding-claims.test.ts`
   - legal tenant activation: `101-legal-organization-onboarding-editor.test.ts`
   - employee lifecycle/directory: `101-employee-examples.test.ts`
   - new clinical data / vital signs: `101-vital-sign-entry-editor.test.ts`
   - professional access consent: `101-consent-template-bundle-editor.test.ts`
   - administrative billing role: `101-invoice-claims.test.ts`
21. Split the new `profile workspace` surface by real actor responsibility before expanding it further:
   - `OrganizationControllerProfileWorkspace`
     only tenant/organization responsibilities:
     employees, licenses, commercial orders, tenant lifecycle
   - `IndividualControllerProfileWorkspace`
     subject/family responsibilities:
     consent bundles, related profiles, clinical data editing/import, section summaries
   - `ProfessionalProfileWorkspace`
     professional responsibilities:
     SMART request preparation, IPS/clinical request preparation, response processing, in-memory bundle/index cache
   - optional future `AdministrativeEmployeeProfileWorkspace`
     billing/invoice/admin workflows when that role is modeled explicitly
22. Remove misplaced helpers from the wrong actor workspace:
   - `consentTemplate(...)` must not live under `OrganizationController`
   - generic `invoiceEditor(...)` must not live under `OrganizationController` unless it is explicitly tenant commercial billing
   - move subject consent editing under `IndividualControllerProfileWorkspace.subject.consents...`
   - move subject clinical editing under `IndividualControllerProfileWorkspace.subject.clinicalData...`
23. Keep the intended ergonomic surface for tomorrow's integration work:
   - examples to converge toward:
     `profileOrganizationController.organization.employees.create(...)`
     `profileOrganizationController.organization.licenses.purchase(...)`
     `profileIndividualController.subject.consents.bundleEditor(...)`
     `profileIndividualController.subject.clinicalData.prepareRequestBundleIps.new(...)`
     `profileHealthcareProfessional.subject.use(subjectId).prepareRequestBundleIps.new(...)`
     `profileHealthcareProfessional.subject.use(subjectId).processResponseBundleIps(...)`
   - keep request preparation, response processing, and cache/vault access explicit and chainable
24. Rework the current experimental workspace prototype into the actor split above:
   - current file: `src/profile-workspace.ts`
   - keep `IndividualBundleVault + VaultMemRepository` as the in-memory cache basis
   - retain the IPS request helpers from `communication-bundle-document-request.ts`
   - retarget the `101` tests so they use the correct actor workspace instead of mixed-role shortcuts
25. Add one explicit note to the future `101` tests:
   - `sdk-node` should orchestrate protected profiles and actor transitions
   - `common-utils` should still own the chainable business editors/viewers
   - no new mixed-role catch-all API should be introduced just to make the tutorial shorter
26. Normalize orchestration test route stubs so every test-visible GW path matches the canonical runtime route shape:
   - do not use shortened placeholders such as `/individual/offer/_search`, `/dt/api/_batch`, `/exchange`, `/dcr`, `/submit`, or `/poll` when the test is teaching or asserting one GW route contract
   - prefer one local helper such as `gwV1Path(...)` or the same route-building logic used by `RuntimeClient`
   - keep the section / format / resourceType / action segments explicit so humans, auditors, and AI tools do not infer fake public routes from test doubles
   - concrete cleanup targets still pending after `tests/resource-operations.test.mjs`:
     - `tests/device-activation.test.mjs`
     - `tests/organization-controller-recovery.test.mjs`
     - `tests/101-organization-controller-lifecycle.test.mjs`
     - `tests/individual-start.test.mjs`
     - `tests/individual-onboarding.test.mjs`
     - `tests/host-onboarding.test.mjs`

## NEXT
1. Add BFF-oriented examples for endpoints such as `GET /api/personal/related-profiles`.
2. Add tests for mapping active relationship projections from normalized `RelatedPerson` claims.
3. Add dataspace resolver tests fed by semantic/common discovery DTOs rather than ad hoc local parsers.
4. Add examples for consent-management view APIs and clinical-import draft submission APIs.
5. Add examples for unified-view / IPS filter and render APIs.

## LATER
1. Support optional proxy/re-encryption execution mode without changing the high-level backend API surface.

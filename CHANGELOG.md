# Changelog

## Unreleased

## 2.4.8 - 2026-08-16

- Use the employee's existing stable `urn:multibase:z...` actor identifier as
  the namespace for their personal digital-twin workset tags. The workset code
  remains user-defined; role and organization are not embedded in the tag.
- Remove the organization-DID-path tag-system helper introduced in 2.4.7.
  Digital-twin selections keep opaque FHIR identifiers and do not reintroduce
  the non-FHIR `urn:gdc:digital-twin-selection` branch model.

## 2.4.7 - 2026-08-16

- Make the DigitalTwinSdk 101 explicit and copyable: show the complete tenant
  route context and use shared section, medication, Composition-claim, and
  digital-twin search-parameter constants instead of opaque fixtures or raw
  claim strings.
- Define the workset tag contract in code: its `system` is derived from the
  hosted organization DID, its descriptive `code` is chosen by the employee,
  and private ownership remains bound to the authenticated
  `Composition.author`.
- Remove invented ACME research/status namespaces from the 101 and executable
  digital-twin tests.

## 2.4.6 - 2026-08-16

- Remove the invented `Composition.branch` and `Composition.branch-version`
  claims from digital-twin working selections. Saved worksets now use the
  standard `Composition.identifier`, `subject`, and `author` claims plus
  ledger-safe `meta.tag` coding metadata.
- Bind digital-twin workset searches and writes to the verified hosted
  employee DID, add opaque selection identifiers, provide an
  explicit public-alias-to-operational-DID boundary, and reuse shared DID test
  fixtures in the executable 101.
- Publish `DigitalTwinSdk` with SMART token acquisition, coded digital-twin
  search, and `ResearchSubject/$summary` materialization over the GW public
  asynchronous routes.
- Expose the research facade from organization-employee and professional actor
  sessions, carrying the fetched SMART bearer into subsequent reads.
- Add researcher-owned digital-twin working selections through
  `DigitalTwinSdk.saveSelection(...)`, with ledger-safe organization-defined
  tags and exact `Composition.meta-tag=system|code` workset recovery.
- Return normalized `total` and `matches[]` from `DigitalTwinSdk.search(...)`;
  retain the nested GW submit/poll envelope only as `operation` for diagnostics.
- Add one executable DigitalTwinSdk 101 covering SMART access, coded search,
  tagged selection persistence, reopen-by-tag, and materialization.
- Clarify that `generateDigitalTwinFromSubjectData(...)` is an explicit
  study/transfer operation; routine clinical ingestion is projected by GW.

## 2.4.5 - 2026-08-16

- Consume Common Utils 2.5.7 and use
  `organizationTestNetworkCredential` as the sole Test Network admission VC
  transport field. No authorization-named compatibility alias is exposed.
- Document the BFF reissue projection explicitly: persist organization,
  representative and service-controller VCs independently while GW owns only
  its tenant/controller projection.

## 2.4.4 - 2026-08-16

- Sign the Test Network-only `OrganizationTestNetworkCredential` and the
  reviewer-issued `OrganizationCredential`, `LegalRepresentativeCredential`
  and `ServiceControllerCredential` set with detached ML-DSA-65 proofs. Remove
  the ambiguous registration-authorization signing API.
- Remove test imports from sibling Common Utils and SDK Core `dist` paths; all
  SDK tests now consume the published package exports used by applications.

## 2.4.3 - 2026-08-13

- Add organization-controller operations for issuing an existing employee
  seat's bounded multi-device activation credential and revoking one selected
  device without releasing the seat.
- Add high-level employee provisioning, lifecycle listing and invited-employee
  enrollment orchestration. Explicit client installation ids now distinguish
  two DCR devices without changing the employee seat identity.

## 2.4.2 - 2026-08-13

- Define the canonical ICA controller proof as `ServiceControllerCredential`:
  `credentialSubject.owner.additionalType = RESPRSN` carries tenant authority,
  while `owner.hasOccupation.occupationalCategory` carries the ISCO code.
- Align lifecycle examples and tests on `data[].resource.meta.claims`;
  entry-level `meta.claims` is only a deprecated read fallback.
- Add a Swagger-to-SDK controller flow map, explicit canonical/legacy
  credential decision table and JSDoc; document canonical organization
  response claims at `data[].resource.meta.claims`.
- Require the live controller VP fixture to carry the ICA-issued
  `ServiceControllerCredential` alongside the organization and legal
  representative credentials, and document separate `RESPRSN` authority plus
  ISCO occupation defaults (`1120` for the representative and `1330` for the
  technical controller when the signed PDF provides no explicit occupation).
- Extend the local ICA/GW controller lifecycle E2E through the real
  `Organization/_issue -> Token/_exchange -> Device/_dcr` sequence. The fixture
  provisions the initial self-invited controller License from
  `Organization.numberOfEmployees` and reuses that actor-bound seat.
- Preserve the runtime-client receiver when
  `OrganizationControllerSdk.submitLegalOrganizationCredentialReissuance(...)`
  delegates to the canonical method or its deprecated alias.
- Document the minimum signed-PDF evidence required for the separate
  different-email legal-representative and technical-controller E2E fixture.

## 2.4.1 - 2026-08-11

- Consume `gdc-common-utils-ts@^2.5.1` from npm so organization-controller and
  registration-authorization imports never depend on a sibling workspace link.
- Correct the organization-controller lifecycle documentation and JSDoc:
  `Organization/_issue` returns ICA credentials in `vc[]`, preserves the raw
  ICA response separately, and exposes the License activation code only in
  `meta.claims`; `License:Issued` remains a legacy reader fallback rather than
  the canonical organization response.
- Add Node/BFF signing of an organization registration authorization VC with
  the already-unlocked profile wallet and detached ML-DSA proof.
- Add typed high-level methods for neutral FHIR R5 `SubscriptionTopic` and
  tenant/exact-subject `Subscription` registration through GW CORE, including
  canonical path builders and submit/poll orchestration.


## 2.4.0 - 2026-08-09

- Consume Common Utils 2.4.0 for the neutral FHIR R5 Subscription and
  multi-device seat contracts.
- Send the stable DCR `client_instance_id` during `Token/_exchange` so one
  licensed seat can safely enroll two portal/device installations for the same
  authenticated user.
- Document the GW CORE-owned SubscriptionTopic catalog, handshake activation,
  encrypted notification outbox and endpoint-host allowlist.

- Document the neutral FHIR R5 Subscription, DCR application identity, and
  per-device push fan-out boundaries for integrators.

## 2.3.29 - 2026-08-09

- Add `submitLegalOrganizationCredentialReissuance(...)` as the canonical SDK
  name for the existing-tenant credential reissuance flow. Keep
  `submitLegalOrganizationIssue(...)` as a deprecated compatibility alias for
  the underlying `Organization/_issue` route.
- Consume Common Utils 2.3.29.

## 2.3.28 - 2026-08-05

- Consume Common Utils 2.3.28 and SDK Core 2.3.18 so Node consumers use only
  canonical `<ResourceType>.<concrete-param>` FHIR API claim names.

## 2.3.27 - 2026-08-05

- Consume Common Utils 2.3.27 and SDK Core 2.3.17 so Node applications can
  round-trip the complete structured IPS claims and hydrate clinical viewers
  and editors from canonical `org.hl7.fhir.api` search-parameter claims.

## 2.3.26 - 2026-08-04

- Add `periodEnd` to `grantProfessionalAccess(...)` and
  `respondToProfessionalAccessRequest(...)`, persisting the requested
  temporary-access deadline as the signed `Consent.period-end` claim.

## 2.3.25 - 2026-08-03

- State explicitly that the current professional Consent/SMART lifecycle only
  targets subjects whose onboarding has already generated a canonical DID.
- Plan the separate GW v2 delegated-onboarding contract: professional-signed
  request, attached Consent signed by the individual or legal guardian,
  canonical DID/index creation and controller binding with auditable
  correlation and negative-test requirements.

## 2.3.24 - 2026-08-03

- Clarify in runtime JSDoc, professional/end-to-end 101 docs and executable
  tests that actor facades submit `Communication/_batch`; `Subject/$summary`,
  `Subject/_search` and `Bundle/_search` are internal or compatibility index
  operations rather than direct application routes.

## 2.3.23 - 2026-08-03

- Correct the subject-resolution explanation so a product-defined card
  `did:web` may be the public subject alias stored in
  `org.schema.Organization.sameAs`, rather than a URN or a generic
  physical-support id.
- Document the current GW individual `Organization/_search` root, distinguish
  it from `Person`, `Patient` and `RelatedPerson`, and use neutral
  `subjectsDirectory.resolveByDid(...)` pseudocode.

## 2.3.22 - 2026-08-03

- Replace the product-specific subject-card placeholder in the professional
  Consent/SMART 101 with an explicitly application-owned subject resolver.
- Document the canonical individual `did:web`, physical card/support DID,
  schema.org `Person.identifier`, FHIR `RelatedPerson`, URN and current GW
  subject-route boundaries.

## 2.3.21 - 2026-08-03

- Correct the professional Consent/SMART 101 so the long-lived runtime is
  initialized against the employer organization GW and tenant. Subject cards
  now supply a per-operation destination context instead of rebinding the
  professional runtime to each patient provider.
- Clarify the `HttpRuntimeClient` default context as the authenticated actor's
  home tenant and cover the employer-versus-selected-subject boundary in the
  executable permission-request tutorial.

## 2.3.20 - 2026-08-02

- Expand the professional consent 101 with copy-ready subject-provider
  transport, permission-request inbox, correlated decision and GW-backed active
  Consent examples; add an executable inverse access-request lifecycle.

## 2.3.19 - 2026-08-02

- Add `ProfessionalSdk.requestProfessionalAccess(...)` to build, authenticate,
  optionally protect with DIDComm, submit and poll one canonical subject-scoped
  permission-request Communication without requiring a SMART token.
- Add correlated permission-request decisions for Personal and Individual
  Controller facades; the resulting Consent retains the original Communication
  identifier/thread through `eventBasedOn` and `sourceReference`.
- Add subject/requester permission-request listing through the existing
  Communication search runtime and a `GatewayActiveConsentProvider` that reads
  active Consent rules from GW instead of requiring an application-owned table.

## 2.3.18 - 2026-08-02

- Author employee creation entries through the shared `BundleEditor` contract.
- Apply the selected FHIR JSON, DIDComm plain, or DIDComm encrypted transport
  profile to `OrganizationControllerSdk.createOrganizationEmployee(...)`,
  including protected submit and poll requests for encrypted profiles.

## 2.3.17 - 2026-08-02

- Send the requester Firebase/OpenID `id_token` as its own SMART token field.
- Allow individual/controller exchanges to omit `vp_token`, while professional
  employee exchanges can continue to provide a verifiable presentation.

## 2.3.16 - 2026-08-02

- Add a server-profile bootstrap operation for existing-organization
  `Organization/_issue` that derives the governed wallet internally and uses
  encrypted DIDComm form transport. Strict gateways no longer require a BFF
  to assemble wallet transport plumbing or downgrade to DIDComm plaintext.
- Carry explicit web `redirect_uris` and `client_name` metadata from the
  server-profile enrollment input into OpenID DCR.

## 2.3.15 - 2026-08-02

- Read controller activation material from wrapped and multi-entry
  `Organization/_issue` terminal responses while accepting only the canonical
  serial-number claim or an explicitly typed `License:Issued` id.
- Preserve fail-closed diagnostics and reject unrelated job or resource ids.

## 2.3.14 - 2026-08-01

- Added an explicit server-only `walletSeed` and stable
  `walletKeyDerivationId` to `ServerProfileSessionManager.enroll`. This lets a
  controlled bootstrap recover the same controller key pair without coupling
  key derivation to a Firebase/profile storage identifier. Existing profiles
  remain compatible and continue to derive from `profileId`.
- Reject malformed bootstrap seeds before any gateway call and persist only
  the PIN-and-host-protected seed envelope; public/browser APIs do not receive
  the recovery seed.
- Corrected deterministic ML-DSA wallet provisioning to pass an exact 32-byte
  derived seed to the PQC key generator. Previously the long textual derivation
  was rejected internally and silently replaced by randomness.
- Added `prepareEnrollmentPublicKeys` so a BFF can submit the public
  controller binding to `Organization/_issue` before DCR without handling
  wallet internals or receiving private key material.
- Exported the canonical `Organization/_issue` activation-code reader so BFFs
  do not duplicate response-envelope parsing before profile enrollment.

All notable changes to this project will be documented in this file.

## [Unreleased]

- Align `DigitalTwinSdk` with the existing authorization contract: default to
  the canonical `organization/ResearchSubject.rs` capability and HL7 v3
  `HRESCH` purpose, with employee ownership carried by `Composition.author`
  rather than email-derived tag namespaces.

## [2.3.13] - 2026-07-31

- Add `LocalTerminologyBffService`, a framework-neutral Node/Next.js search
  facade that keeps complete fallback catalogs server-side.

## [2.3.12] - 2026-07-30

- Consume Common Utils 2.3.17 and SDK Core 2.3.12 so backend/BFF consumers
  receive the complete resource-specific IPS code roundtrip contract.

## [2.3.11] - 2026-07-30

- Consume Common Utils 2.3.16 and SDK Core 2.3.11 so backend/BFF consumers
  share the claims-first clinical title translation contract.

## [2.3.10] - 2026-07-30

- Add `IndividualMemberSdk.acceptMemberInvitation(...)` so invitation
  acceptance is performed through the authenticated member facade.
- Encode one-section batch/collection Communications with
  `Communication.topic`.
- Consume Common Utils 2.3.15 and Core 2.3.10.

## [2.3.9] - 2026-07-30

- Consume Common Utils 2.3.12 and Core 2.3.9.
- Enforce product-neutral shared SDK source, tests and documentation before
  publication.

## [2.3.8] - 2026-07-29

- Clarify every 101 ingestion snippet as authenticated backend/BFF execution.
  Browser UI authors and renders the optimistic Bundle but never updates the
  clinical index directly.
- Consume Common Utils 2.3.10 and SDK Core 2.3.7.

## [2.3.7] - 2026-07-29

- Re-export the Core coded-clinical authoring/display contract so Node and
  frontend consumers use the same name-preserving Bundle flow.

## [2.3.6] - 2026-07-28

### Fixed

- Resolve a trusted subject-provider SMART endpoint when configured and use it
  for both transport and JWT audience; otherwise derive the exact audience from
  the configured GW route instead of falling back to a tenant id or base URL.
- Make server-profile client assertions target the exact SMART token endpoint.
- Align professional examples around one derived actor DID reused by Consent,
  VP and SMART, remove ungranted `Consent.cruds` scopes, and add an executable
  professional-access 101.

### Changed

- Raise dependencies to `gdc-common-utils-ts@^2.3.8` and
  `gdc-sdk-core-ts@~2.3.5`.

## [2.3.5] - 2026-07-24

- Added `updateClinicalSection(...)` for one explicitly scoped
  batch/collection and `updateClinicalSummary(...)` for Composition-first
  multi-section document updates across clinical actor facades.
- Raised the SDK dependency baseline to `gdc-common-utils-ts@^2.3.6` and
  `gdc-sdk-core-ts@~2.3.4`.

## [2.3.4] - 2026-07-23

### Changed
- Replaced raw clinical resource filter objects in the end-to-end 101 with the
  immutable `FhirDocumentFacade` chain:
  `filterBySections` -> `filterByTypes` -> `filterByClinicalDateRange` ->
  read/count.
- Distinguished total Bundle entries, top-level UI-visible resources and
  section/type/date-filtered resources in the executable 101.

## [2.3.3] - 2026-07-23

### Added
- Added `requestClinicalSummary(...)` across personal, controller, member and
  professional facades. It returns the authoritative GW Bundle with
  `BundleReader` and `FhirDocumentFacade` instead of routing reads through
  `ingestCommunicationAndUpdateIndex(...)`.
- Added an executable individual-controller 101 that submits a completed typed
  contact Bundle through a Communication outbox job. Direct RelatedPerson
  `upsert*` methods are now documented as compatibility route plumbing.
- Added `resolveDidWebKeyAgreementJwk(...)` so Node runtimes resolve recipient
  public keys from the recipient DID document, with a validated local transport
  override for the same DID identity.
- Added an independent ML-KEM-768 `document-at-rest` key to managed profile
  wallets and a PIN-session confidential-storage adapter. Documents use the
  shared `confidential-pqc-v1` AES CEK recipient envelope.
- Added deterministic legacy-profile upgrade after PIN unlock: the protected
  wallet seed restores the storage pair and only its public JWK/policy label is
  added to durable profile metadata.

### Changed
- Completed the end-to-end clinical-summary 101 with section enumeration,
  declared counts, references, IDs, Bundle entries, filtered resource counts,
  date/text queries and application screen mapping.
- Reworked the individual-controller 101 around Communication `$summary`,
  section counts, resource resolution and section/type/date filters. Direct
  Bundle search/latest-IPS methods are documented as compatibility or
  specialized index queries.
- `ServerProfileSessionManager` now encrypts transport for each stored
  profile's `providerDid`; it no longer accepts one process-global
  `recipientDid` that could mix provider tenants.

### Fixed
- Added the missing npm `prepublishOnly` gate so patch publication always runs
  type checking, build and the complete Node SDK test suite.

## [2.3.1] - 2026-07-17

### Changed
- Updated the Node SDK dependency chain to `gdc-common-utils-ts@^2.3.1` and
  `gdc-sdk-core-ts@~2.3.1`.

### Fixed
- Added live assertions that individual Offer identifiers contain the
  jurisdiction/network selected by `RouteContext` and never contain
  `undefined`; individual bootstrap no longer treats that network selector as
  the individual's `Organization.addressCountry`.

### Added
- Added `startIndividualOrganization(...).identity` and
  `readIndividualOrganizationBootstrapIdentity(...)` so BFF/channel clients
  receive the resource UUID, multibase individual id, authoritative
  `Offer.offeredBy`, and derived subject DID without parsing GW payloads or
  rebuilding tenant identity strings.
- Added `registrationStatus` and `orderConfirmationRequired` to prevent BFFs
  from reconfirming the historical Offer returned for an already-active
  individual registration.

## [2.3.0] - 2026-07-16

- Clinical ingestion now accepts the claims-first `CommMsgExtended` outbox,
  renders `api`/R4 or injected sector formats only at submission time, and
  separates `clinicalFormat` from the HTTP/DIDComm transport profile.
- Deprecated the ambiguous `pathFormatSegment` application option in favor of
  `clinicalFormat`; unknown formats now fail instead of silently becoming API.

### Added
- Added the production server profile/session runtime with DCR registration,
  registered-key SMART assertions and subject-scoped sessions.
- Added the `gdc-pin-host-envelope-v1` double envelope: random DEK, host/KMS
  wrapping and a PIN-derived scrypt layer, including fail-before-KMS tests.
- Documented Cloud KMS, authority boundaries, key recovery and the portable
  offline/native confidential-client adaptation.
- Added consent-scoped clinical ingestion, Bundle search and latest IPS reads
  to `IndividualMemberSdk`, delegating to the same runtime client used by
  controller and personal actors.
- Added canonical clinical outbox submission through `IndividualControllerSdk`
  and `ProfessionalSdk`: one `CommunicationOutboxJob` can now be rendered as
  FHIR JSON, demo DIDComm plaintext, or protected form-encoded DIDComm JWE.
- Added injectable `fetchImpl`, `transportProfile`, and wallet-backed secure
  `pack`/`unpack` configuration to `NodeHttpClient`.
- Documented pass-through of the separate GDC `RelatedPerson.role` functional
  claim in individual-controller upserts. CAREGIVER/ECON/DEPEN use active
  v3-RoleClass semantics; relationship remains single kinship/legal
  terminology, PERMITTED is not valid there, and POWATT is never inferred.
- Added high-level individual-controller/runtime helpers for owner-scoped
  zero-cost seat addition, FHIR v3-RoleCode member invitation issue and
  accept/deactivate/release transitions. Shared validation rejects ISCO
  professionals before transport because their employer owns their license.
- Individual-member issue/accept helpers now carry the authorized subject DID
  and allow a verified recipient to accept by code without knowing the owner
  organization id; lifecycle searches keep owner scoping for controller
  operations.

## [2.2.2] - 2026-07-13

### Changed
- Normalized hosted `serviceProviderDid` route inputs back to the tenant id
  segment so GW tenant paths no longer duplicate the `did:web` suffix:
  - `src/runtime-route-context.ts`
  - `tests/node-runtime-client.test.mjs`
- Aligned the published dependency line with the shared compatibility release:
  - `gdc-common-utils-ts@^2.2.2`
  - `gdc-sdk-core-ts@~2.2.1`

## [2.2.1] - 2026-07-06

### Added
- Added one canonical `ProfileRuntime` plus loaded profile workspace so BFF/backend
  consumers can reuse the same canonical `loadProfile(...) ->
  workspace/session -> actor facade` entrypoint already being aligned across
  runtimes:
  - `src/backend-profile-workspace.ts`
  - `src/index.ts`
- Added internal runtime helper modules so the Node runtime client delegates
  path resolution, host submission payload assembly, consent-claim building,
  HTTP transport, trace redaction, and message wrapping instead of keeping
  those mechanics inline in one monolithic file:
  - `src/runtime-client-paths.ts`
  - `src/runtime-consent.ts`
  - `src/runtime-host-submission.ts`
  - `src/runtime-http-trace.ts`
  - `src/runtime-message.ts`
  - `src/runtime-paths.ts`
  - `src/runtime-route-context.ts`
  - `src/runtime-transport.ts`
- Added one individual-side identity helper surface on the Node facades so
  BFF and CLI runtimes can build controller/member VC/VP material and one
  separate dependent-subject VC without dropping to raw common-utils calls:
  - `IndividualControllerSdk.getIdentitySameAs(...)`
  - `IndividualControllerSdk.getIdentityVC(...)`
  - `IndividualControllerSdk.getSubjectVC(...)`
  - `IndividualControllerSdk.buildIdentityVpPayload(...)`
  - `IndividualControllerSdk.buildUnsignedIdentityVpJwt(...)`
  - `IndividualMemberSdk.getIdentitySameAs(...)`
  - `IndividualMemberSdk.getIdentityVC(...)`
  - `IndividualMemberSdk.buildIdentityVpPayload(...)`
  - `IndividualMemberSdk.buildUnsignedIdentityVpJwt(...)`
  in:
  - `src/orchestration/individual-controller-sdk.ts`
  - `src/orchestration/individual-member-sdk.ts`
  - `tests/orchestration.test.mjs`

### Changed
- Reworked the main backend `101` runtime slices so they use one loaded
  backend workspace/session instead of standalone helper calls or
  `actorSessions[0]` indexing:
  - `tests/101-backend-profile-runtime.test.mjs`
  - `tests/101-profile-workspace-runtime.test.mjs`
  - `docs/101-PROFILE-ORCHESTRATION.md`
  - `README.md`
- Clarified the node-runtime `101` onboarding trail so the integration guide
  and controller lifecycle test now state their package boundary and link the
  lower executable `101` files in `sdk-core` and `common-utils`:
  - `docs/101-SDK_INTEGRATION.md`
  - `tests/101-organization-controller-lifecycle.test.mjs`
- Refactored `HttpRuntimeClient` so `src/node-runtime-client.ts` acts mainly as
  the public runtime facade and delegation layer, while preserving the
  existing public method surface and host-onboarding route interception points
  used by tests and higher-level SDK facades:
  - `src/node-runtime-client.ts`
- Kept the host-registry route hardening intact during the refactor:
  - host routes still require `hostNetwork` semantics instead of tenant
    business sectors
  - deprecated `sector` on host routes still fails fast
  - invalid host-network values such as `health-care` still fail fast
  - missing `hostNetwork` still falls back to `test` with a one-time warning
  in:
  - `src/runtime-client-paths.ts`
  - `src/runtime-route-context.ts`
  - `tests/node-runtime-client.test.mjs`
- Reused shared helpers from `gdc-common-utils-ts` where the behavior already
  existed instead of keeping duplicate local implementations:
  - tenant v1 path building now delegates to
    `buildGwCoreTenantResourceActionPath(...)`
  - runtime UUID generation now delegates to the shared `runtimeUuid(...)`
  in:
  - `src/runtime-paths.ts`
  - `src/runtime-message.ts`
- Removed stale placeholder/not-supported comments that still described
  individual-member lifecycle as future work even though the current runtime
  already supports `disableIndividualMember(...)` and
  `purgeIndividualMember(...)`, and added copy/paste end-to-end snippets for
  those member lifecycle operations in:
  - `src/orchestration/individual-controller-sdk.ts`
  - `src/node-runtime-client.ts`
  - `src/resource-operations.ts`
  - `docs/101-SDK_END_TO_END.md`
- Documented when to use controller identity VC, dependent subject VC, or both
  in the individual-controller flow:
  - `docs/101-SDK_END_TO_END.md`
  - `docs/101-SDK_INTEGRATION.md`

## [2.1.3] - 2026-06-30

### Added
- Added one Node/shared SMART client-auth path that can auto-build
  `client_assertion` for `openid-smart` token requests from the published
  common-utils helper instead of relying on per-suite fixture code:
  - `src/smart-token.ts`
  - `tests/smart-token.test.mjs`
- Added one professional identity helper surface on the Node facade so BFF and
  CLI runtimes can build employee VC/VP material for SMART/OpenID4VP flows
  without dropping to raw common-utils calls:
  - `ProfessionalSdk.getIdentitySameAs(...)`
  - `ProfessionalSdk.getIdentityVC(...)`
  - `ProfessionalSdk.buildIdentityVpPayload(...)`
  - `ProfessionalSdk.buildUnsignedIdentityVpJwt(...)`
  in:
  - `src/orchestration/professional-sdk.ts`
  - `tests/orchestration.test.mjs`

### Changed
- Updated the published shared dependency targets to:
  - `gdc-common-utils-ts@^2.1.2`
  - `gdc-sdk-core-ts@^2.1.1`

## [2.1.1] - 2026-06-30

### Changed
- Hardened host-registry routing in the Node runtime client so host onboarding
  and host commercial confirmation no longer silently reuse tenant business
  sectors such as `health-care` as host path segments:
  - host routes now require canonical `hostNetwork` semantics
  - deprecated `sector` input on host routes now fails fast with a clear error
  - invalid business-sector values passed as `hostNetwork` now fail fast
  - missing `hostNetwork` falls back to `test` with a one-time `console.warn`
    to preserve short-term compatibility while making the drift visible
  in:
  - `src/node-runtime-client.ts`
  - `tests/node-runtime-client.test.mjs`
- Updated host-oriented SDK tests and live examples to use `hostNetwork`
  instead of the ambiguous legacy `sector` alias for host registry routes:
  - `tests/host-onboarding.test.mjs`
  - `tests/orchestration.test.mjs`
  - `tests/101-organization-controller-lifecycle.live.test.mjs`
  - `tests/101-live-full-cycle-bff-runtime.e2e.test.mjs`

## [2.1.0] - 2026-06-30

### Changed
- Updated published shared dependency targets to:
  - `gdc-common-utils-ts@^2.1.0`
  - `gdc-sdk-core-ts@^2.1.0`
- Removed repository-local backlog/test-summary documents so roadmap and test
  tracking stay outside the published package repo:
  - `TODO.md`
  - `TEST_CORE.md`

## [2.0.12] - 2026-06-29

### Changed
- Clarified the Node 101 documentation for legal-organization onboarding so
  new developers are taught the canonical `_transaction` flow under
  `submitLegalOrganizationVerificationTransaction(...)`, while keeping
  `activateOrganizationInGatewayFromIcaProof(...)` visible only as legacy
  compatibility guidance:
  - `docs/101-SDK_INTEGRATION.md`
- Added explicit research-access 101 guidance so developers learn the business
  split `OrganizationControllerSdk` + `DigitalTwinSdk`, while the current
  executable runtime still maps the twin-search consumer flow to
  `ProfessionalSdk`:
  - `docs/101-SDK_INTEGRATION.md`
  - `docs/101-SDK_END_TO_END.md`

## [2.0.11] - 2026-06-29

### Changed
- Updated published shared dependency targets to:
  - `gdc-common-utils-ts@^2.0.17`
  - `gdc-sdk-core-ts@^2.0.10`
- Kept the current runtime/source branch content and aligned the published Node
  package with the latest shared bundle-claim readers and controller-device
  lifecycle helper surface.

## [2.0.10] - 2026-06-27

- Added a node/runtime `UserProfileIndexStore` on top of the shared
  `gdc-sdk-core-ts` `UserProfileIndex` contract so server runtimes can persist
  and resolve hashed local profile selectors before PIN unlock:
  - `src/UserProfileIndexStore.ts`
  - `tests/user-profile-index-store.test.mjs`

### Added
- Added Node-owned wallet/runtime adapters to the sdk-node layer so concrete
  Node crypto and managed-wallet behavior no longer lives in
  `gdc-common-utils-ts`:
  - `src/node-crypto-helper.ts`
  - `src/node-managed-wallet.ts`
  - `tests/node-managed-wallet.test.mjs`
- Added package-root exports for `NodeCryptoHelper` and `NodeManagedWallet`:
  - `src/index.ts`
- Added a wallet-backed backend/session job-manager helper so BFF and other
  short-lived service runtimes can reuse one protected local session cache plus
  one shared wallet for draft/outbox transport orchestration:
  - `src/wallet-backed-job-manager.ts`
  - `tests/101-wallet-backed-job-manager.test.mjs`

- Added the canonical organization-controller lifecycle `101` that keeps the
  scope intentionally narrow and reproducible for auditors and BFF integrators:
  - onboard via the new host `Organization/_transaction` path or the legacy
    `ICA _verify -> Organization/_activate` path
  - materialize additional purchased seats after the original registration
  - execute `Organization/_issue -> Token/_exchange -> Device/_dcr` for the
    current controller device before teardown
  - assert that `_issue` reuses the already-assigned controller seat and does
    not consume or discard post-registration seat expansions
  - only then execute tenant `disable` and `purge`
  in:
  - `tests/101-organization-controller-lifecycle.test.mjs`

- Added a dedicated live controller-only E2E that stays focused on the narrow
  tenant lifecycle proof instead of reusing the broader employee/SMART full
  cycle:
  - `tests/101-organization-controller-lifecycle.live.test.mjs`
  - `scripts/run-live-controller-lifecycle.sh`
  - `package.json`
  - `docs/101-ORGANIZATION_CONTROLLER_LIFECYCLE.md`

### Changed
- Updated the dependency targets to:
  - `gdc-common-utils-ts@^2.0.15`
  - `gdc-sdk-core-ts@^2.0.9`
- Re-exported the wallet-backed job-manager helpers from the package root:
  - `src/index.ts`
- Clarified and regression-tested employee lifecycle payload semantics so
  `disableEmployee(...)` and `purgeEmployee(...)` keep the GW technical profile
  anchor in `resource.id` (`resourceId` input) while preserving
  `org.schema.Person.identifier` in claims as the exportable/interoperable
  employee identity:
  - `src/resource-operations.ts`
  - `tests/resource-operations.test.mjs`
  - `docs/101-SDK_INTEGRATION.md`
  - `docs/101-SDK_END_TO_END.md`
- Tightened employee lifecycle calls so `disableEmployee(...)` and
  `purgeEmployee(...)` now reject missing/blank `resourceId` instead of
  silently allowing identifier-only targeting:
  - `src/resource-operations.ts`
  - `tests/resource-operations.test.mjs`
  - `tests/orchestration.test.mjs`
- Switched the default host-verification PDF for live controller/full-cycle GW
  suites from the local multisign sample to `examples/TEST-A4-Antifraud.pdf`
  so staging/live validation matches the intended ICA document contract:
  - `tests/101-live-full-cycle-bff-runtime.e2e.test.mjs`
  - `tests/live-gw-node-runtime.e2e.test.mjs`
- Aligned the professional SMART actor identifier in the live full-cycle `101`
  with the employee-style DID shape expected by GW consent matching, so the
  live SMART token request now carries the same actor identifier/role semantics
  as the granted professional consent rule:
  - `tests/101-live-full-cycle-bff-runtime.e2e.test.mjs`
- Switched live SMART defaults away from ad hoc employee DID strings and onto
  the shared `buildProfessionalDidWeb(...)` helper so the SDK follows the same
  `did:web` employee convention with one hashed email-derived identifier
  segment as `gdc-common-utils-ts`:
  - `tests/101-live-full-cycle-bff-runtime.e2e.test.mjs`
  - `tests/live-gw-node-runtime.e2e.test.mjs`

### Testing
- `npm run build`
- `node --test tests/101-organization-controller-lifecycle.test.mjs`
- `RUN_LIVE_101_FULL_CYCLE_E2E=0 node --test tests/101-live-full-cycle-bff-runtime.e2e.test.mjs`
- `node --test tests/101-organization-controller-lifecycle.live.test.mjs`
- `npm run test:e2e:live-controller-lifecycle`
- `npm run test:e2e:live-full-cycle`

## [2.0.9] - 2026-06-24

- Updated dependency target to gdc-common-utils-ts@^2.0.11.
- Updated dependency target to gdc-sdk-core-ts@^2.0.8.


## [2.0.8] - 2026-06-23

### Changed
- Added runtime support for host `Organization/_issue` so Node/BFF callers can
  reverify an existing legal organization without creating a new Offer and then
  chain the reissued controller activation code through the existing
  `_exchange -> _dcr` helper flow.
- Added a dedicated organization-controller recovery helper and live runner so
  BFF integrations can execute `Organization/_issue -> Token/_exchange ->
  Device/_dcr` as one typed flow.
- Added canonical host-side `identity/auth/_dcr` route helpers and regression
  coverage for `_issue`, `_exchange`, and `_dcr` orchestration.
- Updated dependency targets to:
  - `gdc-common-utils-ts@^2.0.10`
  - `gdc-sdk-core-ts@^2.0.7`

### Fixed
- Included `body.code` when submitting host-side DCR after `Token/_exchange`,
  matching GW CORE validation instead of dropping the reissued activation code
  before device registration.
- Updated SDK docs and the live recovery runner to use a minimum valid DCR
  payload (`redirect_uris`, `jwks`, `ext_device_info`) and the currently
  supported `application_type: native`.

## [2.0.7] - 2026-06-23

- Updated dependency target to gdc-common-utils-ts@^2.0.7.
- Updated dependency target to gdc-sdk-core-ts@^2.0.6.


## [2.0.6] - 2026-06-18

- Fixed the published dependency target to `gdc-sdk-core-ts@^2.0.5`.
- Removed the corrupted dependency/changelog text accidentally injected by the release script.


## [2.0.4] - 2026-06-19

### Changed
- Updated the shared dependency target to `gdc-common-utils-ts@^2.0.6`.
- Updated the shared dependency target to `gdc-sdk-core-ts@^2.0.4`.
- Switched the node runtime DIDComm plaintext transport examples/tests to the
  canonical `application/didcomm-plain+json` media type.

## [2.0.3] - 2026-06-18

### Added
- Added backend/profile workspace runtime helpers and orchestration entry
  points so higher-level BFF flows can execute organization, professional, and
  individual profile steps without dropping to raw client plumbing:
  - `src/backend-profile-runtime.ts`
  - `src/organization-controller-backend-runtime.ts`
  - `src/professional-backend-runtime.ts`
  - `src/profile-workspace.ts`
  - `src/orchestration/client-port.ts`
  - `src/orchestration/organization-controller-sdk.ts`
- Added the clean live host-transaction runner and the full-cycle runtime `101`
  coverage/docs for local TTY verification:
  - `scripts/run-live-gw-host-transaction-clean.sh`
  - `tests/101-live-full-cycle-bff-runtime.e2e.test.mjs`
  - `tests/101-profile-workspace-runtime.test.mjs`
  - `docs/101-PROFILE-ORCHESTRATION.md`

### Changed
- Updated the package to consume `gdc-common-utils-ts@^2.0.5`.
- Updated the node runtime client and live GW suite so host-side
  `Organization/_transaction` uses shared DIDComm submit constants and keeps
  host-route jurisdiction separate from tenant jurisdiction:
  - `src/node-runtime-client.ts`
  - `tests/live-gw-node-runtime.e2e.test.mjs`
- Refreshed package docs, contribution notes, TODOs, and orchestration tests to
  match the new backend/profile runtime surface:
  - `README.md`
  - `CONTRIBUTING.md`
  - `TODO.md`
  - `docs/101-LIVE_GW_LOCAL.md`
  - `docs/101-SDK_END_TO_END.md`

### Testing
- `npm run build`

### Added
- Added the canonical live full-cycle backend/BFF `101` so integrators can now
  exercise the real dependency chain in one executable walkthrough:
  - host/tenant activation
  - professional employee provisioning
  - individual-controller profile load
  - individual bootstrap and order confirmation
  - clinical ingestion
  - consent grant
  - professional SMART token request
  - professional IPS read
  - cleanup of consent, individual, employee, tenant, and host
  in:
  - `tests/101-live-full-cycle-bff-runtime.e2e.test.mjs`
- Added dedicated scripts for the new live `101`:
  - `test:e2e:live-full-cycle`
  in:
  - `package.json`
- Added backend/professional high-level helpers so backend consumers and the
  live `101` no longer need to drop to raw runtime plumbing for the current
  professional read flow:
  - `loadBackendProfessionalProfile(...)`
  - `ProfessionalSdk.searchClinicalBundle(...)`
  - `ProfessionalSdk.getLatestIps(...)`
  - `IndividualControllerSdk.revokeProfessionalAccess(...)`
  in:
  - `src/backend-profile-runtime.ts`
  - `src/orchestration/professional-sdk.ts`
  - `src/orchestration/individual-controller-sdk.ts`
  - `src/node-runtime-client.ts`
  - `src/resource-operations.ts`

### Changed
- Repositioned the new live full-cycle `101` as the primary integrator-facing
  walkthrough in:
  - `README.md`
  - `docs/101-LIVE_GW_LOCAL.md`
  - `docs/101-SDK_END_TO_END.md`
- Reworked the professional leg of the live full-cycle `101` so the clinical
  read now goes through the high-level `ProfessionalSdk` instead of a direct
  `NodeHttpClient` call, and the host activation leg now reuses the validated
  shared legal-organization onboarding validation plus
  `OrganizationControllerSdk` transaction input instead of `bootstrap`:
  - `tests/101-live-full-cycle-bff-runtime.e2e.test.mjs`

### Testing
- `npm run build`
- `node --test tests/orchestration.test.mjs tests/resource-operations.test.mjs tests/101-backend-profile-runtime.test.mjs`
- `RUN_LIVE_101_FULL_CYCLE_E2E=0 node --test tests/101-live-full-cycle-bff-runtime.e2e.test.mjs`

## [2.0.2] - 2026-06-18

### Changed
- Bumped the package patch version from `2.0.1` to `2.0.2`.
- Updated dependency targets to:
  - `gdc-common-utils-ts@^2.0.4`
  - `gdc-sdk-core-ts@^2.0.3`
- Updated `activateOrganizationInGatewayFromIcaProof(...)` so plaintext
  activation requests mirror controller communication key metadata into
  `meta.jws.protected` / `meta.jwe.header` using the same shared transport
  contract documented in `gdc-common-utils-ts`:
  - `src/node-runtime-client.ts`
- Added runtime and live-trace coverage for plaintext activation metadata
  generation:
  - `tests/host-onboarding.test.mjs`
  - `tests/live-gw-node-runtime.e2e.test.mjs`
- Re-exported the new backend runtime entry points from the package root and
  added explicit live-test script entry points for profile-runtime/dialogue
  suites:
  - `src/index.ts`
  - `package.json`
- Switched `ConsentInteroperableClaims` to an explicit type-only re-export so
  the node package surface stays clean under ESM/type-aware consumers:
  - `src/consent-claim-helpers.ts`
- Refined node runtime architecture/docs so backend `JobManager` / queue /
  vault ownership and the actor-profile live-suite split are explicit:
  - `ARCHITECTURE.md`
  - `CONTRIBUTING.md`
  - `README.md`
  - `docs/NEXT_STEPS.md`
- Updated the shared dependency target to `gdc-common-utils-ts@^2.0.1`.

### Added
- Added the first backend-generic profile runtime slice on top of the shared v2
  `sdk-core` contracts so backend consumers can converge on one actor-aware
  flow for:
  - `loadProfile(...)`
  - `registerTrustedDevice(...)`
  - `connectToSubjectIndex(...)`
  - `getSubjectIndexComposition(...)`
  in:
  - `src/backend-profile-runtime.ts`
  - `tests/101-backend-profile-runtime.test.mjs`
- Added backend profile-session helpers so one loaded backend profile can
  immediately materialize actor-specific facades through injected runtime
  clients, including:
  - `requireBackendActorSession(...)`
  - `requireBackendIndividualControllerSession(...)`
  in:
  - `src/backend-profile-runtime.ts`
  - `tests/101-backend-profile-runtime.test.mjs`
- Added the first backend individual-controller use-case wrapper on top of the
  generic profile runtime, covering:
  - `loadProfile(...)`
  - `startIndividualOrganization(...)`
  - `confirmIndividualOrganizationOrder(...)`
  - `searchClinicalBundle(...)`
  - `getLatestIps(...)`
  in:
  - `src/individual-controller-backend-runtime.ts`
  - `tests/101-individual-controller-backend-runtime.test.mjs`
- Added one direct backend profile runtime implementation over the current
  injected `RuntimeClient`, so authenticated backend callers can already use
  `loadProfile(...)` without waiting for the future persistent profile/KMS/job
  manager runtime:
  - `src/backend-profile-runtime.ts`
  - `tests/101-backend-profile-runtime.test.mjs`
- Added in-memory profile-session runtime functionality for backend callers:
  - `createJobManagerInMemory(...)`
  - `closeProfile(...)` / `closeBackendProfile(...)`
  - draft job creation/query/submit in the `101` backend walkthrough
  in:
  - `src/backend-profile-runtime.ts`
  - `tests/101-backend-profile-runtime.test.mjs`
- Added one separate live GW E2E slice for the profile-runtime individual
  baseline, entering through `loadProfile(...)` before the current individual
  registration/order/index flow:
  - `tests/live-gw-node-runtime.e2e.test.mjs`

### Testing
- `npm run type-check`
- `npm test`

## [2.0.0] - 2026-06-15

### Added
- Added canonical v2 architecture and contribution rules for the node/server
  actor-aware runtime layer:
  - `ARCHITECTURE.md`
  - `CONTRIBUTING.md`

### Changed
- Rebased runtime resource/lifecycle orchestration onto the shared v2
  `Editor` / `State` surface and operation-first naming:
  - `src/resource-operations.ts`
  - `tests/resource-operations.test.mjs`
  - `tests/host-onboarding.test.mjs`
  - `tests/live-gw-node-runtime.e2e.test.mjs`
- Documented the v2 runtime rule that canonical shared high-level `get...` /
  `set...` methods must be defined in `gdc-common-utils-ts` before being
  consumed in node actor/runtime flows.
- Updated dependency targets to:
  - `gdc-common-utils-ts@^2.0.0`
  - `gdc-sdk-core-ts@^2.0.0`

### Breaking
- Node consumers must align with the v2 shared `Editor` / `State` terminology
  and with `prepare...` operation-family naming where applicable.
- Node runtime wrappers must stop introducing first-class shared semantic
  accessors locally when those `get...` / `set...` methods belong in
  `gdc-common-utils-ts`.

### Added
- Added runtime support for canonical `Communication/_search` submission using
  the shared communication-search bundle contract and exposed it through the
  actor-facing SDK surfaces:
  - `src/resource-operations.ts`
  - `src/node-runtime-client.ts`
  - `src/orchestration/client-port.ts`
  - `src/orchestration/personal-sdk.ts`
  - `src/orchestration/professional-sdk.ts`
  - `src/orchestration/individual-controller-sdk.ts`
- Added runtime coverage for the new communication search flow in:
  - `tests/resource-operations.test.mjs`
  - `tests/node-runtime-client.test.mjs`
  - `tests/orchestration.test.mjs`

### Changed
- Switched the communication search runtime payload from a raw `Parameters`
  body to the canonical shared `search` bundle envelope so the Node runtime
  stays aligned with GW/core shared helpers.

## [0.12.1] - 2026-06-14

### Changed
- Closed the canonical live GW E2E suite on clean Firestore/GCS runs with:
  - fresh host id per execution
  - fresh tenant id per execution
  - fresh individual subject per execution
  - real-TTY-first validation through `npm run test:e2e:live-gw:clean`
- Reworked the live runtime suite so the clinical transport checks run as user
  conversations before the destructive cleanup lifecycle, instead of purging the
  hosted individual/tenant/host in the middle of the suite.
- Consolidated the previous split clinical scenarios into conversation-shaped
  transport tests for:
  - `didcomm-plain`
  - `legacy-fhir`
  reducing duplicate setup/poll loops while keeping the same end-to-end
  coverage of:
  - communication ingestion
  - `DocumentReference` projection visibility
  - `MedicationStatement` indexing visibility
- Tightened local polling defaults for non-blockchain live validation:
  - `LIVE_GW_POLL_INTERVAL_MS=200` by default
  - `LIVE_GW_POLL_TIMEOUT_MS=60000` by default
  - centralized through `createLivePollOptions(...)`
- Added step-level profiling inside the individual lifecycle suite so slow
  cleanup paths are recorded in the debug JSONL output and can be ranked after a
  run without re-instrumenting the test manually.
- Extended the live docs and top-of-file suite JSDoc so the current runtime
  validation does not lose the follow-up contract for the next Node `101`,
  including:
  - `JobManager` orchestration
  - virtual/public API usage
  - actor facades
  - bundle editor/viewer usage
  - consent view model usage
  - conversation-first walkthroughs
- Updated published shared dependency targets to:
  - `gdc-common-utils-ts@^1.24.1`
  - `gdc-sdk-core-ts@^0.11.1`
- Refreshed the lockfile so `gdc-sdk-node-ts@0.12.1` resolves the published npm
  artifacts for those shared packages instead of older baselines.

### Performance Notes Observed In This Release
- A fully green clean Firestore/GCS run still takes roughly three minutes
  because the heaviest latency is no longer the poll interval itself, but the
  cumulative asynchronous cleanup work in the hosted lifecycle.
- Step profiling from the clean live run showed the slowest individual-lifecycle
  steps were:
  - `individual-purge`
  - `tenant-purge`
  - `tenant-disable`
  - `tenant-disable-while-individual-active`
  - `ips-search`
  These timings are now captured directly in the live debug artifacts for the
  next optimization pass.

### Testing
- `npm install gdc-common-utils-ts@^1.24.1 gdc-sdk-core-ts@^0.11.1`
- `node --check tests/live-gw-node-runtime.e2e.test.mjs`
- `npm run test:e2e:live-gw:clean`

## [0.12.0] - 2026-06-13

### Added
- Added public host and hosted-tenant lifecycle support to the Node runtime in:
  - `src/node-runtime-client.ts`
  - `src/orchestration/organization-controller-sdk.ts`
- Added runtime support for:
  - `disableHost(...)`
  - `purgeHost(...)`
  - `disableTenant(...)`
  - `purgeTenant(...)`
- Added local-process helper scripts for live GW validation in:
  - `scripts/local-close.sh`
  - `scripts/run-live-gw-clean.sh`
- Added canonical host/tenant lifecycle coverage in:
  - `tests/host-onboarding.test.mjs`

### Changed
- Rebased the Node host-onboarding surface onto the shared
  `gdc-sdk-core-ts@^0.11.0` hosting facade so the Node runtime keeps a stable
  compatibility import while the canonical orchestration contract now lives in
  the shared neutral package:
  - `src/host-onboarding.ts`
- Updated the node actor-session bridge to the canonical host/tenant
  capabilities introduced by `gdc-common-utils-ts@^1.24.0`, including:
  - `HostingActivateOrganization`
  - `HostingConfirmOrder`
  - `HostingDisableHost`
  - `HostingPurgeHost`
  - `OrganizationDisableTenant`
  - `OrganizationPurgeTenant`
- Expanded the live GW runtime and docs so final validation is explicitly
  real-terminal/TTY-first, clean-run-first, and capable of asserting:
  - tenant disable/purge conflict behavior while descendants still exist
  - host disable/purge conflict behavior while hosted tenants still exist
  - tenant publication removal after tenant disable
  - host publication removal after host disable
  - consolidated DocumentReference and MedicationStatement indexing checks for
    both `didcomm-plain` and `legacy-fhir`
- Refined runtime orchestration, routing, and session wiring around the host
  lifecycle surface in:
  - `src/orchestration/client-port.ts`
  - `src/orchestration/host-onboarding-sdk.ts`
  - `src/resource-operations.ts`
  - `src/session.ts`
  - `src/gdc-session-bridge.ts`
- Updated published shared dependency targets to:
  - `gdc-common-utils-ts@^1.24.0`
  - `gdc-sdk-core-ts@^0.11.0`
- Restored the lockfile to published npm artifacts instead of local
  `file:../...` links so the release tarball is reproducible outside the
  workspace.

### Shared Surface Brought In By Published Dependencies
- `gdc-sdk-core-ts@^0.11.0` now provides the shared hosting facade baseline
  consumed by the Node runtime, including:
  - canonical `HostingControllerFacade`
  - canonical host route/input contracts
  - canonical host/tenant lifecycle request-type helpers
- `gdc-common-utils-ts@^1.24.0` now provides the shared actor/capability and
  lifecycle baseline consumed by the Node runtime, including:
  - canonical `Hosting...` actor capabilities
  - canonical tenant lifecycle capability names
  - tenant lifecycle request constants
  - hosted individual/member DID and related-person identifier updates reused
    by the live runtime flows

### Testing
- `npm install gdc-common-utils-ts@^1.24.0 gdc-sdk-core-ts@^0.11.0`
- `npm run build`
- `npm test`
- `npm run test:e2e:live-gw:clean`

## [0.11.1] - 2026-06-13

### Changed
- Updated published shared dependency targets to:
  - `gdc-common-utils-ts@^1.23.0`
  - `gdc-sdk-core-ts@^0.10.2`
- Replaced the previous workspace-linked install state in `package-lock.json`
  with the published npm artifacts for:
  - `gdc-common-utils-ts@1.23.0`
  - `gdc-sdk-core-ts@0.10.2`
  so the release artifact is reproducible outside the monorepo and no longer
  depends on local `file:../...` links.
- Aligned the runtime package with the now-published shared invoice and
  charge-item claims baseline available through `gdc-common-utils-ts@1.23.0`,
  including:
  - canonical `Invoice.*` claim keys
  - canonical `ChargeItem.*` claim keys
  - repeated invoice + charge-item row builders
  - contextualized `org.hl7.fhir.api.*` invoice/charge-item variants
  - invoice `resource.meta.claims` projection support
- Aligned the runtime package with the now-published
  `gdc-sdk-core-ts@0.10.2` facade baseline so Node runtime releases consume the
  same published neutral surface already merged to `sdk-core/main`, including:
  - lifecycle facade updates
  - license facade updates
  - shared builder/contract exports now packaged in the published tarball
- Kept the runtime source behavior from `0.11.0` intact in this patch release:
  - public organization order confirmation support remains as introduced in
    `0.11.0`
  - live GW billing/transport validation flows from the integration branch are
    now being released to `main` together with the dependency alignment
  - no new runtime API names were introduced beyond the already completed
    `0.11.0` branch surface

### Branch Content Merged To Main In This Release Train
- This release is not only a dependency bump on top of old `main`.
  It also carries the already-implemented branch work that had not yet been
  merged to `main`, including:
  - organization-side order confirmation support
  - expanded commercial/license search and readback flows
  - related-person lifecycle support for individual-member flows
  - live GW transport/execution helper coverage
  - live GW invoice/order readback validation
- The intent of `0.11.1` is therefore:
  - publish the branch functionality to `main`
  - align the package to the published shared dependency versions
  - leave the npm artifact in a clean non-workspace-linked state

### Testing
- `npm install gdc-common-utils-ts@^1.23.0 gdc-sdk-core-ts@^0.10.2`
- `npm test`
- `npm run test:e2e:live-gw` or one of the targeted live GW variants once GW
  CORE is running
- `npm run test:e2e:live-gw:all` when validating both supported transport
  profiles against a live GW CORE target

## [0.11.0] - 2026-06-13

### Added
- Added public organization order confirmation support for portal-managed
  post-payment seat activation in:
  - `src/organization-license-order.ts`
  - `src/node-runtime-client.ts`
  - `src/orchestration/organization-controller-sdk.ts`
- Added live GW transport/execution helpers for the controlled
  `front -> virtual API -> GW CORE` test harness in:
  - `tests/helpers/live-gw-execution-modes.mjs`
  - `tests/helpers/live-gw-suite-profiles.mjs`
  - `tests/helpers/live-gw-transport-profiles.mjs`

### Changed
- Extended individual order confirmation to accept additional commercial
  claims and read back the embedded invoice bundle from GW CORE responses.
- Updated the live E2E suite to validate:
  - complete `mem` lifecycles for `individual` and `professional`
  - `didcomm-plain` clinical ingestion
  - `legacy-fhir` clinical ingestion
  - invoice bundle readback on order responses
- Updated the shared dependency target to `gdc-common-utils-ts@^1.22.0`.

### Testing
- `npm run build`
- `node --test tests/node-runtime-client.test.mjs tests/orchestration.test.mjs`
- `RUN_LIVE_GW_E2E=1 RUN_LIVE_GW_E2E_IPS_INGESTION=1 RUN_LIVE_GW_E2E_INDIVIDUAL_LIFECYCLE=1 LIVE_GW_E2E_TRANSPORT=all LIVE_GW_E2E_EXECUTION_MODE=direct node --test tests/live-gw-node-runtime.e2e.test.mjs`

## [0.10.1] - 2026-06-13

### Added
- Added current lifecycle support for individual-member `RelatedPerson`
  records in the Node runtime:
  - `disableIndividualMember(...)` now submits identifier-first inactive
    lifecycle resources over `RelatedPerson/_batch`
  - `purgeIndividualMember(...)` now uses explicit `RelatedPerson/_purge`
    routes and request types
- Added shared order/offer response parsing helpers in:
  - `src/order-offer-summary.ts`
- Added public Node runtime helpers for commercial/license read-model flows:
  - `searchLicenses(...)`
  - `listLicenses(...)`
  - `searchLicenseOffers(...)`
  - `listLicenseOffers(...)`
  - `searchLicenseOrders(...)`
  - `listLicenseOrders(...)`

### Changed
- Refactored individual-organization lifecycle payload building to reuse the
  shared `IndividualOrganizationLifecycleDraft` instead of duplicating GW
  payload assembly.
- Expanded public actor facades to match implemented runtime capabilities:
  - `OrganizationControllerSdk.searchOrganizationEmployees(...)`
  - `IndividualControllerSdk.searchClinicalBundle(...)`
  - `PersonalSdk.getLatestIps(...)`
- Added `getLatestIps(...)` as a preferred runtime alias on the node client,
  backed by the existing latest-IPS search flow.
- Wired the public organization/individual/personal facades through the new
  shared license search/list surface instead of keeping commercial/license
  readback hidden behind runtime internals.
- Updated individual start/bootstrap wiring to consume canonical offer preview
  parsing instead of returning an empty preview placeholder.
- Re-exported the new lifecycle and order/offer summary surfaces from the
  package root.
- Updated the shared dependency target to `gdc-sdk-core-ts@^0.10.0`.
- Refreshed README/integration/end-to-end docs to reflect:
  - real member lifecycle support
  - shared related-person example fixtures
  - the current runtime contract for `disableIndividualMember(...)` and
    `purgeIndividualMember(...)`
  - the opt-in live GW lifecycle gate

### Testing
- `npm run build`
- `node --test tests/resource-operations.test.mjs tests/node-runtime-client.test.mjs`

## [0.9.1] - 2026-06-11

### Changed
- Updated shared dependency targets to:
  - `gdc-common-utils-ts@^1.20.1`
  - `gdc-sdk-core-ts@^0.9.1`

### Testing
- `npm run build`

## [0.9.0] - 2026-06-10

### Changed
- Updated shared dependency targets to:
  - `gdc-common-utils-ts@^1.20.0`
  - `gdc-sdk-core-ts@^0.9.0`
- Reworked the node discovery layer into a thin compatibility facade that
  re-exports the shared dataspace discovery implementation from
  `gdc-sdk-core-ts`.
- Clarified in the README and `docs/101-DISCOVERY.md` that the canonical GW
  hosting discovery entrypoint is the contextualized hosting-operator
  `/.well-known/dspace-version` URL, not the host root.
- Clarified that the host-scoped GW path segment represents
  `hostCoverageScope + networkType`, not the host legal jurisdiction.

### Testing
- `node --test tests/101-dataspace-resolver.test.mjs tests/101-default-first-dataspace-discovery.test.mjs tests/dataspace-resolver.test.mjs tests/dataspace-resolver-advanced.test.mjs`
- `npm run build`

## [0.8.2] - 2026-06-04

### Changed
- Updated shared dependency targets to:
  - `gdc-common-utils-ts@^1.17.0`
  - `gdc-sdk-core-ts@^0.8.2`

### Testing
- `npm run type-check`
- `npm test`

## [0.8.1] - 2026-06-04

### Changed
- Updated shared dependency targets to:
  - `gdc-common-utils-ts@^1.16.0`
  - `gdc-sdk-core-ts@^0.8.1`
- Tightened node actor-facade enforcement so:
  - `OrganizationControllerSdk` keeps only controller-scoped employee flows
  - `IndividualControllerSdk` enforces consent, ingestion, related-person, and
    digital-twin capabilities
  - `OrganizationEmployeeSdk` enforces its own runtime capabilities
- Updated node actor-session bridge tests to stay aligned with the expanded
  capability split defined in `sdk-core`.

### Testing
- `node --test tests/gdc-session-bridge.test.mjs tests/orchestration.test.mjs`
- `npm run build`

## [0.8.0] - 2026-06-04

### Changed
- Updated shared dependency targets to:
  - `gdc-common-utils-ts@^1.16.0`
  - `gdc-sdk-core-ts@^0.8.0`
- Kept the node runtime aligned with the new shared entry-level employee
  editing model exposed by `sdk-core`.

### Testing
- `npm run build`

## [0.7.0] - 2026-06-04

### Changed
- Updated shared dependency targets to:
  - `gdc-common-utils-ts@^1.15.0`
  - `gdc-sdk-core-ts@^0.7.0`
- Kept the node runtime aligned with the new shared bundle-editing foundation
  used by the employee flow in `sdk-core`.

### Testing
- `npm run build`

## [0.6.6] - 2026-06-02

### Changed
- Updated shared dependency targets to:
  - `gdc-common-utils-ts@^1.14.10`
  - `gdc-sdk-core-ts@^0.6.9`
- Clarified the backend discovery and live GW runtime examples around the
  current default-first and IPS ingestion flows.
- Extended the live GW runtime coverage so the backend example path can ingest
  and validate two medication statements coming from two different IPS bundle
  communications.

### Testing
- `npm test`
- `npm run build`

## [0.6.4] - 2026-06-01

### Changed
- Simplified the `default-first` discovery docs further so integrators seed
  defaults from:
  - ICA authority/domain
  - host authority/domain
  - published provider `tenantId` nested under each host
- Updated the shared dependency target to `gdc-common-utils-ts@^1.14.3` so the
  node runtime can use the new authority-based and tenant-based discovery
  builders.

### Testing
- `npm run type-check`
- `npm test`

## [0.6.3] - 2026-06-01

### Added
- Added a high-level default-first discovery facade for portal/backend usage:
  - `createDefaultFirstDataspaceDiscovery(...)`
  - `DefaultFirstDataspaceDiscovery`
  - `getHosts({ sector, jurisdiction, ... })`
  - `getIndexProviders({ sector, jurisdiction, ... })`
  - `getDigitalTwinProviders({ sector, jurisdiction, ... })`
- Added executable 101 coverage in:
  - `tests/101-default-first-dataspace-discovery.test.mjs`

### Changed
- Rewrote `docs/101-DISCOVERY.md` so the primary integration path is the
  simple portal/backend API rather than the lower-level bootstrap plumbing.
- Updated `README.md` to point integrators at the new default-first discovery
  facade and 101 test.

### Testing
- `npm run type-check`
- `npm test`

## [0.6.1] - 2026-06-01

### Changed
- Updated shared dependency targets to:
  - `gdc-common-utils-ts@^1.14.0`
  - `gdc-sdk-core-ts@^0.6.1`
- Kept the node resolver/docs aligned with the shared `default-first`
  bootstrap guidance added in `gdc-common-utils-ts`.

### Testing
- `npm test`

## [0.6.0] - 2026-05-29

### Added
- Added the first backend/BFF-facing dataspace discovery runtime surface:
  - `src/discovery/DataspaceResolver.ts`
  - `src/discovery/types.ts`
  - `src/discovery/index.ts`
- Added public root exports for the dataspace discovery abstraction.
- Added focused resolver tests covering:
  - hosting-operator resolution contract specialization
  - published-provider resolution contract specialization

### Changed
- Updated the shared dependency targets to:
  - `gdc-common-utils-ts@^1.13.0`
  - `gdc-sdk-core-ts@^0.6.0`
  so the
  node runtime can consume the new dataspace discovery semantic DTOs and EU
  coverage helpers.
- Updated `TODO.md` and `docs/101-DISCOVERY.md` to document the staged
  implementation path:
  - common-utils semantic parsing first
  - node resolver orchestration second
  - host catalog publication later in gateway/ICA repos
- Clarified that the resolver `fetcher` dependency is optional and defaults to
  the Node runtime `globalThis.fetch`, while remaining injectable for tests,
  fallback/cache, and transport control.

### Testing
- `npm test -- tests/dataspace-resolver.test.mjs`

## [0.5.2] - 2026-05-28

### Changed
- Updated shared dependency target to `gdc-common-utils-ts@^1.11.0`.
- Clarified backend onboarding documentation around `Organization.hasCredential.material`, `Person.hasCredential.material`, and `SoftwareApplication.material`, including RFC 7638 / RFC 9278 key-id guidance.

### Testing
- `npm test`

## [0.5.2] - 2026-05-28

### Changed
- Updated `docs/101-SDK_END_TO_END.md` so legal-organization and
  software-application trust examples explain the key-binding semantics for:
  - `Organization.hasCredential.material`
  - `Person.hasCredential.material`
  - `SoftwareApplication.material`
- Clarified RFC 7638 JWK thumbprints and RFC 9278 URN representation in the
  backend onboarding/bootstrap narrative.
- Updated the shared `101-VP_TOKEN.md` link to GitHub.

## [0.5.1] - 2026-05-27

### Changed
- Updated shared dependency targets to:
  - `gdc-common-utils-ts@^1.10.0`
  - `gdc-sdk-core-ts@^0.5.1`
- Clarified onboarding capability examples to use the clearer `IndexProvider`
  / `IndexReader` naming.
- Clarified runtime bootstrap documentation around mockable
  `SoftwareApplication` VC input versus optional compact `runtimeVpToken`
  reuse in demo/bootstrap mode.

### Testing
- `npm test`

## [0.3.3] - 2026-05-27

### Changed
- Clarified `docs/101-SDK_END_TO_END.md` so host onboarding examples separate:
  - tenant business sector
  - legacy `HostRouteContext.sector` naming
  - host trust/network selection semantics
- Added explicit runtime-proof guidance for ICA-issued software/runtime
  `vp_token` usage during SDK initialization.
- Extended `NodeHttpClient` so `runtimeVpToken` can be wired as the default
  `Authorization: Bearer ...` value in demo/compat deployments when no explicit
  transport bearer is provided.

### Testing
- `npm test`

## [0.3.2] - 2026-05-26

### Changed
- Reduced `docs/101-SDK_INTEGRATION.md` from a duplicated tutorial into a short runtime/API map that points beginners to `docs/101-SDK_END_TO_END.md` for the full copy/paste flow.
- Kept the integration guide focused on:
  - package/facade selection
  - method-to-flow mapping
  - shared builder references
  - contract notes and discovery status

### Testing
- Doc-only change; no runtime surface change.

## [0.3.1] - 2026-05-26

### Changed
- Updated the public host/professional activation surface so `activateOrganizationInGatewayFromIcaProof(...)` documents the typed `service` activation block instead of a reduced inline shape.
- Aligned onboarding docs with the canonical activation naming and capability rules:
  - `organizationActivation` as the example variable name
  - legal-organization activation always includes `service.url` and `service.capabilities`
- Updated dependency targets to `gdc-common-utils-ts@^1.7.0` and `gdc-sdk-core-ts@^0.3.2`.

### Testing
- `npm run build`
- `npm test`

## [0.3.0] - 2026-05-25

### Changed
- Switched published runtime imports from workspace-relative `../../gdc-sdk-core-ts/dist/...` paths to the package import `gdc-sdk-core-ts`, so the npm artifact works outside the monorepo checkout.
- Aligned shared dependencies to `gdc-common-utils-ts@^1.6.0` and `gdc-sdk-core-ts@^0.3.0`.
- Kept the SDK documentation linked to the canonical shared lifecycle and `101` docs instead of package-local duplicated examples.

### Testing
- `npm run build` passes.
- `npm test` passes.

## [0.2.1] - 2026-05-24

### Changed
- Updated README and `101-SDK_INTEGRATION.md` to document the shared consent-access model, missing-permission evaluation flow, canonical permission-request `Communication`, and subject-scoped lookup by identifier, thread id, or linked CID.

### Testing
- `npm run type-check` passes after the consent-access documentation and re-export alignment.

## 0.2.0 - 2026-05-23

### Added
- Promoted the node runtime alignment with shared bootstrap, VP, SMART, and activation contracts to the first minor release line.
- Added live GW trace support, canonical host activation/controller binding flow coverage, and owner-vs-legal-representative documentation updates.

### Changed
- Aligned the shared dependency to `gdc-common-utils-ts@^1.5.0`.
- Kept the neutral runtime naming (`ActorSession`, `RuntimeClient`, etc.) while preserving legacy aliases for migration.

### Testing
- `npm test` passes against the packaged `gdc-common-utils-ts` artifact, with live GW tests kept as explicit opt-in.

## 0.1.2 - 2026-05-21

### Added
- Expanded TDD coverage for lifecycle-oriented node helpers and facades, including create/update/search flows, polling not-found and timeout paths, direct-client versus fallback submit-and-poll orchestration, and missing-data handling in device activation and SMART token exchanges.
- SDK contract examples are now consumed from `gdc-common-utils-ts/examples` instead of package-local test fixtures.

### Changed
- Added temporary legacy compatibility exports in `legacy-compat.ts` so downstream packages still importing legacy `Gdc*` symbols and `*Simple*` helpers can run while migrating.
- Kept `NodeHttpClient` focused on generic runtime transport/orchestration concerns.
- README, `101-SDK_INTEGRATION.md`, and JSDoc now point to shared request/response contract examples in `gdc-common-utils-ts`.

## 0.1.1 - 2026-05-20

### Changed
- Removed `Gdc` prefixes from Node runtime public surface and aligned imports with renamed core contracts.
- Rebuilt runtime artifacts so `dist` matches the neutral naming used in `src`.
- Rebased Node clinical search/channel typing on core contracts to reduce drift:
  - `CommunicationIngestionInput.communicationPayload` now uses core `CommunicationInput`
  - `ClinicalDateRange` now aliases core `DateRange`
  - `ClinicalBundleSearchInput` now derives from core `BundleSearchQuery` (keeping Node-only polling/request extensions)
- Removed `Simple` suffixes from public runtime contracts/methods where names are already explicit:
  - `GrantProfessionalAccessInput/Result`, `grantProfessionalAccess(...)`, `grantProfessionalAccessWithDeps(...)`
  - `SmartTokenRequestInput`, `requestSmartToken(...)`, `requestSmartTokenWithDeps(...)`
  - `IndividualOrganizationBootstrapInput`, `IndividualOrganizationStartResult`, `startIndividualOrganization(...)`, `startIndividualOrganizationWithDeps(...)`
  - `IndividualOrganizationConfirmOrderInput`, `confirmIndividualOrganizationOrder(...)`, `confirmIndividualOrganizationOrderWithDeps(...)`
  - `LegalOrganizationOrderInput`, `confirmLegalOrganizationOrder(...)`, `confirmLegalOrganizationOrderWithDeps(...)`
  - `EmployeeDeviceActivationRequestInput`, `activateEmployeeDeviceWithActivationRequest(...)`, `activateEmployeeDeviceWithActivationRequestWithDeps(...)`
  - `resolvePollOptionsFromSeconds(...)`
- Renamed internal module filenames to remove `simple-*` path names:
  - `simple-poll-options.ts` -> `poll-options.ts`
  - `simple-smart-token.ts` -> `smart-token.ts`
  - `simple-individual-start.ts` -> `individual-start.ts`
  - `simple-individual-onboarding.ts` -> `individual-onboarding.ts`
  - `simple-host-onboarding.ts` -> `host-onboarding.ts`
  - `simple-device-activation.ts` -> `device-activation.ts`
  - matching test file renames under `tests/`
- Moved neutral polling contracts to `gdc-sdk-core-ts` and consume/re-export them from node runtime seams:
  - `SubmitPayload`, `AsyncPollRequest`, `SubmitResponse`, `PollOptions`, `PollResult`, `SubmitAndPollResult`
- `poll-options.ts` now reuses core `resolvePollOptionsFromSeconds(...)` implementation.

### Testing
- `npm run type-check` passes.
- `npm run build` passes.

## 0.1.0 - 2026-05-18

### Added
- Created `gdc-sdk-node-ts` as the target Node runtime package in the converged `gdc-*` SDK family.
- Added `GdcNodeActorSession` as the first Node-side runtime session primitive.
- Added Node bridge helpers:
  - `createNodeActorSessionsFromDescriptor`
  - `createNodeActorSessionsFromFacades`
  - `createNodeActorSessionFromFacade`
- Wired the package to consume actor/capability contracts from `gdc-sdk-core-ts`.
- Added first runtime orchestration layer in the target package:
  - `GdcHostOnboardingSdk`
  - `GdcOrganizationControllerSdk`
  - `GdcOrganizationEmployeeSdk`
  - `GdcIndividualControllerSdk`
  - `GdcIndividualMemberSdk`
  - `GdcProfessionalSdk`
- Added `GdcNodeRuntimeClient` as the migration seam between the legacy SDK implementation and the new runtime package.
- Added shared polling/runtime types and `submitAndPollWithClient` / `submitAndPollWithMethods` helpers so actor facades can depend on a package-owned async orchestration primitive instead of legacy inline implementation.
- Added `resolveSimplePollOptions` as the converged seconds-to-milliseconds helper for simple runtime flows.
- Added target-package helpers for simple onboarding order confirmations:
  - `confirmLegalOrganizationOrderSimpleWithDeps`
  - `confirmIndividualOrganizationOrderSimpleWithDeps`
- Added `startIndividualOrganizationSimpleWithDeps` as the converged explicit registration step for individual/family onboarding.
- Added `requestSmartTokenSimpleWithDeps` as converged runtime helper for SMART token exchange and `openid-smart` token acquisition.
- Added `activateEmployeeDeviceWithActivationCodeWithDeps` and `activateEmployeeDeviceWithActivationCodeSimpleWithDeps` as converged runtime helpers for exchange + DCR device activation.
- Added converged resource-operation helpers for:
  - organization employee creation
  - IPS/FHIR import
  - RelatedPerson upsert
  - Communication ingestion
  - professional access consent grant
  - digital twin generation
- Added `.gitignore` with `test-results/` excluded from git.
- Added first live GW E2E suite in `tests/live-gw-node-runtime.e2e.test.mjs`.
- Added `test:e2e:live-gw` script and JSONL artifact convention for:
  - `test-results/live-gw-node-runtime-debug-*.jsonl`
  - `test-results/live-gw-http-trace-*.jsonl`
- Added `confirmIndividualOrganizationOrderSimple` to the `GdcNodeRuntimeClient` seam and `GdcIndividualControllerSdk` facade.

### Changed
- Node-side actor session creation now defensively filters capabilities per actor, even when a facade is manually over-populated.
- Node actor-scoped facades now resolve `submitAndPoll` through the target runtime helper, falling back to `submitBatch + pollUntilComplete` when the runtime client does not implement `submitAndPoll` directly.
- Node runtime ownership now includes simple polling option normalization and canonical order-confirmation payload construction for both host legal onboarding and family/individual order confirmation.
- Node target facades now expose `startIndividualOrganizationSimple` as an explicit E2E-faithful onboarding step while continuing to exclude `bootstrapIndividualOrganizationSimple`.
- Removed `bootstrapIndividualOrganizationSimple` from the target Node actor-facade surface; it remains legacy compatibility only in `dataspace-client-sdk-node`.
- Node target runtime now owns explicit post-onboarding steps for SMART token acquisition and device activation.
- Node target runtime now owns most explicit business operations previously concentrated in `dataspace-client-sdk-node/src/client.ts`, leaving the legacy package increasingly as transport/path compatibility.

### Security
- Documented `dataspace-client-sdk-node` as a legacy migration source, not the final package target.
- Established the rule that actor-scoped Node sessions must never inherit foreign capabilities from a malformed facade descriptor.

### Testing
- Added package-level tests for:
  - Family descriptor expansion into scoped node sessions
  - defensive filtering of facade capabilities
  - actor facade delegation through `GdcNodeRuntimeClient`
  - actor-session materialization of role-scoped facades
  - `submitAndPoll` fallback through `submitBatch + pollUntilComplete`
  - canonical legal-order and family-order simple helper payload generation
  - canonical SMART token and device activation helper flows
  - canonical employee/consent/ingestion/digital-twin helper flows
  - migration target status
  - first live GW validation of actor-scoped facades through `GdcNodeActorSession`

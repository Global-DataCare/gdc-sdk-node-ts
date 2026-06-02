# TODO - gdc-sdk-node-ts

## NOW
1. Add node-runtime orchestration for the individual-member licensing/invitation flow by reusing the employee-style license issue pattern where applicable.
2. Add a canonical backend-facing method for resolving active related profiles from GW/index data.
3. Keep portal/BFF integrations thin:
   - backend endpoint exposes business DTOs
   - node SDK hides GW route, submit/poll, and claim-resolution details
4. Document baseline individual-seat semantics:
   - first seat auto-consumed by controller
   - default free 2-seat bundle
   - payment flow only for future paid expansions, not the baseline
5. Add backend-facing consent-management orchestration on top of GW contracts:
   - list/search grouped consents for frontend views
   - preview grouped consent -> atomic rules before submit
   - submit create/update/disable/enable/delete consent operations once GW routes are stable
   - expose filtering helpers for `email`, `phone`, and `did:web` actor selectors
6. Add backend-facing `RelatedPerson` query helpers for UI/BFF layers:
   - active related profiles
   - professional invitation/contact records
   - emergency-contact records
   - individual/family contact records
7. Add backend-facing clinical-import helpers for "Agregar datos":
   - prepare import draft payloads with `section`, `clinical date`, `code.display`, and target resource family
   - hide GW route/path and submit-poll details for document ingestion
   - keep enough metadata for later FHIR R4 / IPS consolidation requests
8. Add backend-facing unified-view / IPS helpers:
   - query/filter consolidated resources by section
   - query/filter consolidated resources by clinical date/date range
   - expose `code.text` and narrative/XHTML availability in business DTOs
   - generate fallback render DTOs when XHTML must be derived from `meta.claims`
9. Add dataspace resolver abstraction and BFF-oriented discovery DTOs:
   - `resolveHostingOperators(...)`
   - `resolvePublishedProviders(...)`
   - host-catalog-driven provider discovery for individuals
10. Follow `docs/101-DISCOVERY.md` for the current dataspace discovery guide.

## NEXT
1. Add BFF-oriented examples for endpoints such as `GET /api/personal/related-profiles`.
2. Add tests for mapping active relationship projections from normalized `RelatedPerson` claims.
3. Add dataspace resolver tests fed by semantic/common discovery DTOs rather than ad hoc local parsers.
4. Add examples for consent-management view APIs and clinical-import draft submission APIs.
5. Add examples for unified-view / IPS filter and render APIs.

## LATER
1. Support optional proxy/re-encryption execution mode without changing the high-level backend API surface.

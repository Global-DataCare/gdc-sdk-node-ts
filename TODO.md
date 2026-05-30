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
5. Add dataspace resolver abstraction and BFF-oriented discovery DTOs:
   - `resolveHostingOperators(...)`
   - `resolvePublishedProviders(...)`
   - host-catalog-driven provider discovery for individuals
6. Follow `docs/DATASPACE_RESOLVER_TODO.md` for exact sequencing and JSDoc scope.

## NEXT
1. Add BFF-oriented examples for endpoints such as `GET /api/personal/related-profiles`.
2. Add tests for mapping active relationship projections from normalized `RelatedPerson` claims.
3. Add dataspace resolver tests fed by semantic/common discovery DTOs rather than ad hoc local parsers.

## LATER
1. Support optional proxy/re-encryption execution mode without changing the high-level backend API surface.

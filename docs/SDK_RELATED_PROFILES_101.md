# SDK Related Profiles 101 for Portal Backends

This is the backend/BFF guide for portal developers who need to add:

- `GET /api/personal/related-profiles`

The frontend should call the portal backend. The backend should call GW using `gdc-sdk-node-ts`.

## Rule

Do not expose raw GW routes to the frontend.

Use a BFF/product endpoint and keep GW transport details inside the backend.

## What the backend needs

- current actor session
- actor public `did:web` or equivalent public actor identifier
- tenant context
- jurisdiction
- sector

## GW call

Use the node runtime helper already exposed by the SDK:

- `searchRelatedProfiles(...)`

Current SDK surface:

- `gdc-sdk-node-ts/src/node-runtime-client.ts`
- `gdc-sdk-node-ts/src/resource-operations.ts`

## Request contract to GW

The backend sends a `RelatedPerson/_search` request with:

- `actorIdentifier`
- optional `subjectId`
- optional `relationship`
- optional `includeInactive`

## Minimal backend DTO

Return this to the frontend:

```ts
/**
 * Frontend-facing DTO for profile selectors and role-aware dashboards.
 */
export type BackendRelatedProfilesResponse = {
  actorIdentifier: string;
  total: number;
  data: Array<{
    relationshipId: string;
    source: 'relatedperson';
    subjectId: string;
    actorIdentifier?: string;
    actorDisplayName?: string;
    actorTelecom?: string;
    relationship?: string;
    role: 'controller' | 'caregiver' | 'related-person' | 'professional' | 'member' | 'unknown';
    isController: boolean;
    status: 'active' | 'pending' | 'inactive' | 'revoked';
    claims: Record<string, unknown>;
  }>;
};
```

## Express example

```ts
import express from 'express';
import { HttpRuntimeClient } from 'gdc-sdk-node-ts';

/**
 * Builds the product endpoint used by the portal frontend.
 *
 * The frontend never calls GW directly. It calls this backend route.
 */
export function buildRelatedProfilesRouter(runtimeClient: HttpRuntimeClient) {
  const router = express.Router();

  router.get('/api/personal/related-profiles', async (req, res, next) => {
    try {
      const actorDid = String(res.locals.session.actorDid || '').trim();
      if (!actorDid) {
        res.status(401).json({ error: 'missing actorDid in session' });
        return;
      }

      const result = await runtimeClient.searchRelatedProfiles(
        {
          tenantId: res.locals.session.tenantId,
          jurisdiction: res.locals.session.jurisdiction,
          sector: res.locals.session.sector,
        },
        {
          actorIdentifier: actorDid,
        },
      );

      const bundle = result.body as { data?: Array<{ resource?: unknown }> };
      const resource = bundle?.data?.[0]?.resource;
      res.status(200).json(resource);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
```

## Fastify example

```ts
import type { FastifyInstance } from 'fastify';
import { HttpRuntimeClient } from 'gdc-sdk-node-ts';

/**
 * Registers the canonical portal endpoint for related profile discovery.
 */
export async function registerRelatedProfilesRoutes(
  fastify: FastifyInstance,
  runtimeClient: HttpRuntimeClient,
) {
  fastify.get('/api/personal/related-profiles', async (request, reply) => {
    const actorDid = String((request as any).session?.actorDid || '').trim();
    if (!actorDid) {
      return reply.code(401).send({ error: 'missing actorDid in session' });
    }

    const result = await runtimeClient.searchRelatedProfiles(
      {
        tenantId: (request as any).session.tenantId,
        jurisdiction: (request as any).session.jurisdiction,
        sector: (request as any).session.sector,
      },
      {
        actorIdentifier: actorDid,
      },
    );

    const bundle = result.body as { data?: Array<{ resource?: unknown }> };
    return reply.code(200).send(bundle?.data?.[0]?.resource || { actorIdentifier: actorDid, total: 0, data: [] });
  });
}
```

## Backend rules

- keep `did:web` actor identity separate from technical backend transport identity
- do not pass raw GW URLs to the browser
- do not let the browser decide the tenant context arbitrarily
- use shared DTOs/constants instead of hardcoded claim names

## What frontend developers should expect

The frontend should only need:

- one endpoint
- one DTO
- one active-profile selector

No GW `_search` route or FHIR search details should leak into browser code.

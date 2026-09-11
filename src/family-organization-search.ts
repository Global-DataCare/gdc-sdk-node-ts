// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import {
  readFamilyOrganizationSummaryFromResponseBody,
  type FamilyOrganizationSummary,
} from 'gdc-common-utils-ts/utils/family-organization-summary';
import { ClaimsOrganizationSchemaorg, ClaimsServiceSchemaorg } from 'gdc-common-utils-ts/constants';
import { resolvePollOptionsFromSeconds } from './poll-options.js';
import type { PollOptions, SubmitAndPollResult } from './orchestration/client-port.js';
import type { RouteContext } from './individual-onboarding.js';

export type FamilyOrganizationSearchInput = Readonly<{
  controllerPhone: string;
  usualname: string;
  birthDate?: string;
  timeoutSeconds?: number;
  intervalSeconds?: number;
}>;

export type OwnedFamilyOrganizationDirectoryInput = Readonly<{
  verifiedContact: Readonly<{ email?: string; telephone?: string }>;
  requestThid?: string;
  timeoutSeconds?: number;
  intervalSeconds?: number;
}>;

export type OwnedFamilyOrganizationDirectoryEntry = Readonly<{
  resourceId: string;
  alternateName: string;
  claims: Readonly<Record<string, unknown>>;
}>;

type SearchFamilyOrganizationWithDeps = {
  routeCtx: RouteContext;
  input: FamilyOrganizationSearchInput;
  defaultTimeoutMs?: number;
  defaultIntervalMs?: number;
  individualFamilyOrganizationSearchPath: (ctx: RouteContext) => string;
  individualFamilyOrganizationSearchPollPath: (ctx: RouteContext) => string;
  submitAndPoll: (
    submitPath: string,
    pollPath: string,
    payload: { thid?: string } & Record<string, unknown>,
    options?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
};

/**
 * Searches one existing family/individual organization registration by the
 * current phone-first business key used by extension channel flows.
 *
 * Returns one normalized summary when the registration exists, otherwise
 * `null`.
 */
export async function searchFamilyOrganizationWithDeps(
  deps: SearchFamilyOrganizationWithDeps,
): Promise<FamilyOrganizationSummary | null> {
  const controllerPhone = String(deps.input.controllerPhone || '').trim();
  const usualname = String(deps.input.usualname || '').trim();
  const birthDate = String(deps.input.birthDate || '').trim();

  if (!controllerPhone) {
    throw new Error('searchFamilyOrganization requires controllerPhone.');
  }
  if (!usualname) {
    throw new Error('searchFamilyOrganization requires usualname.');
  }

  const claims: Record<string, unknown> = {
    '@context': 'org.schema',
    [ClaimsOrganizationSchemaorg.ownerTelephone]: controllerPhone,
    [ClaimsOrganizationSchemaorg.alternateName]: usualname,
    [ClaimsServiceSchemaorg.category]: deps.routeCtx.sector,
    ...(birthDate ? { 'org.schema.Organization.foundingDate': birthDate } : {}),
  };

  const payload = {
    jti: `jti-${createRuntimeUuid()}`,
    thid: `family-search-${createRuntimeUuid()}`,
    iss: deps.routeCtx.tenantId,
    aud: deps.routeCtx.tenantId,
    type: 'application/api+json',
    body: {
      data: [{
        type: 'Family-search-v1.0',
        resource: { meta: { claims } },
      }],
    },
  };

  const pollOptions = resolvePollOptionsFromSeconds(
    deps.input.timeoutSeconds,
    deps.input.intervalSeconds,
    {
      timeoutMs: deps.defaultTimeoutMs,
      intervalMs: deps.defaultIntervalMs,
    },
  );

  const result = await deps.submitAndPoll(
    deps.individualFamilyOrganizationSearchPath(deps.routeCtx),
    deps.individualFamilyOrganizationSearchPollPath(deps.routeCtx),
    payload,
    pollOptions,
  );

  if (result.poll.status !== 200) {
    return null;
  }

  return readFamilyOrganizationSummaryFromResponseBody(result.poll.body);
}

/**
 * Lists the complete owner-scoped individual Organization directory.
 *
 * CORE requires an exact verified owner contact and deliberately performs no
 * global or prefix scan. Callers may filter the returned alternate names only
 * after this authenticated directory boundary.
 */
export async function listOwnedFamilyOrganizationsWithDeps(
  routeCtx: RouteContext,
  input: OwnedFamilyOrganizationDirectoryInput,
  deps: Pick<SearchFamilyOrganizationWithDeps,
    'individualFamilyOrganizationSearchPath'
    | 'individualFamilyOrganizationSearchPollPath'
    | 'submitAndPoll'
    | 'defaultTimeoutMs'
    | 'defaultIntervalMs'>,
): Promise<OwnedFamilyOrganizationDirectoryEntry[]> {
  const email = String(input.verifiedContact?.email || '').trim().toLowerCase();
  const telephone = String(input.verifiedContact?.telephone || '').trim();
  if (!email && !telephone) {
    throw new Error('A verified owner email or telephone is required.');
  }
  const claims: Record<string, unknown> = {
    '@context': 'org.schema',
    ...(email ? { [ClaimsOrganizationSchemaorg.ownerEmail]: email } : {}),
    ...(telephone ? { [ClaimsOrganizationSchemaorg.ownerTelephone]: telephone } : {}),
  };
  const pollOptions = resolvePollOptionsFromSeconds(
    input.timeoutSeconds,
    input.intervalSeconds,
    {
      timeoutMs: deps.defaultTimeoutMs,
      intervalMs: deps.defaultIntervalMs,
    },
  );
  const result = await deps.submitAndPoll(
    deps.individualFamilyOrganizationSearchPath(routeCtx),
    deps.individualFamilyOrganizationSearchPollPath(routeCtx),
    {
      jti: `jti-${createRuntimeUuid()}`,
      thid: input.requestThid || `owned-family-directory-${createRuntimeUuid()}`,
      iss: routeCtx.tenantId,
      aud: routeCtx.tenantId,
      type: 'application/api+json',
      body: {
        data: [{
          type: 'Family-search-v1.0',
          resource: { meta: { claims } },
        }],
      },
    },
    pollOptions,
  );
  if (result.poll.status !== 200) return [];
  const root = (result.poll.body as any)?.body || result.poll.body as any;
  const responseEntries = Array.isArray(root?.data) ? root.data : [];
  const resources = responseEntries.flatMap((entry: any) =>
    Array.isArray(entry?.resource?.entry)
      ? entry.resource.entry.map((item: any) => item?.resource).filter(Boolean)
      : []);
  return resources.flatMap((resource: any) => {
    const resourceClaims = resource?.meta?.claims;
    if (!resource?.id || !resourceClaims || typeof resourceClaims !== 'object') return [];
    const ownerEmail = String(resourceClaims[ClaimsOrganizationSchemaorg.ownerEmail] || '').trim().toLowerCase();
    const ownerTelephone = String(resourceClaims[ClaimsOrganizationSchemaorg.ownerTelephone] || '').trim();
    if (!((email && ownerEmail === email) || (telephone && ownerTelephone === telephone))) return [];
    const alternateName = String(resourceClaims[ClaimsOrganizationSchemaorg.alternateName] || '').trim();
    if (!alternateName) return [];
    return [{ resourceId: String(resource.id), alternateName, claims: resourceClaims }];
  });
}

function createRuntimeUuid(): string {
  const fromCrypto = globalThis.crypto?.randomUUID?.();
  if (fromCrypto) {
    return fromCrypto;
  }
  return `fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

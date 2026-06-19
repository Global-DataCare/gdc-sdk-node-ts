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
 * current phone-first business key used by UHC/UNID channel flows.
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
        meta: { claims },
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

function createRuntimeUuid(): string {
  const fromCrypto = globalThis.crypto?.randomUUID?.();
  if (fromCrypto) {
    return fromCrypto;
  }
  return `fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

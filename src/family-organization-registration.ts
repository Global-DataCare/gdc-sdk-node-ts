// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import type { FamilyOrganizationSummary } from 'gdc-common-utils-ts/utils/family-organization-summary';
import type { RouteContext } from './individual-onboarding.js';
import {
  startIndividualOrganizationWithDeps,
  type IndividualOrganizationBootstrapInput,
  type IndividualOrganizationStartResult,
} from './individual-start.js';
import {
  searchFamilyOrganizationWithDeps,
  type FamilyOrganizationSearchInput,
} from './family-organization-search.js';
import { extractOfferIdFromResponseBody, extractOfferPreviewFromResponseBody } from './order-offer-summary.js';
import type { PollOptions, SubmitAndPollResult } from './orchestration/client-port.js';

export type EnsureFamilyOrganizationRegistrationInput = FamilyOrganizationSearchInput & Readonly<{
  controllerEmail?: string;
  controllerRole?: string;
  serviceProviderDid?: string;
  tenantId?: string;
  jurisdiction?: string;
  sector?: string;
  additionalClaims?: Record<string, unknown>;
}>;

export type EnsureFamilyOrganizationRegistrationResult = Readonly<{
  status: 'already_exists' | 'resume_required' | 'new_created';
  summary?: FamilyOrganizationSummary;
  started?: IndividualOrganizationStartResult;
}>;

type EnsureFamilyOrganizationRegistrationDeps = {
  routeCtx: RouteContext;
  input: EnsureFamilyOrganizationRegistrationInput;
  defaultTimeoutMs?: number;
  defaultIntervalMs?: number;
  individualFamilyOrganizationSearchPath: (ctx: RouteContext) => string;
  individualFamilyOrganizationSearchPollPath: (ctx: RouteContext) => string;
  individualFamilyOrganizationBatchPath: (ctx: RouteContext) => string;
  individualFamilyOrganizationPollPath: (ctx: RouteContext) => string;
  submitAndPoll: (
    submitPath: string,
    pollPath: string,
    payload: { thid?: string } & Record<string, unknown>,
    options?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
};

/**
 * High-level controller orchestration for phone-first onboarding channels:
 * - first search whether the family/individual registration already exists
 * - if it exists, return the normalized summary
 * - otherwise start the bootstrap flow using the same business input
 */
export async function ensureFamilyOrganizationRegistrationWithDeps(
  deps: EnsureFamilyOrganizationRegistrationDeps,
): Promise<EnsureFamilyOrganizationRegistrationResult> {
  const summary = await searchFamilyOrganizationWithDeps({
    routeCtx: deps.routeCtx,
    input: deps.input,
    defaultTimeoutMs: deps.defaultTimeoutMs,
    defaultIntervalMs: deps.defaultIntervalMs,
    individualFamilyOrganizationSearchPath: deps.individualFamilyOrganizationSearchPath,
    individualFamilyOrganizationSearchPollPath: deps.individualFamilyOrganizationSearchPollPath,
    submitAndPoll: deps.submitAndPoll,
  });

  if (summary?.status === 'already_exists' || summary?.status === 'resume_required') {
    return {
      status: summary.status,
      summary,
    };
  }

  const started = await startIndividualOrganizationWithDeps({
    input: {
      serviceProviderDid: deps.input.serviceProviderDid,
      tenantId: deps.input.tenantId,
      jurisdiction: deps.input.jurisdiction,
      sector: deps.input.sector,
      alternateName: deps.input.usualname,
      controllerEmail: deps.input.controllerEmail,
      controllerTelephone: deps.input.controllerPhone,
      controllerRole: deps.input.controllerRole,
      additionalClaims: deps.input.additionalClaims,
      timeoutSeconds: deps.input.timeoutSeconds,
      intervalSeconds: deps.input.intervalSeconds,
    } satisfies IndividualOrganizationBootstrapInput,
    routeCtx: deps.routeCtx,
    defaultTimeoutMs: deps.defaultTimeoutMs,
    defaultIntervalMs: deps.defaultIntervalMs,
    individualFamilyOrganizationBatchPath: deps.individualFamilyOrganizationBatchPath,
    individualFamilyOrganizationPollPath: deps.individualFamilyOrganizationPollPath,
    submitAndPoll: deps.submitAndPoll,
    getOfferIdFromResponse: (result) => extractOfferIdFromResponseBody(result.poll.body),
    getOfferPreviewFromResponse: (result) => extractOfferPreviewFromResponseBody(result.poll.body),
  });

  return {
    status: 'new_created',
    started,
  };
}

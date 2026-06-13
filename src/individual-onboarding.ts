// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import type { DataspaceSector } from 'gdc-common-utils-ts/constants';
import type { PollOptions, SubmitAndPollResult } from './orchestration/client-port.js';
import { resolvePollOptionsFromSeconds } from './poll-options.js';

export type RouteContext = {
  tenantId: string;
  jurisdiction: string;
  sector: DataspaceSector | string;
};

export type IndividualOrganizationConfirmOrderInput = {
  /**
   * Preferred route identifier for the selected personal indexing service provider.
   */
  serviceProviderDid?: string;
  /**
   * @deprecated Use `serviceProviderDid`.
   */
  tenantId?: string;
  jurisdiction?: string;
  sector?: string;
  offerId: string;
  additionalClaims?: Record<string, unknown>;
  timeoutSeconds?: number;
  intervalSeconds?: number;
};

type ConfirmIndividualOrganizationOrderDeps = {
  input: IndividualOrganizationConfirmOrderInput;
  routeCtx: RouteContext;
  defaultTimeoutMs?: number;
  defaultIntervalMs?: number;
  individualFamilyOrderBatchPath: (ctx: RouteContext) => string;
  individualFamilyOrderPollPath: (ctx: RouteContext) => string;
  submitAndPoll: (
    submitPath: string,
    pollPath: string,
    payload: { thid?: string } & Record<string, unknown>,
    options?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
};

export async function confirmIndividualOrganizationOrderWithDeps(
  deps: ConfirmIndividualOrganizationOrderDeps,
): Promise<SubmitAndPollResult> {
  const offerId = String(deps.input.offerId || '').trim();
  if (!offerId) {
    throw new Error('confirmIndividualOrganizationOrder requires offerId.');
  }

  const orderClaims: Record<string, unknown> = {
    '@context': 'org.schema',
    'Order.acceptedOffer.identifier': offerId,
    ...(deps.input.additionalClaims || {}),
  };

  const payload = {
    jti: `jti-${createRuntimeUuid()}`,
    iss: deps.routeCtx.tenantId,
    aud: deps.routeCtx.tenantId,
    type: 'application/didcomm-plain+json',
    thid: `family-order-${createRuntimeUuid()}`,
    body: {
      data: [{
        type: 'Family-order-request-v1.0',
        meta: { claims: orderClaims },
        resource: { meta: { claims: orderClaims } },
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

  return deps.submitAndPoll(
    deps.individualFamilyOrderBatchPath(deps.routeCtx),
    deps.individualFamilyOrderPollPath(deps.routeCtx),
    payload,
    pollOptions,
  );
}

function createRuntimeUuid(): string {
  const fromCrypto = globalThis.crypto?.randomUUID?.();
  if (fromCrypto) {
    return fromCrypto;
  }
  return `fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import type { PollOptions, SubmitAndPollResult } from './orchestration/client-port.js';
import { resolvePollOptionsFromSeconds } from './poll-options.js';

/**
 * Current host-registry route context for existing host endpoints.
 *
 * This is a routing object for host registry calls. It is not the same thing as
 * a node-operator discovery descriptor.
 */
export type HostRouteContext = {
  jurisdiction: string;
  sector: string;
  controllerDid?: string;
  hostDid?: string;
};

/**
 * Input for legal-organization order confirmation in the host registry.
 */
export type LegalOrganizationOrderInput = {
  offerId: string;
  jurisdiction?: string;
  sector?: string;
  dataType?: string;
  additionalClaims?: Record<string, unknown>;
  timeoutSeconds?: number;
  intervalSeconds?: number;
};

type ConfirmLegalOrganizationOrderDeps = {
  input: LegalOrganizationOrderInput;
  hostCtx: HostRouteContext;
  defaultTimeoutMs?: number;
  defaultIntervalMs?: number;
  hostRegistryOrderBatchPath: (ctx: HostRouteContext) => string;
  hostRegistryOrderPollPath: (ctx: HostRouteContext) => string;
  submitAndPoll: (
    submitPath: string,
    pollPath: string,
    payload: { thid?: string } & Record<string, unknown>,
    options?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
};

export async function confirmLegalOrganizationOrderWithDeps(
  deps: ConfirmLegalOrganizationOrderDeps,
): Promise<SubmitAndPollResult> {
  const offerId = String(deps.input.offerId || '').trim();
  if (!offerId) {
    throw new Error('confirmLegalOrganizationOrder requires offerId.');
  }

  const claims: Record<string, unknown> = {
    '@context': 'org.schema',
    'Order.acceptedOffer.identifier': offerId,
    ...(deps.input.additionalClaims || {}),
  };

  const payload = {
    jti: `jti-${createRuntimeUuid()}`,
    iss: String(deps.hostCtx.controllerDid || '').trim() || undefined,
    aud: String(deps.hostCtx.hostDid || '').trim() || undefined,
    type: 'application/didcomm-plain+json',
    thid: `order-${createRuntimeUuid()}`,
    body: {
      data: [{
        type: deps.input.dataType || 'Organization-order-request-v1.0',
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

  return deps.submitAndPoll(
    deps.hostRegistryOrderBatchPath(deps.hostCtx),
    deps.hostRegistryOrderPollPath(deps.hostCtx),
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

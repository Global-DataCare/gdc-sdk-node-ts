// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import type { DataspaceSector } from 'gdc-common-utils-ts/constants';
import { extractPrimaryClaims } from 'gdc-common-utils-ts';
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

/**
 * Terminal individual Order result with the opaque code required by the
 * subsequent managed-wallet activation and DCR flow.
 */
export type IndividualOrganizationOrderResult = SubmitAndPollResult & Readonly<{
  activationCode: string;
}>;

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
): Promise<IndividualOrganizationOrderResult> {
  /**
   * Programming rule:
   * - `offerId` here must come from the commercial individual/family bootstrap
   *   response
   * - this helper must not be used for embedded legacy individual registration
   *   responses that do not mint an Offer
   */
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

  const order = await deps.submitAndPoll(
    deps.individualFamilyOrderBatchPath(deps.routeCtx),
    deps.individualFamilyOrderPollPath(deps.routeCtx),
    payload,
    pollOptions,
  );
  const activationCode = readIndividualOrganizationActivationCode(order.poll.body);
  if (!activationCode) {
    throw new Error('confirmIndividualOrganizationOrder failed: missing controller activation code in GW Order response.');
  }
  return { ...order, activationCode };
}

/**
 * Reads the opaque controller activation code from a completed individual
 * Order. Integrators should consume `result.activationCode` instead of calling
 * this reader directly; it remains public for response-adapter compatibility.
 */
export function readIndividualOrganizationActivationCode(responseBody: unknown): string | undefined {
  const claims = extractPrimaryClaims(responseBody);
  return String(claims['org.schema.IndividualProduct.serialNumber'] || '').trim() || undefined;
}

function createRuntimeUuid(): string {
  const fromCrypto = globalThis.crypto?.randomUUID?.();
  if (fromCrypto) {
    return fromCrypto;
  }
  return `fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

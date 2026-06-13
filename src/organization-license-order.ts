// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import type { PollOptions, SubmitAndPollResult } from './orchestration/client-port.js';
import { resolvePollOptionsFromSeconds } from './poll-options.js';
import type { HostRouteContext } from './host-onboarding.js';
import type { RouteContext } from './individual-onboarding.js';

/**
 * High-level runtime input for organization-side extra-license activation after
 * the portal has already resolved the commercial/payment step out of band.
 *
 * Target business sequence:
 * - portal lists/searches `Offer`
 * - portal completes the fictitious or real payment outside GW CORE
 * - portal confirms the accepted offer to GW CORE
 * - GW CORE materializes the new `device-licenses` seats for the tenant
 *
 * Transport note:
 * - current GW CORE exposes this confirmation step through the host
 *   `registry/org.schema/Order/_batch` route
 * - the organization controller still reasons in tenant context, so the
 *   runtime adapts that higher-level intent onto the current host route
 */
export type OrganizationLicenseOrderConfirmInput = Readonly<{
  offerId: string;
  hostNetwork?: string;
  dataType?: string;
  additionalClaims?: Record<string, unknown>;
  timeoutSeconds?: number;
  intervalSeconds?: number;
}>;

type ConfirmOrganizationLicenseOrderDeps = Readonly<{
  routeCtx: RouteContext;
  input: OrganizationLicenseOrderConfirmInput;
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
}>;

export async function confirmOrganizationLicenseOrderWithDeps(
  deps: ConfirmOrganizationLicenseOrderDeps,
): Promise<SubmitAndPollResult> {
  const offerId = String(deps.input.offerId || '').trim();
  if (!offerId) {
    throw new Error('confirmOrganizationLicenseOrder requires offerId.');
  }

  const claims: Record<string, unknown> = {
    '@context': 'org.schema',
    'Order.acceptedOffer.identifier': offerId,
    ...(deps.input.additionalClaims || {}),
  };
  const hostCtx: HostRouteContext = {
    jurisdiction: String(deps.routeCtx.jurisdiction || '').trim(),
    hostNetwork: String(deps.input.hostNetwork || 'test').trim() || 'test',
  };
  const payload = {
    jti: `jti-${createRuntimeUuid()}`,
    iss: deps.routeCtx.tenantId,
    aud: deps.routeCtx.tenantId,
    type: 'application/didcomm-plain+json',
    thid: `organization-license-order-${createRuntimeUuid()}`,
    body: {
      data: [{
        type: deps.input.dataType || 'Organization-order-request-v1.0',
        meta: { claims },
        resource: { meta: { claims } },
      }],
    },
  };

  return deps.submitAndPoll(
    deps.hostRegistryOrderBatchPath(hostCtx),
    deps.hostRegistryOrderPollPath(hostCtx),
    payload,
    resolvePollOptionsFromSeconds(
      deps.input.timeoutSeconds,
      deps.input.intervalSeconds,
      {
        timeoutMs: deps.defaultTimeoutMs,
        intervalMs: deps.defaultIntervalMs,
      },
    ),
  );
}

function createRuntimeUuid(): string {
  const fromCrypto = globalThis.crypto?.randomUUID?.();
  if (fromCrypto) {
    return fromCrypto;
  }
  return `fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

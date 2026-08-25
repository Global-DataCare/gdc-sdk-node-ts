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
 * - that host route owns commercial routing and persistence only; it does not
 *   change the security principal or move controller keys into the host vault
 * - `issuerDid` must be the exact controller DID registered through DCR for the
 *   tenant in `routeCtx`; signed/encrypted transports therefore emit its
 *   registered `kid`/`skid`, and GW resolves those public keys from that tenant
 * - `aud` remains the tenant id so GW cannot confuse a host-routed Order with a
 *   host-authored controller request
 */
export type OrganizationLicenseOrderConfirmInput = Readonly<{
  /** Exact tenant DCR-registered controller DID used as `iss` and key owner. */
  issuerDid: string;
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
  const issuerDid = String(deps.input.issuerDid || '').trim();
  if (!issuerDid) {
    throw new Error('confirmOrganizationLicenseOrder requires issuerDid.');
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
    iss: issuerDid,
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

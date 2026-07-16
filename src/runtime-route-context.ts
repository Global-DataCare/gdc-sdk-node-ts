// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import { extractTenantIdFromHostedDidWeb } from 'gdc-common-utils-ts';
import type { HostRouteContext } from './host-onboarding.js';
import type { RouteContext } from './individual-onboarding.js';

export type HostNetworkWarningState = {
  warnedDefaultHostNetwork: boolean;
};

let warnedServiceProviderDidRouteTenant = false;

export function requireRouteContext(ctx?: RouteContext, defaultCtx?: RouteContext): RouteContext {
  const resolved = ctx || defaultCtx;
  const tenantId = String(resolved?.tenantId || '').trim();
  const jurisdiction = String(resolved?.jurisdiction || '').trim();
  const sector = String(resolved?.sector || '').trim();
  if (!tenantId || !jurisdiction || !sector) {
    throw new Error('Route context is required.');
  }
  return { tenantId, jurisdiction, sector };
}

export function routeCtxFromInput(
  input: { serviceProviderDid?: string; tenantId?: string; jurisdiction?: string; sector?: string },
  defaultCtx?: RouteContext,
): RouteContext {
  const explicitTenantId = String(input.tenantId || '').trim();
  const serviceProviderDid = String(input.serviceProviderDid || '').trim();
  let tenantId = explicitTenantId;
  if (!tenantId && serviceProviderDid) {
    const extractedTenantId = extractTenantIdFromHostedDidWeb(serviceProviderDid);
    if (extractedTenantId) {
      if (!warnedServiceProviderDidRouteTenant) {
        warnedServiceProviderDidRouteTenant = true;
        console.warn(
          `[gdc-sdk-node-ts] serviceProviderDid is a compatibility alias for route tenant ids. Pass tenantId instead. Extracted tenantId='${extractedTenantId}' from hosted did:web '${serviceProviderDid}'.`,
        );
      }
      tenantId = extractedTenantId;
    } else {
      tenantId = serviceProviderDid;
    }
  }
  return requireRouteContext(
    tenantId && input.jurisdiction && input.sector
      ? { tenantId, jurisdiction: input.jurisdiction, sector: input.sector }
      : undefined,
    defaultCtx,
  );
}

export function requireHostRouteContext(
  ctx: HostRouteContext | undefined,
  options: Readonly<{
    defaultJurisdiction?: string;
    defaultHostNetwork?: string;
    defaultHostNetworkOrTenantSector?: string;
    warningState: HostNetworkWarningState;
    warn: (message: string) => void;
  }>,
): HostRouteContext {
  const hostCtx = (ctx || {}) as HostRouteContext & { hostNetworkOrTenantSector?: string };
  const jurisdiction = String(hostCtx.jurisdiction || options.defaultJurisdiction || '').trim();
  const explicitHostNetwork = String(hostCtx.hostNetwork || options.defaultHostNetwork || '').trim();
  const compatibilityHostNetwork = String(
    hostCtx.hostNetworkOrTenantSector
    || options.defaultHostNetworkOrTenantSector
    || '',
  ).trim();
  const deprecatedSector = String(hostCtx.sector || '').trim();
  if (!explicitHostNetwork && !compatibilityHostNetwork && deprecatedSector) {
    throw new Error(
      `Host route context must use 'hostNetwork', not 'sector'. Received deprecated sector='${deprecatedSector}'.`,
    );
  }
  const hostNetwork = String(
    explicitHostNetwork
    || compatibilityHostNetwork
    || '',
  ).trim();
  if (!jurisdiction) throw new Error('Host route context is required.');
  if (!hostNetwork) {
    if (!options.warningState.warnedDefaultHostNetwork) {
      options.warningState.warnedDefaultHostNetwork = true;
      options.warn(
        "[gdc-sdk-node-ts] Missing hostNetwork in host route context. Defaulting to 'test'. Pass hostNetwork explicitly to avoid environment drift.",
      );
    }
    return { jurisdiction, hostNetwork: 'test' };
  }
  if (!isSupportedHostNetwork(hostNetwork)) {
    throw new Error(
      `Invalid hostNetwork '${hostNetwork}'. Allowed values: test, local-network, test-network, network.`,
    );
  }
  return { jurisdiction, hostNetwork };
}

export function isSupportedHostNetwork(value: string): boolean {
  return (
    value === 'test'
    || value === 'local-network'
    || value === 'test-network'
    || value === 'network'
  );
}

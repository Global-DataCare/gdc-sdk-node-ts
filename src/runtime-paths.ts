// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.
import { buildGwCoreTenantResourceActionPath } from 'gdc-common-utils-ts/utils/gw-core-path';

import type { HostRouteContext } from './host-onboarding.js';
import type { RouteContext } from './individual-onboarding.js';

export function buildV1Path(
  routeCtx: RouteContext,
  section: string,
  format: string,
  resourceType: string,
  action: string,
): string {
  return buildGwCoreTenantResourceActionPath({
    tenantId: routeCtx.tenantId,
    jurisdiction: routeCtx.jurisdiction,
    version: 'v1',
    sector: routeCtx.sector,
    section,
    format,
    resourceType,
    action,
  });
}

export function buildHostRegistryPath(
  hostCtx: HostRouteContext,
  resourceType: string,
  action: string,
): string {
  return `/host/cds-${encodeURIComponent(hostCtx.jurisdiction)}/v1/${encodeURIComponent(hostCtx.hostNetwork || '')}/registry/org.schema/${encodeURIComponent(resourceType)}/${encodeURIComponent(action)}`;
}

export function buildOrganizationDidBindingPath(routeCtx: RouteContext): string {
  return `/${encodeURIComponent(routeCtx.tenantId)}/cds-${encodeURIComponent(routeCtx.jurisdiction)}/v1/${encodeURIComponent(routeCtx.sector)}/did/document/_binding`;
}

export function buildOrganizationDidBindingPollPath(routeCtx: RouteContext): string {
  return `/${encodeURIComponent(routeCtx.tenantId)}/cds-${encodeURIComponent(routeCtx.jurisdiction)}/v1/${encodeURIComponent(routeCtx.sector)}/did/document/_binding-response`;
}

export function buildIdentityTokenExchangePath(ctx: RouteContext): string {
  return `/${encodeURIComponent('host')}/cds-${encodeURIComponent(ctx.jurisdiction)}/v1/${encodeURIComponent(ctx.sector)}/${encodeURIComponent(ctx.tenantId)}/identity/auth/_exchange`;
}

export function buildIdentityTokenExchangePollPath(ctx: RouteContext): string {
  return `/${encodeURIComponent('host')}/cds-${encodeURIComponent(ctx.jurisdiction)}/v1/${encodeURIComponent(ctx.sector)}/${encodeURIComponent(ctx.tenantId)}/identity/auth/_exchange-response`;
}

export function buildIdentityDeviceDcrPath(ctx: RouteContext): string {
  return `/${encodeURIComponent('host')}/cds-${encodeURIComponent(ctx.jurisdiction)}/v1/${encodeURIComponent(ctx.sector)}/${encodeURIComponent(ctx.tenantId)}/identity/auth/_dcr`;
}

export function buildIdentityDeviceDcrPollPath(ctx: RouteContext): string {
  return `/${encodeURIComponent('host')}/cds-${encodeURIComponent(ctx.jurisdiction)}/v1/${encodeURIComponent(ctx.sector)}/${encodeURIComponent(ctx.tenantId)}/identity/auth/_dcr-response`;
}

export function buildIdentityOpenIdSmartTokenPath(ctx: RouteContext): string {
  return `/${encodeURIComponent(ctx.tenantId)}/cds-${encodeURIComponent(ctx.jurisdiction)}/v1/${encodeURIComponent(ctx.sector)}/identity/openid/smart/token`;
}

export function buildIdentityOpenIdSmartTokenPollPath(ctx: RouteContext): string {
  return `/${encodeURIComponent(ctx.tenantId)}/cds-${encodeURIComponent(ctx.jurisdiction)}/v1/${encodeURIComponent(ctx.sector)}/identity/openid/smart/_batch-response`;
}

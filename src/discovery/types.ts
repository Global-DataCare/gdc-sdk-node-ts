// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import type {
  DataspaceDiscoveryDefaultsRegistry,
  DataspaceDiscoveryDefaultsRegistrySeed,
  DataspaceDiscoveryFilter,
  HostingOperatorDiscoveryCatalog,
  HostingOperatorSemanticRecord,
  PublishedProviderCatalogRecord,
  TenantServiceSemanticRecord,
} from 'gdc-common-utils-ts';

/**
 * Input for resolving hosting operators that can serve a given dataspace use
 * case.
 */
export type ResolveHostingOperatorsInput = Omit<DataspaceDiscoveryFilter, 'capability'> & Readonly<{
  requiredCapabilities: readonly string[];
}>;

/**
 * Input for resolving publicly published providers through hosting-operator
 * catalogs.
 */
export type ResolvePublishedProvidersInput = Omit<DataspaceDiscoveryFilter, 'capability' | 'requiredCapabilities'> & Readonly<{
  providerCapability: string;
}>;

/**
 * Preloaded semantic hosting-operator record used by the node runtime to
 * resolve public discovery data without re-parsing VCs.
 */
export type PreloadedHostingOperatorRecord = Readonly<{
  operatorDid: string;
  /**
   * Canonical DSP discovery entrypoint.
   *
   * For GW CORE this should normally be `/.well-known/dspace-version`.
   */
  discoveryUrl?: string;
  /**
   * @deprecated Prefer `discoveryUrl`. This remains as a compatibility field
   * for direct catalog artifact URLs.
   */
  catalogUrl?: string;
  record: HostingOperatorSemanticRecord;
}>;

/**
 * Runtime configuration for the HTTP-capable dataspace resolver.
 */
export type HttpDataspaceResolverOptions = Readonly<{
  hostingOperators: readonly PreloadedHostingOperatorRecord[];
  fetcher?: typeof fetch;
  requestHeaders?: Record<string, string>;
}>;

/**
 * Minimal request shape for portal/backend discovery calls after defaults have
 * already been configured at startup.
 */
export type SimpleDataspaceDiscoveryRequest = Readonly<{
  sector: string;
  jurisdiction: string;
  coverageScope?: string;
}>;

/**
 * Input for retrieving eligible hosts from the default-first discovery facade.
 */
export type GetDataspaceHostsInput = SimpleDataspaceDiscoveryRequest & Readonly<{
  requiredCapabilities?: readonly string[];
}>;

/**
 * Construction options for the default-first portal/backend discovery facade.
 *
 * This API intentionally keeps startup configuration separate from the
 * per-request `sector + jurisdiction` queries used later by frontend-facing
 * backends.
 */
export type DefaultFirstDataspaceDiscoveryOptions = Readonly<{
  version?: string;
  networkType: string;
  defaults?: DataspaceDiscoveryDefaultsRegistry | DataspaceDiscoveryDefaultsRegistrySeed;
  fetcher?: typeof fetch;
}>;

/**
 * Normalized hosting-operator match returned by a node/BFF resolver.
 */
export type HostingOperatorMatch = Readonly<{
  operatorDid: string;
  record: HostingOperatorSemanticRecord;
  matchedCapabilities: string[];
  discoveryUrl?: string;
  catalogUrl?: string;
}>;

/**
 * Normalized published-provider match returned by a node/BFF resolver.
 */
export type PublishedProviderMatch = Readonly<{
  providerDid: string;
  record: PublishedProviderCatalogRecord;
  hostingOperator: HostingOperatorSemanticRecord;
  hostingOperatorDid: string;
  discoveryUrl?: string;
  catalogUrl?: string;
  tenantSemanticRecord?: TenantServiceSemanticRecord;
}>;

/**
 * Shared host catalog shape returned by HTTP discovery endpoints.
 */
export type HostingOperatorCatalog = HostingOperatorDiscoveryCatalog;

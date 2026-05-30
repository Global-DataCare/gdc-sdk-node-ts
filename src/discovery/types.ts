// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import type {
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
 * Normalized hosting-operator match returned by a node/BFF resolver.
 */
export type HostingOperatorMatch = Readonly<{
  operatorDid: string;
  record: HostingOperatorSemanticRecord;
  matchedCapabilities: string[];
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
  catalogUrl?: string;
  tenantSemanticRecord?: TenantServiceSemanticRecord;
}>;

/**
 * Shared host catalog shape returned by HTTP discovery endpoints.
 */
export type HostingOperatorCatalog = HostingOperatorDiscoveryCatalog;

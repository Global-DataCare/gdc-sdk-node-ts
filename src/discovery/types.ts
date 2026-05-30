// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import type {
  DataspaceDiscoveryFilter,
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
  hostingOperator?: HostingOperatorSemanticRecord;
  tenantSemanticRecord?: TenantServiceSemanticRecord;
}>;

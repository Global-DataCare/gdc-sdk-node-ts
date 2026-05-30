// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import type {
  HostingOperatorSemanticRecord,
  PublishedProviderCatalogRecord,
  TenantServiceSemanticRecord,
} from 'gdc-common-utils-ts';

/**
 * Input for resolving hosting operators that can serve a given dataspace use
 * case.
 */
export type ResolveHostingOperatorsInput = Readonly<{
  sector: string;
  requiredCapabilities: readonly string[];
  jurisdiction?: string;
  coverageScope?: string;
}>;

/**
 * Input for resolving publicly published providers through hosting-operator
 * catalogs.
 */
export type ResolvePublishedProvidersInput = Readonly<{
  sector: string;
  providerCapability: string;
  jurisdiction?: string;
  coverageScope?: string;
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

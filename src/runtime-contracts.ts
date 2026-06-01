// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import type { NodeOperatorNetworkType } from 'gdc-common-utils-ts/constants/network';
import type { DataPersistencePolicy } from 'gdc-sdk-core-ts';

type HostNetworkType = NodeOperatorNetworkType;

export type LegacyNodeSourcePackage = never;

/**
 * Deployment/runtime form factor of the Node SDK host process itself.
 */
export type NodeRuntimeMode = 'server' | 'bff' | 'cloud-function' | 'worker';

/**
 * Interoperability strictness mode of the runtime.
 *
 * - `demo`: accept looser/demo-oriented payload shaping
 * - `compat`: accept compatibility-oriented payload shaping
 * - `strict`: enforce the canonical contract as much as the runtime allows
 */
export type NodeInteropMode = 'demo' | 'compat' | 'strict';

/**
 * Route context for tenant-scoped GW calls.
 *
 * This is not the web-portal context. It identifies the target tenant route in
 * the node operator / GW:
 * - `tenantId`: canonical tenant identifier
 * - `jurisdiction`: legal jurisdiction
 * - `sector`: functional sector path segment
 */
export type TenantContext = {
  tenantId: string;
  jurisdiction: string;
  sector: string;
};

/**
 * Discovery/bootstrap context for a host environment.
 *
 * This describes the host network/environment itself. It does not replace
 * the tenant route context used by tenant-scoped GW endpoints.
 */
export type HostContext = {
  networkType: HostNetworkType;
  jurisdiction: string;
  operatorDid?: string;
  baseUrl?: string;
};

/** @deprecated Use `HostContext`. */
export type NodeOperatorContext = HostContext;

export type NodeFetchLike = typeof fetch;

/**
 * Node runtime configuration for backend/BFF integrations.
 */
export type NodeRuntimeConfig = {
  runtimeMode: NodeRuntimeMode;
  interopMode?: NodeInteropMode;
  fetcher: NodeFetchLike;
  persistencePolicy?: DataPersistencePolicy;
  walletProvider?: unknown;
  cryptoProvider?: unknown;
  storageProvider?: unknown;
  outboxRepositoryFactory?: unknown;
  defaultTenantId?: string;
  defaultJurisdiction?: string;
  defaultSector?: string;
};

export type NodePackageStatus = {
  packageName: 'gdc-sdk-node-ts';
  dependsOnCorePackage: 'gdc-sdk-core-ts';
  legacySourcePackages: LegacyNodeSourcePackage[];
  status: 'bootstrap';
};

export const GDC_SDK_NODE_STATUS: NodePackageStatus = {
  packageName: 'gdc-sdk-node-ts',
  dependsOnCorePackage: 'gdc-sdk-core-ts',
  legacySourcePackages: [],
  status: 'bootstrap',
};

// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import type {
  HostingOperatorMatch,
  PublishedProviderMatch,
  ResolveHostingOperatorsInput,
  ResolvePublishedProvidersInput,
} from './types.js';

/**
 * Backend/BFF-facing abstraction for dataspace discovery resolution.
 *
 * Responsibility boundary:
 * - node runtimes orchestrate VC parsing, host-catalog fetch, and capability
 *   filtering
 * - semantic extraction and EU coverage inference come from
 *   `gdc-common-utils-ts`
 * - tenant-host linkage is resolved from host public catalogs, not from private
 *   tenant VC fields
 */
export abstract class DataspaceResolver {
  /**
   * Resolves hosting operators whose semantic service metadata matches the
   * requested sector, capability set, and optional coverage dimensions.
   */
  public abstract resolveHostingOperators(
    input: ResolveHostingOperatorsInput,
  ): Promise<HostingOperatorMatch[]>;

  /**
   * Resolves publicly published provider offerings starting from eligible
   * hosting operators and their public discovery catalogs.
   */
  public abstract resolvePublishedProviders(
    input: ResolvePublishedProvidersInput,
  ): Promise<PublishedProviderMatch[]>;
}

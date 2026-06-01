// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import {
  DataspaceDiscoverySourceMode,
  ServiceCapabilityToken,
  createDataspaceDiscoveryDefaultsRegistry,
  DataspaceProtocolVersions,
} from 'gdc-common-utils-ts';
import type {
  DataspaceDiscoveryDefaultsRegistry,
  DataspaceDiscoveryDefaultsRegistrySeed,
} from 'gdc-common-utils-ts';
import { HttpDataspaceResolver } from './HttpDataspaceResolver.js';
import type {
  DefaultFirstDataspaceDiscoveryOptions,
  GetDataspaceHostsInput,
  HostingOperatorMatch,
  PublishedProviderMatch,
  SimpleDataspaceDiscoveryRequest,
} from './types.js';

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isDefaultsRegistry(
  value: DataspaceDiscoveryDefaultsRegistry | DataspaceDiscoveryDefaultsRegistrySeed | undefined,
): value is DataspaceDiscoveryDefaultsRegistry {
  return Boolean(value)
    && typeof value === 'object'
    && 'buildBootstrapPlan' in value
    && typeof value.buildBootstrapPlan === 'function';
}

/**
 * High-level default-first discovery facade for portal/backend integrations.
 *
 * Intended usage:
 * - configure ICA/hosting defaults once during backend startup
 * - later ask simple questions per request:
 *   - `getHosts({ sector, jurisdiction })`
 *   - `getIndexProviders({ sector, jurisdiction })`
 *   - `getDigitalTwinProviders({ sector, jurisdiction })`
 *
 * The facade keeps the bootstrap-plan plumbing internal so app code does not
 * need to understand the lower-level defaults registry or resolver wiring.
 */
export class DefaultFirstDataspaceDiscovery {
  private readonly defaultsRegistry: DataspaceDiscoveryDefaultsRegistry;

  private readonly version: string;

  private readonly networkType: string;

  private readonly fetcher?: typeof fetch;

  constructor(options: DefaultFirstDataspaceDiscoveryOptions) {
    this.defaultsRegistry = isDefaultsRegistry(options.defaults)
      ? options.defaults
      : createDataspaceDiscoveryDefaultsRegistry(options.defaults);
    this.version = normalizeString(options.version) || DataspaceProtocolVersions.Current;
    this.networkType = normalizeString(options.networkType);
    this.fetcher = options.fetcher;
  }

  /**
   * Returns matching hosting operators for one `sector + jurisdiction`
   * request using the configured default-first bootstrap policy.
   */
  public async getHosts(
    input: GetDataspaceHostsInput,
  ): Promise<HostingOperatorMatch[]> {
    const resolver = this.createResolver(input, input.requiredCapabilities || []);
    return resolver.resolveHostingOperators({
      sector: input.sector,
      jurisdiction: input.jurisdiction,
      coverageScope: input.coverageScope,
      requiredCapabilities: [...(input.requiredCapabilities || [])],
    });
  }

  /**
   * Returns published `IndexProvider` services for one `sector + jurisdiction`
   * request.
   */
  public async getIndexProviders(
    input: SimpleDataspaceDiscoveryRequest,
  ): Promise<PublishedProviderMatch[]> {
    return this.getProviders(input, ServiceCapabilityToken.IndexProvider);
  }

  /**
   * Returns published `DigitalTwinProvider` services for one
   * `sector + jurisdiction` request.
   */
  public async getDigitalTwinProviders(
    input: SimpleDataspaceDiscoveryRequest,
  ): Promise<PublishedProviderMatch[]> {
    return this.getProviders(input, ServiceCapabilityToken.DigitalTwinProvider);
  }

  private async getProviders(
    input: SimpleDataspaceDiscoveryRequest,
    providerCapability: string,
  ): Promise<PublishedProviderMatch[]> {
    const resolver = this.createResolver(input, [providerCapability]);
    return resolver.resolvePublishedProviders({
      sector: input.sector,
      jurisdiction: input.jurisdiction,
      coverageScope: input.coverageScope,
      providerCapability,
    });
  }

  private createResolver(
    input: SimpleDataspaceDiscoveryRequest,
    requiredCapabilities: readonly string[],
  ): HttpDataspaceResolver {
    const bootstrapPlan = this.defaultsRegistry.buildBootstrapPlan({
      jurisdiction: input.jurisdiction,
      version: this.version,
      networkType: this.networkType,
      sector: input.sector,
      coverageScope: input.coverageScope,
      requiredCapabilities,
      sourceMode: DataspaceDiscoverySourceMode.DefaultFirst,
    });

    return new HttpDataspaceResolver({
      hostingOperators: bootstrapPlan.hostingOperators,
      fetcher: this.fetcher,
    });
  }
}

/**
 * Convenience factory for the default-first portal/backend discovery facade.
 */
export function createDefaultFirstDataspaceDiscovery(
  options: DefaultFirstDataspaceDiscoveryOptions,
): DefaultFirstDataspaceDiscovery {
  return new DefaultFirstDataspaceDiscovery(options);
}

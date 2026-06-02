// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import {
  DataspaceCoverageScope,
  DataspaceDiscoverySourceMode,
  ServiceCapabilityToken,
  createDataspaceDiscoveryDefaultsRegistry,
  DataspaceProtocolVersions,
  inferCoverageScopeFromCountryCode,
  isProviderServiceCapability,
  normalizeCountryCode,
} from 'gdc-common-utils-ts';
import type {
  DataspaceDiscoveryDefaultsRegistry,
  DataspaceDiscoveryDefaultsRegistrySeed,
  PublishedProviderCatalogRecord,
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

function equalsIgnoreCase(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function splitTokens(value: string | readonly string[] | undefined): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeString(entry)).filter(Boolean);
  }
  const raw = normalizeString(value);
  if (!raw) return [];
  return raw.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function buildCoverageTokens(
  areaServed: string | readonly string[] | undefined,
  filterJurisdiction: string | undefined,
): Set<string> {
  const tokens = new Set(splitTokens(areaServed).map((token) => token.toUpperCase()));
  const normalizedJurisdiction = normalizeCountryCode(filterJurisdiction);
  if (normalizedJurisdiction) {
    const inferred = inferCoverageScopeFromCountryCode(normalizedJurisdiction);
    if (inferred) tokens.add(inferred.toUpperCase());
  }
  return tokens;
}

function matchesProviderCoverage(
  provider: PublishedProviderCatalogRecord,
  jurisdiction: string | undefined,
  coverageScope: string | undefined,
): boolean {
  const normalizedJurisdiction = normalizeCountryCode(jurisdiction);
  const normalizedCoverageScope = normalizeString(coverageScope).toUpperCase();
  if (!normalizedJurisdiction && !normalizedCoverageScope) return true;
  const tokens = buildCoverageTokens(provider.areaServed, jurisdiction);
  if (normalizedJurisdiction && tokens.has(normalizedJurisdiction)) return true;
  if (normalizedCoverageScope && tokens.has(normalizedCoverageScope)) return true;
  if (normalizedCoverageScope === DataspaceCoverageScope.EuropeanUnion) {
    return Array.from(tokens).some((token) => inferCoverageScopeFromCountryCode(token) === DataspaceCoverageScope.EuropeanUnion);
  }
  return false;
}

function matchesDefaultPublishedProvider(
  provider: PublishedProviderCatalogRecord,
  input: SimpleDataspaceDiscoveryRequest,
  providerCapability: string,
): boolean {
  if (!equalsIgnoreCase(provider.category, input.sector)) return false;
  if (!isProviderServiceCapability(provider.serviceType)) return false;
  if (!equalsIgnoreCase(provider.serviceType, providerCapability)) return false;
  if (!matchesProviderCoverage(provider, input.jurisdiction, input.coverageScope)) return false;
  return true;
}

function isDefaultsRegistry(
  value: DataspaceDiscoveryDefaultsRegistry | DataspaceDiscoveryDefaultsRegistrySeed | undefined,
): value is DataspaceDiscoveryDefaultsRegistry {
  return Boolean(value)
    && typeof value === 'object'
    && 'buildBootstrapPlan' in value
    && typeof value.buildBootstrapPlan === 'function';
}

type DefaultHostingOperatorRegistrationWithPublishedProviders = Readonly<{
  operatorDid: string;
  discoveryUrl?: string;
  catalogUrl?: string;
  record: import('gdc-common-utils-ts').HostingOperatorSemanticRecord;
  publishedProviders?: readonly PublishedProviderCatalogRecord[];
}>;

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
    const bootstrapPlan = this.buildBootstrapPlan(input, [providerCapability]);
    const defaultPublishedProviders = this.resolveDefaultPublishedProviders(
      bootstrapPlan.hostingOperators,
      input,
      providerCapability,
    );
    if (defaultPublishedProviders.length > 0) {
      return defaultPublishedProviders;
    }
    const resolver = new HttpDataspaceResolver({
      hostingOperators: bootstrapPlan.hostingOperators,
      fetcher: this.fetcher,
    });
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
    const bootstrapPlan = this.buildBootstrapPlan(input, requiredCapabilities);

    return new HttpDataspaceResolver({
      hostingOperators: bootstrapPlan.hostingOperators,
      fetcher: this.fetcher,
    });
  }

  private buildBootstrapPlan(
    input: SimpleDataspaceDiscoveryRequest,
    requiredCapabilities: readonly string[],
  ) {
    return this.defaultsRegistry.buildBootstrapPlan({
      jurisdiction: input.jurisdiction,
      version: this.version,
      networkType: this.networkType,
      sector: input.sector,
      coverageScope: input.coverageScope,
      requiredCapabilities,
      sourceMode: DataspaceDiscoverySourceMode.DefaultFirst,
    });
  }

  private resolveDefaultPublishedProviders(
    hosts: readonly DefaultHostingOperatorRegistrationWithPublishedProviders[],
    input: SimpleDataspaceDiscoveryRequest,
    providerCapability: string,
  ): PublishedProviderMatch[] {
    return hosts.flatMap((host) =>
      (host.publishedProviders || [])
        .filter((provider: PublishedProviderCatalogRecord) => matchesDefaultPublishedProvider(provider, input, providerCapability))
        .map((provider: PublishedProviderCatalogRecord) => ({
          providerDid: provider.providerDid,
          record: provider,
          hostingOperator: host.record,
          hostingOperatorDid: host.operatorDid,
          discoveryUrl: provider.discoveryUrl || host.discoveryUrl,
          catalogUrl: provider.catalogUrl || host.catalogUrl,
        })));
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

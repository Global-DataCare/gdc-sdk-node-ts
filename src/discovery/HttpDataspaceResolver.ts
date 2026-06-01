// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import {
  DataspaceCoverageScope,
  DataspaceProtocolVersions,
  DataspaceWellKnownPaths,
  deriveGwCatalogArtifactUrlFromDspaceVersion,
  inferCoverageScopeFromCountryCode,
  isProviderServiceCapability,
  normalizeCountryCode,
} from 'gdc-common-utils-ts';
import type {
  DspaceVersionMetadata,
  HostingOperatorDiscoveryCatalog,
  HostingOperatorSemanticRecord,
  PublishedProviderCatalogRecord,
} from 'gdc-common-utils-ts';
import { DataspaceResolver } from './DataspaceResolver.js';
import type {
  HostingOperatorMatch,
  HttpDataspaceResolverOptions,
  PublishedProviderMatch,
  ResolveHostingOperatorsInput,
  ResolvePublishedProvidersInput,
} from './types.js';

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function equalsIgnoreCase(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function splitTokens(value: string | readonly string[] | undefined): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => asString(entry)).filter(Boolean);
  }
  const raw = typeof value === 'string' ? value : '';
  if (!raw) return [];
  return raw.split(',').map((entry: string) => entry.trim()).filter(Boolean);
}

function hasAllTokens(values: readonly string[] | undefined, requiredValues: readonly string[] | undefined): boolean {
  if (!requiredValues?.length) return true;
  const normalizedValues = new Set((values || []).map((value) => value.trim().toLowerCase()).filter(Boolean));
  return requiredValues.every((requiredValue) => normalizedValues.has(requiredValue.trim().toLowerCase()));
}

function matchSectorValues(values: readonly string[] | undefined, sector: string): boolean {
  if (!sector) return true;
  return (values || []).some((value) => equalsIgnoreCase(value, sector));
}

function buildCoverageTokens(
  recordCountry: string | undefined,
  areaServed: string | readonly string[] | undefined,
  coverageScope: string | undefined,
): Set<string> {
  const tokens = new Set<string>();
  splitTokens(areaServed).forEach((token) => tokens.add(token.toUpperCase()));
  const normalizedCountry = normalizeCountryCode(recordCountry);
  if (normalizedCountry) {
    tokens.add(normalizedCountry);
    const inferred = inferCoverageScopeFromCountryCode(normalizedCountry);
    if (inferred) tokens.add(inferred.toUpperCase());
  }
  if (coverageScope) {
    tokens.add(coverageScope.trim().toUpperCase());
  }
  return tokens;
}

function matchesDiscoveryCoverage(
  recordCountry: string | undefined,
  areaServed: string | readonly string[] | undefined,
  filterJurisdiction: string | undefined,
  filterCoverageScope: string | undefined,
): boolean {
  const normalizedJurisdiction = normalizeCountryCode(filterJurisdiction);
  const normalizedCoverageScope = asString(filterCoverageScope).toUpperCase();
  if (!normalizedJurisdiction && !normalizedCoverageScope) return true;

  const tokens = buildCoverageTokens(recordCountry, areaServed, undefined);
  if (normalizedJurisdiction && tokens.has(normalizedJurisdiction)) return true;
  if (normalizedCoverageScope && tokens.has(normalizedCoverageScope)) return true;

  if (normalizedJurisdiction) {
    const inferred = inferCoverageScopeFromCountryCode(normalizedJurisdiction);
    if (inferred && tokens.has(inferred.toUpperCase())) return true;
  }

  if (normalizedCoverageScope === DataspaceCoverageScope.EuropeanUnion) {
    if (Array.from(tokens).some((token) => inferCoverageScopeFromCountryCode(token) === DataspaceCoverageScope.EuropeanUnion)) {
      return true;
    }
  }

  return false;
}

function toHostingOperatorCatalog(value: unknown): HostingOperatorDiscoveryCatalog | null {
  if (!isObject(value)) return null;
  const providers = value.providers;
  if (!Array.isArray(providers)) return null;
  const normalizedProviders: PublishedProviderCatalogRecord[] = providers
    .filter(isObject)
    .map((provider) => {
      const normalized = {
        providerDid: asString(provider.providerDid),
        serviceType: asString(provider.serviceType),
        category: asString(provider.category),
        areaServed: asString(provider.areaServed) || undefined,
        endpointUrl: asString(provider.endpointUrl) || undefined,
        discoveryUrl: asString(provider.discoveryUrl) || undefined,
        catalogUrl: asString(provider.catalogUrl) || undefined,
      };
      return normalized.providerDid && normalized.serviceType && normalized.category
        ? normalized as PublishedProviderCatalogRecord
        : null;
    })
    .filter((provider): provider is PublishedProviderCatalogRecord => Boolean(provider));

  return {
    hostingOperatorDid: asString(value.hostingOperatorDid) || undefined,
    discoveryUrl: asString(value.discoveryUrl) || undefined,
    catalogUrl: asString(value.catalogUrl) || undefined,
    providers: normalizedProviders,
  };
}

function matchHostingOperatorRecord(
  record: HostingOperatorSemanticRecord,
  input: ResolveHostingOperatorsInput,
): boolean {
  if (!matchSectorValues(record.categories, input.sector)) return false;
  if (!hasAllTokens(record.serviceTypes, input.requiredCapabilities)) return false;
  if (!matchesDiscoveryCoverage(record.addressCountry, record.areaServed, input.jurisdiction, input.coverageScope)) return false;
  return true;
}

function matchPublishedProviderRecord(
  provider: PublishedProviderCatalogRecord,
  input: ResolvePublishedProvidersInput,
): boolean {
  if (!equalsIgnoreCase(provider.category, input.sector)) return false;
  if (!isProviderServiceCapability(provider.serviceType)) return false;
  if (!equalsIgnoreCase(provider.serviceType, input.providerCapability)) return false;
  if (!matchesDiscoveryCoverage(undefined, provider.areaServed, input.jurisdiction, input.coverageScope)) return false;
  return true;
}

/**
 * Concrete node/BFF resolver that combines preloaded hosting-operator records
 * with each host's public service-autodiscovery catalog.
 */
export class HttpDataspaceResolver extends DataspaceResolver {
  private readonly hostingOperators: readonly {
    operatorDid: string;
    discoveryUrl?: string;
    catalogUrl?: string;
    record: HostingOperatorSemanticRecord;
  }[];

  private readonly fetcher: typeof fetch;

  constructor(options: HttpDataspaceResolverOptions) {
    super();
    this.hostingOperators = [...options.hostingOperators];
    this.fetcher = options.fetcher || globalThis.fetch.bind(globalThis);
  }

  /**
   * Resolves hosting operators from the preloaded semantic records.
   */
  public override async resolveHostingOperators(
    input: ResolveHostingOperatorsInput,
  ): Promise<HostingOperatorMatch[]> {
    return this.hostingOperators
      .filter(({ record }) => matchHostingOperatorRecord(record, input))
      .map(({ operatorDid, discoveryUrl, record, catalogUrl }) => ({
        operatorDid,
        record,
        matchedCapabilities: (input.requiredCapabilities || []).filter((capability) =>
          record.serviceTypes.some((value) => equalsIgnoreCase(value, capability)),
        ),
        discoveryUrl,
        catalogUrl,
      }))
      .sort((left, right) => left.operatorDid.localeCompare(right.operatorDid));
  }

  /**
   * Resolves published providers by fetching and filtering eligible host public
   * discovery catalogs.
   */
  public override async resolvePublishedProviders(
    input: ResolvePublishedProvidersInput,
  ): Promise<PublishedProviderMatch[]> {
    const eligibleHosts = await this.resolveHostingOperators({
      sector: input.sector,
      jurisdiction: input.jurisdiction,
      coverageScope: input.coverageScope,
      requiredCapabilities: [input.providerCapability],
    });

    const catalogs = await Promise.all(eligibleHosts.map(async (host) => ({
      host,
      catalog: await this.fetchCatalog(host.discoveryUrl, host.catalogUrl),
    })));

    return catalogs.flatMap(({ host, catalog }) => {
      if (!catalog) return [];
      return catalog.providers
        .filter((record) => matchPublishedProviderRecord(record, input))
        .map((record) => ({
          providerDid: record.providerDid,
          record,
          hostingOperator: host.record,
          hostingOperatorDid: host.operatorDid,
          discoveryUrl: record.discoveryUrl || catalog.discoveryUrl || host.discoveryUrl,
          catalogUrl: record.catalogUrl || catalog.catalogUrl || host.catalogUrl,
        }));
    }).sort((left, right) => left.providerDid.localeCompare(right.providerDid));
  }

  /**
   * Fetches a public discovery catalog for a hosting operator.
   *
   * Resolution order:
   * - canonical DSP entrypoint via `discoveryUrl` (`/.well-known/dspace-version`)
   * - direct catalog artifact compatibility via `catalogUrl`
   */
  private async fetchCatalog(
    discoveryUrl: string | undefined,
    catalogUrl?: string | undefined,
  ): Promise<HostingOperatorDiscoveryCatalog | undefined> {
    const resolvedCatalogUrl = await this.resolveCatalogArtifactUrl(discoveryUrl, catalogUrl);
    if (!resolvedCatalogUrl) return undefined;
    const response = await this.fetcher(resolvedCatalogUrl, {
      method: 'GET',
      headers: {
        accept: 'application/json',
      },
    });
    if (!response.ok) {
      return undefined;
    }
    const body = await response.json();
    return toHostingOperatorCatalog(body) || undefined;
  }

  private async resolveCatalogArtifactUrl(
    discoveryUrl: string | undefined,
    catalogUrl: string | undefined,
  ): Promise<string | undefined> {
    const normalizedDiscoveryUrl = String(discoveryUrl || '').trim();
    if (normalizedDiscoveryUrl) {
      if (normalizedDiscoveryUrl.endsWith(DataspaceWellKnownPaths.VersionMetadata)) {
        const metadata = await this.fetchDspaceVersionMetadata(normalizedDiscoveryUrl);
        return deriveGwCatalogArtifactUrlFromDspaceVersion(
          normalizedDiscoveryUrl,
          metadata,
          DataspaceProtocolVersions.Current,
        );
      }
      return normalizedDiscoveryUrl;
    }
    const normalizedCatalogUrl = String(catalogUrl || '').trim();
    return normalizedCatalogUrl || undefined;
  }

  private async fetchDspaceVersionMetadata(
    discoveryUrl: string,
  ): Promise<DspaceVersionMetadata | undefined> {
    const response = await this.fetcher(discoveryUrl, {
      method: 'GET',
      headers: {
        accept: 'application/json',
      },
    });
    if (!response.ok) {
      return undefined;
    }
    const body = await response.json();
    return isDspaceVersionMetadata(body)
      ? body
      : undefined;
  }
}

function isDspaceVersionMetadata(value: unknown): value is DspaceVersionMetadata {
  if (!isObject(value)) return false;
  return Array.isArray(value.protocolVersions)
    && value.protocolVersions.every((entry) => isObject(entry) && asString(entry.version) && asString(entry.path));
}

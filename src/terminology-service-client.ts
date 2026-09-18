/** Input resolved by an authenticated application BFF, never directly by a browser. */
export type TerminologyValueSetInput = Readonly<{
  sector: string;
  resourceType: string;
  claim: string;
  fhirVersion?: 'R4';
  language?: string;
  jurisdiction?: string;
  /** Exact code-system version URI. Omission asks the service for its latest/default release. */
  version?: string;
  offset?: number;
  count?: number;
}>;

export type TerminologyValueSetOption = Readonly<{
  system: string;
  code: string;
  display: string;
  localizedDisplay: string;
  resolvedLanguage: string;
  fallbackUsed: boolean;
}>;

export type TerminologyValueSetDocument = Readonly<{
  jsonapi: Readonly<{ version: '1.1' }>;
  data: readonly Readonly<{
    type: 'terminology-option';
    id: string;
    attributes: TerminologyValueSetOption;
  }>[];
  meta: Readonly<{
    count: number;
    total: number;
    offset: number;
    language: string;
    resourceType: string;
    field: string;
    claim: string;
    valueSet: Readonly<{ id: string; url: string; version: string; system: string }>;
    terminologyVersions?: Readonly<Record<string, string>>;
  }>;
}>;

export type TerminologyCacheEntry = Readonly<{
  document: TerminologyValueSetDocument;
  storedAt: number;
}>;

export interface TerminologyValueSetCache {
  get(key: string): TerminologyCacheEntry | undefined | Promise<TerminologyCacheEntry | undefined>;
  set(key: string, entry: TerminologyCacheEntry): void | Promise<void>;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;

function normalizedInput(input: TerminologyValueSetInput): Required<Pick<
  TerminologyValueSetInput,
  'sector' | 'resourceType' | 'claim' | 'fhirVersion' | 'language' | 'offset' | 'count'
>> & Pick<TerminologyValueSetInput, 'jurisdiction' | 'version'> {
  return {
    sector: input.sector.trim().toLowerCase(),
    resourceType: input.resourceType.trim(),
    claim: input.claim.trim(),
    fhirVersion: input.fhirVersion ?? 'R4',
    language: (input.language?.trim() || 'en').replace(/_/g, '-').toLowerCase(),
    ...(input.jurisdiction?.trim() ? { jurisdiction: input.jurisdiction.trim().toUpperCase() } : {}),
    ...(input.version?.trim() ? { version: input.version.trim() } : {}),
    offset: input.offset ?? 0,
    count: input.count ?? 50,
  };
}

/** Stable key usable by in-memory, GCS, Firestore or PostgreSQL cache adapters. */
export function terminologyValueSetCacheKey(input: TerminologyValueSetInput): string {
  const value = normalizedInput(input);
  return JSON.stringify([
    value.fhirVersion, value.sector, value.resourceType, value.claim,
    value.language, value.jurisdiction ?? '', value.version ?? 'latest',
    value.offset, value.count,
  ]);
}

/** Process-local cache suitable for warm BFF instances and immutable startup snapshots. */
export class MemoryTerminologyValueSetCache implements TerminologyValueSetCache {
  readonly #entries = new Map<string, TerminologyCacheEntry>();

  public get(key: string): TerminologyCacheEntry | undefined {
    return this.#entries.get(key);
  }

  public set(key: string, entry: TerminologyCacheEntry): void {
    this.#entries.set(key, entry);
  }

  public prime(
    input: TerminologyValueSetInput,
    document: TerminologyValueSetDocument,
    storedAt = Date.now(),
  ): void {
    this.set(terminologyValueSetCacheKey(input), { document, storedAt });
  }
}

export type TerminologyValueSetResult = Readonly<{
  document: TerminologyValueSetDocument;
  cacheStatus: 'remote' | 'fresh-cache' | 'stale-cache' | 'english-fallback-cache';
}>;

/** Server-only client for a product-neutral terminology service. */
export class TerminologyServiceClient {
  readonly #baseUrl: string;
  readonly #serviceToken: string | undefined;
  readonly #fetch: typeof fetch;
  readonly #cache: TerminologyValueSetCache;
  readonly #cacheTtlMs: number;
  readonly #staleIfError: boolean;
  readonly #now: () => number;

  public constructor(options: Readonly<{
    baseUrl: string;
    serviceToken?: string;
    fetchImplementation?: typeof fetch;
    cache?: TerminologyValueSetCache;
    cacheTtlMs?: number;
    staleIfError?: boolean;
    now?: () => number;
  }>) {
    this.#baseUrl = options.baseUrl.replace(/\/$/, '');
    this.#serviceToken = options.serviceToken?.trim() || undefined;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#cache = options.cache ?? new MemoryTerminologyValueSetCache();
    this.#cacheTtlMs = options.cacheTtlMs ?? DEFAULT_TTL_MS;
    this.#staleIfError = options.staleIfError ?? true;
    this.#now = options.now ?? Date.now;
  }

  /** Resolves the ValueSet bound by the service to one canonical flat claim. */
  public async expandValueSetForClaim(
    input: TerminologyValueSetInput,
  ): Promise<TerminologyValueSetResult> {
    this.#validateInput(input);
    const key = terminologyValueSetCacheKey(input);
    const cached = await this.#cache.get(key);
    if (cached && this.#now() - cached.storedAt <= this.#cacheTtlMs) {
      return { document: cached.document, cacheStatus: 'fresh-cache' };
    }

    try {
      const document = await this.#request(input);
      await this.#cache.set(key, { document, storedAt: this.#now() });
      return { document, cacheStatus: 'remote' };
    } catch (error) {
      if (cached && this.#staleIfError) {
        return { document: cached.document, cacheStatus: 'stale-cache' };
      }
      const requestedLanguage = input.language?.trim().toLowerCase();
      if (this.#staleIfError && requestedLanguage && requestedLanguage !== 'en') {
        const english = await this.#cache.get(terminologyValueSetCacheKey({ ...input, language: 'en' }));
        if (english) {
          return { document: english.document, cacheStatus: 'english-fallback-cache' };
        }
      }
      throw new Error('Terminology service request failed');
    }
  }

  async #request(input: TerminologyValueSetInput): Promise<TerminologyValueSetDocument> {
    const url = new URL(`${this.#baseUrl}/v1/terminology/value-set-options`);
    url.searchParams.set('sector', input.sector.trim());
    url.searchParams.set('resourceType', input.resourceType.trim());
    url.searchParams.set('claim', input.claim.trim());
    url.searchParams.set('offset', String(input.offset ?? 0));
    url.searchParams.set('count', String(input.count ?? 50));
    if (input.fhirVersion) url.searchParams.set('fhirVersion', input.fhirVersion);
    if (input.language?.trim()) url.searchParams.set('language', input.language.trim());
    if (input.jurisdiction?.trim()) url.searchParams.set('jurisdiction', input.jurisdiction.trim());
    if (input.version?.trim()) url.searchParams.set('version', input.version.trim());
    const response = await this.#fetch(url, {
      headers: {
        accept: 'application/vnd.api+json',
        ...(this.#serviceToken ? { authorization: `Bearer ${this.#serviceToken}` } : {}),
      },
    });
    if (!response.ok) throw new Error(`Terminology service returned HTTP ${response.status}`);
    const document = await response.json() as unknown;
    if (!this.#isDocument(document, input)) throw new Error('Terminology service returned an invalid document');
    return document;
  }

  #validateInput(input: TerminologyValueSetInput): void {
    if (!input.sector.trim()) throw new Error('sector is required');
    if (!input.resourceType.trim()) throw new Error('resourceType is required');
    if (!input.claim.trim()) throw new Error('claim is required');
    if (input.offset !== undefined && (!Number.isInteger(input.offset) || input.offset < 0)) {
      throw new Error('offset must be a non-negative integer');
    }
    if (input.count !== undefined && (!Number.isInteger(input.count) || input.count < 1 || input.count > 100)) {
      throw new Error('count must be an integer from 1 to 100');
    }
  }

  #isDocument(value: unknown, input: TerminologyValueSetInput): value is TerminologyValueSetDocument {
    if (!value || typeof value !== 'object') return false;
    const document = value as Partial<TerminologyValueSetDocument>;
    if (document.jsonapi?.version !== '1.1' || !Array.isArray(document.data) || !document.meta) return false;
    if (document.meta.resourceType !== input.resourceType.trim() || document.meta.claim !== input.claim.trim()) return false;
    return document.data.every((resource) => (
      resource?.type === 'terminology-option'
      && typeof resource.id === 'string'
      && typeof resource.attributes?.system === 'string'
      && typeof resource.attributes?.code === 'string'
      && typeof resource.attributes?.display === 'string'
      && typeof resource.attributes?.localizedDisplay === 'string'
      && typeof resource.attributes?.resolvedLanguage === 'string'
      && typeof resource.attributes?.fallbackUsed === 'boolean'
    ));
  }
}

/** Input resolved by an authenticated application BFF, never directly by a browser. */
export type TerminologyValueSetInput = Readonly<{
  /** Optional per-request override. Dedicated BFFs normally configure this once on the client. */
  sector?: string;
  claim: string;
  fhirVersion?: 'R4';
  language?: string;
  jurisdiction?: string;
  /** Exact code-system version URI. Omission asks the service for its latest/default release. */
  version?: string;
  offset?: number;
  count?: number;
}>;

export type TerminologyValueSetCodeListInput = Omit<TerminologyValueSetInput, 'offset' | 'count'>;

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
  'claim' | 'fhirVersion' | 'language' | 'offset' | 'count'
>> & Pick<TerminologyValueSetInput, 'jurisdiction' | 'version'> {
  return {
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
  const normalizedTerminologyContext = normalizedInput(input);
  return JSON.stringify([
    normalizedTerminologyContext.fhirVersion,
    input.sector?.trim().toLowerCase() ?? '',
    normalizedTerminologyContext.claim,
    normalizedTerminologyContext.language,
    normalizedTerminologyContext.jurisdiction ?? '',
    normalizedTerminologyContext.version ?? 'latest',
    normalizedTerminologyContext.offset,
    normalizedTerminologyContext.count,
  ]);
}

function resourceTypeFromClaim(claim: string): string {
  const canonicalClaim = claim.trim();
  const separatorIndex = canonicalClaim.indexOf('.');
  const resourceType = canonicalClaim.slice(0, separatorIndex);
  if (separatorIndex < 1 || !/^[A-Z][A-Za-z0-9]*$/.test(resourceType)) {
    throw new Error('claim must start with its FHIR resource type');
  }
  return resourceType;
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

/** Frontend-ready code list. Coding system and code remain separate FHIR Coding values. */
export type TerminologyValueSetCodeList = Readonly<{
  codingSystem: string;
  codeToDisplay: Readonly<Record<string, string>>;
  requestedLanguage: string;
  resolvedLanguage: string;
  fallbackUsed: boolean;
  valueSet: TerminologyValueSetDocument['meta']['valueSet'];
  terminologyVersions?: Readonly<Record<string, string>>;
}>;

/** Server-only client for a product-neutral terminology service. */
export class TerminologyServiceClient {
  readonly #baseUrl: string;
  readonly #serviceToken: string | undefined;
  readonly #sector: string | undefined;
  readonly #fetch: typeof fetch;
  readonly #cache: TerminologyValueSetCache;
  readonly #cacheTtlMs: number;
  readonly #staleIfError: boolean;
  readonly #now: () => number;

  public constructor(options: Readonly<{
    baseUrl: string;
    /** Default sector for a dedicated human-health or animal-health BFF. */
    sector?: string;
    serviceToken?: string;
    fetchImplementation?: typeof fetch;
    cache?: TerminologyValueSetCache;
    cacheTtlMs?: number;
    staleIfError?: boolean;
    now?: () => number;
  }>) {
    this.#baseUrl = options.baseUrl.replace(/\/$/, '');
    this.#serviceToken = options.serviceToken?.trim() || undefined;
    this.#sector = options.sector?.trim() || undefined;
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
    const resolvedTerminologyContext = {
      ...input,
      sector: input.sector?.trim() || this.#sector,
    };
    const key = terminologyValueSetCacheKey(resolvedTerminologyContext);
    const cached = await this.#cache.get(key);
    if (cached && this.#now() - cached.storedAt <= this.#cacheTtlMs) {
      return { document: cached.document, cacheStatus: 'fresh-cache' };
    }

    try {
      const document = await this.#request(resolvedTerminologyContext);
      await this.#cache.set(key, { document, storedAt: this.#now() });
      return { document, cacheStatus: 'remote' };
    } catch (error) {
      if (cached && this.#staleIfError) {
        return { document: cached.document, cacheStatus: 'stale-cache' };
      }
      const requestedLanguage = input.language?.trim().toLowerCase();
      if (this.#staleIfError && requestedLanguage && requestedLanguage !== 'en') {
        const english = await this.#cache.get(terminologyValueSetCacheKey({
          ...resolvedTerminologyContext,
          language: 'en',
        }));
        if (english) {
          return { document: english.document, cacheStatus: 'english-fallback-cache' };
        }
      }
      throw new Error('Terminology service request failed');
    }
  }

  /** Resolves every page and returns the simple code-to-display object expected by forms. */
  public async getValueSetCodeListForClaim(
    input: TerminologyValueSetCodeListInput,
  ): Promise<TerminologyValueSetCodeList> {
    const pageSize = 100;
    let nextOffset = 0;
    let totalOptionCount = 0;
    let codingSystem = '';
    let resolvedLanguage = '';
    let fallbackUsed = false;
    let resolvedValueSet: TerminologyValueSetDocument['meta']['valueSet'] | undefined;
    let terminologyVersions: Readonly<Record<string, string>> | undefined;
    const codeToDisplay: Record<string, string> = {};

    do {
      const valueSetPage = await this.expandValueSetForClaim({
        ...input,
        offset: nextOffset,
        count: pageSize,
      });
      const { document } = valueSetPage;
      totalOptionCount = document.meta.total;
      resolvedLanguage ||= document.meta.language;
      resolvedValueSet ??= document.meta.valueSet;
      terminologyVersions ??= document.meta.terminologyVersions;

      if (resolvedValueSet.system !== document.meta.valueSet.system) {
        throw new Error('Terminology service returned inconsistent ValueSet pages');
      }
      for (const terminologyOptionResource of document.data) {
        const terminologyOption = terminologyOptionResource.attributes;
        if (codingSystem && codingSystem !== terminologyOption.system) {
          throw new Error('Terminology ValueSet contains more than one coding system');
        }
        codingSystem ||= terminologyOption.system;
        codeToDisplay[terminologyOption.code] = terminologyOption.localizedDisplay;
        fallbackUsed ||= terminologyOption.fallbackUsed;
      }
      if (document.data.length === 0 && nextOffset < totalOptionCount) {
        throw new Error('Terminology service returned an incomplete ValueSet page');
      }
      nextOffset += document.data.length;
    } while (nextOffset < totalOptionCount);

    if (!resolvedValueSet) throw new Error('Terminology service returned no ValueSet metadata');
    return {
      codingSystem: codingSystem || resolvedValueSet.system,
      codeToDisplay,
      requestedLanguage: (input.language?.trim() || 'en').replace(/_/g, '-').toLowerCase(),
      resolvedLanguage: resolvedLanguage || 'en',
      fallbackUsed,
      valueSet: resolvedValueSet,
      ...(terminologyVersions ? { terminologyVersions } : {}),
    };
  }

  async #request(input: TerminologyValueSetInput): Promise<TerminologyValueSetDocument> {
    const url = new URL(`${this.#baseUrl}/v1/terminology/value-set-options`);
    url.searchParams.set('sector', input.sector?.trim() || this.#sector || '');
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
    if (!(input.sector?.trim() || this.#sector)) throw new Error('sector is required');
    if (!input.claim.trim()) throw new Error('claim is required');
    resourceTypeFromClaim(input.claim);
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
    if (document.meta.resourceType !== resourceTypeFromClaim(input.claim) || document.meta.claim !== input.claim.trim()) return false;
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

import {
  LocalTerminologyProvider,
  type TerminologyCatalogDocument,
  type TerminologySearchInput,
  type TerminologySearchResult,
} from 'gdc-sdk-core-ts';

/** Small primary document returned by an application-owned terminology route. */
export type TerminologySearchPrimaryDocument = Readonly<{
  data: readonly TerminologySearchResult[];
}>;

/**
 * Framework-neutral local terminology service for Node/BFF applications.
 *
 * A Next.js route validates its query, calls `search(...)`, and returns the
 * resulting primary document. Complete catalogs remain server-side.
 */
export class LocalTerminologyBffService {
  private readonly provider: LocalTerminologyProvider;

  public constructor(catalogs: readonly TerminologyCatalogDocument[]) {
    this.provider = new LocalTerminologyProvider(catalogs);
  }

  /** Searches the configured local fallback catalogs. */
  public search(input: TerminologySearchInput): TerminologySearchPrimaryDocument {
    return { data: this.provider.search(input) };
  }
}

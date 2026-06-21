// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import {
  CommunicationAttachedBundleSession,
  IndividualBundleVault,
  VaultMemRepository,
  buildVitalSignObservationClaims,
  buildBundleDocumentFromClaims,
  createConsentAccessEditor,
  createInvoiceBundleEditor,
  createSummaryOperationRequestParameters,
  createSummaryOperationRequestParametersResource,
  createSummaryOperationRequestReferencePath,
  extractResourceMetaClaimsFromBundle,
  readEmployeeSearchResults,
  summarizeClinicalBundle,
  summarizeLicenseListRecords,
  toClinicalResourceExpandedViews,
  type BuildVitalSignObservationClaimsInput,
} from 'gdc-common-utils-ts';
import type { BundleEntry, BundleJsonApi } from 'gdc-common-utils-ts/models/bundle';
import {
  createFhirDocumentFacade,
  type FhirDocumentFacade,
  type FhirDocumentSection,
  type FhirDocumentFamilyQuery,
  type FhirDocumentResourceQuery,
  type FhirDocumentSectionSummary,
  type FhirResourceLike,
} from 'gdc-sdk-core-ts';
import type { BackendOrganizationControllerProfile, BackendProfessionalProfile } from './backend-profile-runtime.js';

type LocalTextAndIntDisplay = ReturnType<FhirDocumentFacade['getLocalTextAndIntDisplay']>;
type NarrativeResult = ReturnType<FhirDocumentFacade['getNarrative']>;

export type IpsRequestDraft = Readonly<{
  subjectId: string;
  purpose?: string;
  sectionList: readonly string[];
  summaryOperationRequestParameters: ReturnType<typeof createSummaryOperationRequestParameters>;
  summaryOperationRequestReferencePath: string;
  summaryOperationRequestParametersResource: ReturnType<typeof createSummaryOperationRequestParametersResource>;
}>;

export type ProcessedClinicalBundleResponse = Readonly<{
  totalErrors: number;
  totalSections: number;
  totalResources: number;
  totalResourcesInSection: Readonly<Record<string, number>>;
  totalNarratives: number;
  totalNotes: number;
  summary: ReturnType<typeof summarizeClinicalBundle>;
  views: ReturnType<typeof toClinicalResourceExpandedViews>;
  sectionSummary: FhirDocumentSectionSummary;
  getSections: () => FhirDocumentSection[];
  getResources: (query?: string | FhirDocumentResourceQuery) => FhirResourceLike[];
  getByDates: (query: string | FhirDocumentResourceQuery, start?: string, end?: string) => FhirResourceLike[];
  getSectionSummary: (input?: { sections?: readonly string[] }) => FhirDocumentSectionSummary;
  getLocalTextAndIntDisplay: (resource: FhirResourceLike) => LocalTextAndIntDisplay;
  getXhtmlOrDerived: (resource: FhirResourceLike) => string | undefined;
  getNarrative: (resource: FhirResourceLike) => NarrativeResult;
  getAllergies: (query?: FhirDocumentFamilyQuery & { clinicalStatus?: readonly string[]; verificationStatus?: readonly string[]; criticality?: readonly string[] }) => FhirResourceLike[];
  getConditions: (query?: FhirDocumentFamilyQuery & { clinicalStatus?: readonly string[]; verificationStatus?: readonly string[]; severity?: readonly string[] }) => FhirResourceLike[];
  getMedications: (query?: FhirDocumentFamilyQuery & { status?: readonly string[] }) => FhirResourceLike[];
  getVitalSigns: (query?: FhirDocumentFamilyQuery & { code?: readonly string[] }) => FhirResourceLike[];
  reader: ClinicalBundleQueryBuilder;
}>;

export type ClinicalBundleQueryBuilder = Readonly<{
  allSections: () => ClinicalBundleQueryBuilder;
  inSections: (sections?: readonly string[]) => ClinicalBundleQueryBuilder;
  between: (start?: string, end?: string) => ClinicalBundleQueryBuilder;
  matchingText: (searchText?: string) => ClinicalBundleQueryBuilder;
  paginate: (input?: { count?: number; page?: number; offset?: number }) => ClinicalBundleQueryBuilder;
  getResources: (resourceType?: string) => FhirResourceLike[];
  getAllergies: (query?: { clinicalStatus?: readonly string[]; verificationStatus?: readonly string[]; criticality?: readonly string[] }) => FhirResourceLike[];
  getConditions: (query?: { clinicalStatus?: readonly string[]; verificationStatus?: readonly string[]; severity?: readonly string[] }) => FhirResourceLike[];
  getMedications: (query?: { status?: readonly string[] }) => FhirResourceLike[];
  getVitalSigns: (query?: { code?: readonly string[] }) => FhirResourceLike[];
  getSectionSummary: () => FhirDocumentSectionSummary;
}>;

function normalizeSectionList(sectionList?: readonly string[]): string[] {
  return Array.from(new Set((sectionList || []).map((item) => String(item || '').trim()).filter(Boolean)));
}

function unwrapBody(body: unknown): Record<string, any> {
  const root = body && typeof body === 'object' ? body as Record<string, any> : {};
  return root.body && typeof root.body === 'object' ? root.body : root;
}

function buildClinicalSectionCounts(
  views: ReturnType<typeof toClinicalResourceExpandedViews>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const view of views) {
    const sections = String(view.common.claims['Composition.section'] || '').split(',').map((item) => item.trim()).filter(Boolean);
    if (sections.length === 0) {
      out.unknown = (out.unknown || 0) + 1;
      continue;
    }
    for (const section of sections) {
      out[section] = (out[section] || 0) + 1;
    }
  }
  return out;
}

/**
 * Normalizes the shared claims-first bundle examples into one FHIR document
 * bundle so the section-aware facade can read `Composition.section` without
 * teaching raw claim plumbing to SDK consumers.
 */
function normalizeClinicalDocumentBundle(bundle: Record<string, any>): Record<string, any> {
  if (bundle?.resourceType === 'Bundle' && Array.isArray(bundle?.entry)) {
    return bundle;
  }

  const claimsList = extractResourceMetaClaimsFromBundle(bundle).map((item) => item.claims);
  if (claimsList.length === 0) {
    return bundle;
  }

  const subjectDid = claimsList
    .map((claims) => {
      const subjectKeys = Object.keys(claims).filter((key) => String(key || '').toLowerCase().endsWith('.subject'));
      for (const key of subjectKeys) {
        const value = claims[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
      }
      return '';
    })
    .find(Boolean);

  return buildBundleDocumentFromClaims({
    claimsList,
    ...(subjectDid ? { subjectDid } : {}),
  });
}

/**
 * Creates one immutable high-level reader that keeps section/date/text/paging
 * filters chainable across generic and family-specific clinical queries.
 */
function createClinicalBundleQueryBuilder(
  facade: FhirDocumentFacade,
  state: FhirDocumentResourceQuery = {},
): ClinicalBundleQueryBuilder {
  const next = (patch: Partial<FhirDocumentResourceQuery>): ClinicalBundleQueryBuilder => createClinicalBundleQueryBuilder(
    facade,
    {
      ...state,
      ...patch,
    },
  );

  return {
    allSections: () => next({ sections: [] }),
    inSections: (sections?: readonly string[]) => next({ sections: sections ? [...sections] : [] }),
    between: (start?: string, end?: string) => next({ start, end }),
    matchingText: (searchText?: string) => next({ searchText }),
    paginate: (input?: { count?: number; page?: number; offset?: number }) => next({
      count: input?.count,
      page: input?.page,
      offset: input?.offset,
    }),
    getResources: (resourceType?: string) => facade.getResources({
      ...state,
      ...(resourceType ? { resourceType } : {}),
    }),
    getAllergies: (query = {}) => facade.getAllergies({
      ...state,
      ...query,
    }),
    getConditions: (query = {}) => facade.getConditions({
      ...state,
      ...query,
    }),
    getMedications: (query = {}) => facade.getMedications({
      ...state,
      ...query,
    }),
    getVitalSigns: (query = {}) => facade.getVitalSigns({
      ...state,
      ...query,
    }),
    getSectionSummary: () => facade.getSectionSummary({ sections: state.sections }),
  };
}

/**
 * Builds one reusable high-level clinical response view over the bundle body.
 */
function buildProcessedClinicalBundleResponse(body: unknown): ProcessedClinicalBundleResponse {
  const bundle = unwrapBody(body);
  const views = toClinicalResourceExpandedViews(bundle);
  const summary = summarizeClinicalBundle(bundle);
  const documentFacade = createFhirDocumentFacade(normalizeClinicalDocumentBundle(bundle));
  const reader = createClinicalBundleQueryBuilder(documentFacade);
  const sectionSummary = documentFacade.getSectionSummary();
  return {
    totalErrors: 0,
    totalSections: Object.keys(buildClinicalSectionCounts(views)).length,
    totalResources: summary.totalEntries,
    totalResourcesInSection: buildClinicalSectionCounts(views),
    totalNarratives: summary.xhtmlEntries,
    totalNotes: summary.notedEntries,
    summary,
    views,
    sectionSummary,
    getSections: () => documentFacade.getSections(),
    getResources: (query?: string | FhirDocumentResourceQuery) => documentFacade.getResources(query),
    getByDates: (query: string | FhirDocumentResourceQuery, start?: string, end?: string) => documentFacade.getByDates(query, start, end),
    getSectionSummary: (input?: { sections?: readonly string[] }) => documentFacade.getSectionSummary(input),
    getLocalTextAndIntDisplay: (resource: FhirResourceLike) => documentFacade.getLocalTextAndIntDisplay(resource),
    getXhtmlOrDerived: (resource: FhirResourceLike) => documentFacade.getXhtmlOrDerived(resource),
    getNarrative: (resource: FhirResourceLike) => documentFacade.getNarrative(resource),
    getAllergies: (query = {}) => documentFacade.getAllergies(query),
    getConditions: (query = {}) => documentFacade.getConditions(query),
    getMedications: (query = {}) => documentFacade.getMedications(query),
    getVitalSigns: (query = {}) => documentFacade.getVitalSigns(query),
    reader,
  };
}

class ProfessionalSubjectIpsWorkspace {
  constructor(
    private readonly subjectId: string,
    private readonly bundleVault: IndividualBundleVault,
  ) {}

  public prepareRequestBundleIps = {
    new: (sectionList?: readonly string[], purpose?: string): IpsRequestDraft => {
      const normalizedSections = normalizeSectionList(sectionList);
      const summaryOperationRequestParameters = createSummaryOperationRequestParameters({
        subjectId: this.subjectId,
        filterSections: normalizedSections,
      });
      return {
        subjectId: this.subjectId,
        purpose: typeof purpose === 'string' && purpose.trim() ? purpose.trim() : undefined,
        sectionList: normalizedSections,
        summaryOperationRequestParameters,
        summaryOperationRequestReferencePath: createSummaryOperationRequestReferencePath(
          summaryOperationRequestParameters,
        ),
        summaryOperationRequestParametersResource: createSummaryOperationRequestParametersResource(
          summaryOperationRequestParameters,
        ),
      };
    },
  };

  public processResponseBundleIps(body: unknown): ProcessedClinicalBundleResponse {
    return buildProcessedClinicalBundleResponse(body);
  }

  public async rememberResponseBundleIps(body: unknown): Promise<IndividualBundleVault> {
    await this.bundleVault.importBundleDocument(unwrapBody(body));
    return this.bundleVault;
  }

  public async addVitalSign(input: BuildVitalSignObservationClaimsInput): Promise<IndividualBundleVault> {
    await this.bundleVault.upsertVitalSign(input);
    return this.bundleVault;
  }

  public get cache() {
    return this.bundleVault;
  }
}

class ProfessionalSubjectWorkspace {
  constructor(
    private readonly profile: BackendProfessionalProfile,
    private readonly cacheBySubject = new Map<string, IndividualBundleVault>(),
  ) {}

  public async use(subjectId: string): Promise<ProfessionalSubjectIpsWorkspace> {
    const normalizedSubjectId = String(subjectId || '').trim() || String(this.profile.profile.descriptor.subjectDid || '').trim();
    let bundleVault = this.cacheBySubject.get(normalizedSubjectId);
    if (!bundleVault) {
      bundleVault = await new IndividualBundleVault({
        vaultRepository: new VaultMemRepository(),
        individualId: normalizedSubjectId,
      }).initialize();
      this.cacheBySubject.set(normalizedSubjectId, bundleVault);
    }
    return new ProfessionalSubjectIpsWorkspace(normalizedSubjectId, bundleVault);
  }
}

export class ProfessionalProfileWorkspace {
  public readonly subject: ProfessionalSubjectWorkspace;

  constructor(
    public readonly profile: BackendProfessionalProfile,
  ) {
    this.subject = new ProfessionalSubjectWorkspace(profile);
  }
}

export class OrganizationControllerProfileWorkspace {
  public readonly organization = {
    bundleEditor: {
      consentTemplate: (initialBundle?: Record<string, any>) => createConsentAccessEditor(
        initialBundle ? { initialBundle: initialBundle as BundleJsonApi<BundleEntry> } : undefined,
      ),
      invoice: () => createInvoiceBundleEditor(),
      clinicalCommunication: (initialBundle?: Record<string, any>, communicationClaims?: Record<string, unknown>) =>
        new CommunicationAttachedBundleSession({
          ...(initialBundle ? { initialBundle: initialBundle as BundleJsonApi<BundleEntry> } : {}),
          ...(communicationClaims ? { communicationClaims } : {}),
        }),
    },
    employee: {
      processResponseDirectory: (body: unknown) => readEmployeeSearchResults(body),
    },
    license: {
      processResponseList: (body: unknown) => summarizeLicenseListRecords(body),
    },
  };

  constructor(
    public readonly profile: BackendOrganizationControllerProfile,
  ) {}
}

export function createProfessionalProfileWorkspace(
  profile: BackendProfessionalProfile,
): ProfessionalProfileWorkspace {
  return new ProfessionalProfileWorkspace(profile);
}

export function createOrganizationControllerProfileWorkspace(
  profile: BackendOrganizationControllerProfile,
): OrganizationControllerProfileWorkspace {
  return new OrganizationControllerProfileWorkspace(profile);
}

export {
  buildProcessedClinicalBundleResponse,
  buildVitalSignObservationClaims,
};

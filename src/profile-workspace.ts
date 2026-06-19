// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import {
  CommunicationAttachedBundleSession,
  IndividualBundleVault,
  VaultMemRepository,
  buildVitalSignObservationClaims,
  createConsentAccessEditor,
  createInvoiceBundleEditor,
  createSummaryOperationRequestParameters,
  createSummaryOperationRequestParametersResource,
  createSummaryOperationRequestReferencePath,
  readEmployeeSearchResults,
  summarizeClinicalBundle,
  summarizeLicenseListRecords,
  toClinicalResourceExpandedViews,
  type BuildVitalSignObservationClaimsInput,
} from 'gdc-common-utils-ts';
import type { BundleEntry, BundleJsonApi } from 'gdc-common-utils-ts/models/bundle';
import type { BackendOrganizationControllerProfile, BackendProfessionalProfile } from './backend-profile-runtime.js';

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

function buildProcessedClinicalBundleResponse(body: unknown): ProcessedClinicalBundleResponse {
  const bundle = unwrapBody(body);
  const views = toClinicalResourceExpandedViews(bundle);
  const summary = summarizeClinicalBundle(bundle);
  return {
    totalErrors: 0,
    totalSections: Object.keys(buildClinicalSectionCounts(views)).length,
    totalResources: summary.totalEntries,
    totalResourcesInSection: buildClinicalSectionCounts(views),
    totalNarratives: summary.xhtmlEntries,
    totalNotes: summary.notedEntries,
    summary,
    views,
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

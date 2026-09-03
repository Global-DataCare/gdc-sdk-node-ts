// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import { randomUUID } from 'node:crypto';

import { HealthcareDocumentTypes } from 'gdc-common-utils-ts/constants';
import { CompositionClaim } from 'gdc-common-utils-ts/models';
import type { MetaTagCoding } from 'gdc-common-utils-ts/models/confidential-storage';
import { extractBundleSearchResources } from 'gdc-common-utils-ts/utils/organization-employee-lifecycle';

import type { RouteContext } from './individual-onboarding.js';
import type { PollOptions, SubmitAndPollResult } from './orchestration/client-port.js';

export type DigitalTwinFhirFormat = 'org.hl7.fhir.r4' | 'org.hl7.fhir.api';

const DIGITAL_TWIN_SUBJECT_URN_UUID = /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Returns whether a value can be used as a pseudonymous digital-twin subject. */
export function isDigitalTwinSubjectId(value: unknown): value is string {
  return DIGITAL_TWIN_SUBJECT_URN_UUID.test(String(value || '').trim());
}

/** Rejects operational DIDs and malformed or caller-invented subject shapes. */
export function assertDigitalTwinSubjectId(value: unknown): asserts value is string {
  if (!isDigitalTwinSubjectId(value)) {
    throw new Error('Digital twin subject must be a valid urn:uuid identifier.');
  }
}

/** Search parameters evaluated against a ResearchSubject's canonical Composition index. */
export const DigitalTwinSearchParameter = Object.freeze({
  Section: 'section',
  DateFrom: 'date-from',
  DateTo: 'date-to',
  Text: 'text',
  MetaTag: 'Composition.meta-tag',
});

export type DigitalTwinSearchInput = {
  /** SMART bearer used for this research operation. */
  accessToken?: string;
  thid?: string;
  format?: DigitalTwinFhirFormat;
  /** Public twin search resource; exposed for low-level request inspection only. */
  resourceType?: 'ResearchSubject';
  /** One or more IPS section tokens. Basic search uses OR across sections. */
  sections?: readonly string[];
  /** Inclusive clinical-event lower bound as ISO date or dateTime. */
  dateFrom?: string;
  /** Inclusive upper bound. When omitted, GW resolves its current time. */
  dateTo?: string;
  /** Case- and accent-insensitive text matched against GW's private derived index. */
  text?: string;
  /** Advanced/compatibility filters. Do not combine with basic-search fields. */
  filters?: Readonly<Record<string, string | readonly string[] | undefined>>;
  pollOptions?: PollOptions;
};

/**
 * One public ResearchSubject digital twin returned by search.
 *
 * `composition` is an SDK-only normalized view of the canonical Composition:
 * it comes from mixed `meta.claims` in claims-first API responses or from
 * `ResearchSubject.contained[]` in strict FHIR R4/R5. GW never emits an
 * ad-hoc `ResearchSubject.composition` wire property. The canonical index joins
 * the ResearchSubject to resources later returned by `$summary`.
 */
export type DigitalTwinSearchMatch = Record<string, unknown> & {
  resourceType?: 'ResearchSubject';
  id?: string;
  [CompositionClaim.Subject]: string;
  [CompositionClaim.Section]?: string;
  composition?: Record<string, unknown>;
  meta?: { tag?: DigitalTwinResearchTag[] };
};

/** High-level search result; GW transport envelopes remain available for diagnostics. */
export type DigitalTwinSearchResult = {
  total: number;
  matches: DigitalTwinSearchMatch[];
  operation: SubmitAndPollResult;
};

export type DigitalTwinMaterializationInput = {
  /** SMART bearer used for this research operation. */
  accessToken?: string;
  twinSubjectId: string;
  thid?: string;
  format?: DigitalTwinFhirFormat;
  sections?: readonly string[];
  sent?: string;
  pollOptions?: PollOptions;
};

/** Ledger-safe employee-defined marker attached to a research working copy. */
export type DigitalTwinResearchTag = Required<Pick<MetaTagCoding, 'system' | 'code' | 'userSelected'>> &
  Pick<MetaTagCoding, 'version'> & {
  /** Stable position/name for the tag in the Composition metadata. */
  id?: string;
};

/**
 * Tag chosen by a professional when saving a personal workset.
 * `userSelected` is intentionally absent: the SDK persists it as `true`.
 */
export type DigitalTwinWorksetTagInput = Omit<DigitalTwinResearchTag, 'userSelected'>;

/**
 * Saves a researcher-owned Composition working selection for one twin.
 *
 * This does not mutate the canonical twin or copy clinical data. The record
 * stores the pseudonymous subject, section, author and ledger-safe tags used
 * to recover the researcher's working set later.
 */
export type DigitalTwinSelectionInput = {
  accessToken?: string;
  twinSubjectId: string;
  section: string;
  tags: readonly DigitalTwinWorksetTagInput[];
  /**
   * Operational hosted employee DID. High-level callers should omit this:
   * `DigitalTwinSdk` binds it to the authenticated actor session.
   */
  authorDid?: string;
  /** Optional FHIR logical id for this saved selection. A UUID is generated when omitted. */
  selectionId?: string;
  /** @deprecated Use `selectionId`; retained for low-level compatibility. */
  compositionId?: string;
  documentType?: string;
  date?: string;
  thid?: string;
  format?: DigitalTwinFhirFormat;
  pollOptions?: PollOptions;
};

/**
 * Builds one opaque FHIR logical id for a saved working selection.
 *
 * Ownership remains in the standard `Composition.author` claim. Reopening a
 * a saved collection uses `meta.tag` plus that author; no non-FHIR branch
 * claims or employee hashes in tag systems exist.
 */
export function buildDigitalTwinSelectionIdentifier(input: Readonly<{
  selectionId?: string;
}>): Readonly<{ selectionId: string; compositionId: string }> {
  const selectionId = String(input.selectionId || '').trim() || randomUUID();
  if (!/^[A-Za-z0-9.-]{1,64}$/.test(selectionId)) {
    throw new Error('Digital twin selectionId must be a valid FHIR logical id.');
  }
  return Object.freeze({
    selectionId,
    compositionId: selectionId,
  });
}

export type DigitalTwinRuntimeDeps = {
  digitalTwinSearchPath: (ctx: RouteContext, format: DigitalTwinFhirFormat, resourceType: string) => string;
  digitalTwinSearchPollPath: (ctx: RouteContext, format: DigitalTwinFhirFormat, resourceType: string) => string;
  digitalTwinCommunicationBatchPath: (ctx: RouteContext, format: DigitalTwinFhirFormat) => string;
  digitalTwinCommunicationPollPath: (ctx: RouteContext, format: DigitalTwinFhirFormat) => string;
  digitalTwinCompositionBatchPath: (ctx: RouteContext, format: DigitalTwinFhirFormat) => string;
  digitalTwinCompositionPollPath: (ctx: RouteContext, format: DigitalTwinFhirFormat) => string;
  submitAndPoll: (
    submitPath: string,
    pollPath: string,
    payload: { thid: string; body: Record<string, unknown> },
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/**
 * Normalizes the public aggregate without leaking its wire representation.
 * Claims-first responses mix ResearchSubject and Composition flat claims in
 * `meta.claims`; versioned FHIR responses carry the translated Composition in
 * `contained[]`. The ad-hoc `composition` property remains read-only legacy.
 */
function normalizeDigitalTwinSearchMatch(resource: Record<string, unknown>): DigitalTwinSearchMatch {
  const metaClaims = asRecord(asRecord(resource.meta)?.claims);
  const containedComposition = Array.isArray(resource.contained)
    ? resource.contained.map(asRecord).find((candidate) => candidate?.resourceType === 'Composition')
    : undefined;
  const legacyComposition = asRecord(resource.composition);
  const legacyCompositionClaims = asRecord(asRecord(legacyComposition?.meta)?.claims);
  const containedSubject = asRecord(containedComposition?.subject)?.reference;
  const subject = resource[CompositionClaim.Subject]
    ?? metaClaims?.[CompositionClaim.Subject]
    ?? containedSubject
    ?? legacyComposition?.[CompositionClaim.Subject]
    ?? legacyCompositionClaims?.[CompositionClaim.Subject];
  assertDigitalTwinSubjectId(subject);

  const composition = containedComposition
    ?? legacyComposition
    ?? (metaClaims ? { resourceType: 'Composition', meta: { claims: metaClaims } } : undefined);
  return {
    ...resource,
    [CompositionClaim.Subject]: subject,
    ...(composition ? { composition } : {}),
  } as DigitalTwinSearchMatch;
}

/** Finds the primary-document Bundle inside a direct or decoded DIDComm response. */
function findDigitalTwinSearchBundle(value: unknown): Record<string, unknown> | undefined {
  const pending: unknown[] = [value];
  const visited = new Set<object>();
  while (pending.length > 0) {
    const candidate = pending.shift();
    if (!candidate || typeof candidate !== 'object' || visited.has(candidate)) continue;
    visited.add(candidate);
    if (Array.isArray(candidate)) {
      pending.push(...candidate);
      continue;
    }
    const record = candidate as Record<string, unknown>;
    const hasEntries = Array.isArray(record.data) || Array.isArray(record.entry);
    if (hasEntries && (record.resourceType === 'Bundle' || candidate === value)) {
      return record;
    }
    pending.push(...Object.values(record));
  }
  return undefined;
}

function normalizeResearchTags(tags: readonly DigitalTwinWorksetTagInput[]): Array<Required<Pick<DigitalTwinResearchTag, 'id' | 'system' | 'code' | 'userSelected'>> & Pick<DigitalTwinResearchTag, 'version'>> {
  if (!Array.isArray(tags) || tags.length === 0) throw new Error('At least one research tag is required.');
  const normalized = tags.map((tag, index) => {
    const system = String(tag?.system || '').trim();
    const code = String(tag?.code || '').trim();
    if (!system || !code) throw new Error('Each research tag requires system and code.');
    return {
      id: String(tag.id || `Composition.meta.tag[${index}]`).trim(),
      system,
      code,
      userSelected: true,
      ...(tag.version ? { version: String(tag.version) } : {}),
    };
  });
  if (new Set(normalized.map((tag) => tag.id)).size !== normalized.length) {
    throw new Error('Research tag ids must be unique within one selection.');
  }
  return normalized;
}

/** Opens the GW async response and exposes the matched ResearchSubjects directly. */
export function readDigitalTwinSearchResult(operation: SubmitAndPollResult): DigitalTwinSearchResult {
  const bundle = findDigitalTwinSearchBundle(operation?.poll?.body);
  const entries = Array.isArray(bundle?.data)
    ? bundle.data
    : Array.isArray(bundle?.entry)
      ? bundle.entry
      : undefined;
  if (!bundle || !entries) {
    throw new Error('Digital twin search did not return a ResearchSubject result set.');
  }
  const matches = extractBundleSearchResources({ ...bundle, data: entries })
    .map(normalizeDigitalTwinSearchMatch);
  const legacyAggregate = entries
    .map((entry) => (entry as { resource?: unknown } | undefined)?.resource)
    .find((resource) => resource && typeof resource === 'object' && Array.isArray((resource as { data?: unknown }).data)) as { total?: unknown } | undefined;
  const parsedTotal = Number(legacyAggregate?.total ?? bundle.total);
  return {
    total: Number.isFinite(parsedTotal) ? parsedTotal : matches.length,
    matches,
    operation,
  };
}

/** Persists one tagged researcher working copy through `digitaltwin/Composition/_batch`. */
export async function saveDigitalTwinSelectionWithDeps(
  ctx: RouteContext,
  input: DigitalTwinSelectionInput,
  deps: DigitalTwinRuntimeDeps,
): Promise<SubmitAndPollResult> {
  const twinSubjectId = String(input.twinSubjectId || '').trim();
  const section = String(input.section || '').trim();
  const authorDid = String(input.authorDid || '').trim();
  assertDigitalTwinSubjectId(twinSubjectId);
  if (!section) throw new Error('Digital twin selection section is required.');
  if (!authorDid) throw new Error('Digital twin selection authorDid is required.');

  const format = input.format || 'org.hl7.fhir.r4';
  const thid = String(input.thid || randomUUID());
  const selectionIdentifier = buildDigitalTwinSelectionIdentifier({
    selectionId: input.selectionId || input.compositionId,
  });
  const compositionId = selectionIdentifier.compositionId;
  const tags = normalizeResearchTags(input.tags);
  const claims = {
    '@context': format,
    '@type': 'Composition:ResearcherWorkingSelection',
    [CompositionClaim.Identifier]: compositionId,
    [CompositionClaim.Subject]: twinSubjectId,
    [CompositionClaim.Section]: section,
    [CompositionClaim.Type]: input.documentType || HealthcareDocumentTypes.IPS.attributeValue,
    [CompositionClaim.Author]: authorDid,
    [CompositionClaim.Date]: input.date || new Date().toISOString(),
  };
  const resource = {
    resourceType: 'Composition',
    id: compositionId,
    meta: { claims, tag: tags },
  };
  const entry = {
    type: 'Composition',
    resource,
    request: { method: 'POST', url: `digitaltwin/${format}/Composition` },
  };

  return deps.submitAndPoll(
    deps.digitalTwinCompositionBatchPath(ctx, format),
    deps.digitalTwinCompositionPollPath(ctx, format),
    {
      thid,
      body: format === 'org.hl7.fhir.api'
        ? { resourceType: 'Bundle', type: 'batch', data: [entry] }
        : { resourceType: 'Bundle', type: 'batch', entry: [entry] },
    },
    input.pollOptions,
  );
}

/**
 * Searches ResearchSubject digital twins through the public asynchronous route.
 * GW filters their canonical Composition index documents internally; callers
 * never switch to a separate public Composition search surface.
 */
export async function searchDigitalTwinsWithDeps(
  ctx: RouteContext,
  input: DigitalTwinSearchInput,
  deps: DigitalTwinRuntimeDeps,
): Promise<SubmitAndPollResult> {
  const format = input.format || 'org.hl7.fhir.r4';
  const resourceType = String(input.resourceType || 'ResearchSubject').trim();
  if (!resourceType) throw new Error('Digital twin resourceType is required.');
  const usesBasicSearch = Boolean(input.sections || input.dateFrom || input.dateTo || input.text);
  if (usesBasicSearch && Object.keys(input.filters || {}).length > 0) {
    throw new Error('Digital twin basic search cannot be combined with advanced filters.');
  }
  const sections = (input.sections || []).map((value) => String(value || '').trim()).filter(Boolean);
  const dateFrom = String(input.dateFrom || '').trim();
  const dateTo = String(input.dateTo || '').trim();
  const searchText = String(input.text || '').trim();
  if (usesBasicSearch) {
    if (sections.length === 0) throw new Error('Digital twin basic search requires at least one section.');
    if (!dateFrom) throw new Error('Digital twin basic search requires dateFrom.');
    if (!searchText) throw new Error('Digital twin basic search requires text.');
    const fromMs = Date.parse(dateFrom);
    const toMs = dateTo ? Date.parse(dateTo) : undefined;
    if (Number.isNaN(fromMs)) throw new Error('Digital twin basic search dateFrom must be an ISO date or dateTime.');
    if (dateTo && Number.isNaN(toMs)) throw new Error('Digital twin basic search dateTo must be an ISO date or dateTime.');
    if (toMs !== undefined && toMs < fromMs) throw new Error('Digital twin basic search dateTo must be on or after dateFrom.');
  }
  const advancedParameters = Object.entries(input.filters || {}).flatMap(([name, value]) => {
    const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
    return values.map((item) => ({ name, valueString: String(item) }));
  });
  const parameters: Array<{ name: string; valueString?: string; valueDate?: string }> = usesBasicSearch
    ? [
        ...sections.map((section) => ({ name: DigitalTwinSearchParameter.Section, valueString: section })),
        { name: DigitalTwinSearchParameter.DateFrom, valueDate: dateFrom },
        ...(dateTo ? [{ name: DigitalTwinSearchParameter.DateTo, valueDate: dateTo }] : []),
        { name: DigitalTwinSearchParameter.Text, valueString: searchText },
      ]
    : advancedParameters;
  const thid = String(input.thid || randomUUID());
  const body = format === 'org.hl7.fhir.api'
    ? {
        data: [{
          type: `${resourceType}-search-request-v1.0`,
          resource: {
            resourceType: 'Parameters',
            parameter: parameters,
            meta: { claims: Object.fromEntries([
              ['@context', format],
              ...parameters.map((parameter) => [parameter.name, parameter.valueString || parameter.valueDate || '']),
            ]) },
          },
        }],
      }
    : { resourceType: 'Parameters', parameter: parameters };
  return deps.submitAndPoll(
    deps.digitalTwinSearchPath(ctx, format, resourceType),
    deps.digitalTwinSearchPollPath(ctx, format, resourceType),
    {
      thid,
      body,
    },
    input.pollOptions,
  );
}

/** Materializes one selected pseudonymous twin as a research summary Bundle. */
export async function materializeDigitalTwinWithDeps(
  ctx: RouteContext,
  input: DigitalTwinMaterializationInput,
  deps: DigitalTwinRuntimeDeps,
): Promise<SubmitAndPollResult> {
  const twinSubjectId = String(input.twinSubjectId || '').trim();
  assertDigitalTwinSubjectId(twinSubjectId);
  const format = input.format || 'org.hl7.fhir.r4';
  const thid = String(input.thid || randomUUID());
  const parameters = [
    { name: 'subject', valueString: twinSubjectId },
    ...(input.sections || []).map((section) => ({ name: 'section', valueString: String(section) })),
  ];
  const encodedParameters = Buffer.from(JSON.stringify({
    resourceType: 'Parameters',
    parameter: parameters,
  }), 'utf8').toString('base64');
  return deps.submitAndPoll(
    deps.digitalTwinCommunicationBatchPath(ctx, format),
    deps.digitalTwinCommunicationPollPath(ctx, format),
    {
      thid,
      body: {
        resourceType: 'Bundle',
        type: 'batch',
        entry: [{
          request: { method: 'POST', url: `digitaltwin/${format}/Communication` },
          resource: {
            resourceType: 'Communication',
            status: 'completed',
            subject: { reference: twinSubjectId },
            sent: input.sent || new Date().toISOString(),
            payload: [{
              contentReference: { reference: `digitaltwin/${format}/ResearchSubject/$summary` },
              contentAttachment: { contentType: 'application/fhir+json', data: encodedParameters },
            }],
          },
        }],
      },
    },
    input.pollOptions,
  );
}

// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import { randomUUID } from 'node:crypto';

import type { RouteContext } from './individual-onboarding.js';
import type { PollOptions, SubmitAndPollResult } from './orchestration/client-port.js';

export type DigitalTwinFhirFormat = 'org.hl7.fhir.r4' | 'org.hl7.fhir.api';

export type DigitalTwinSearchInput = {
  /** SMART bearer used for this research operation. */
  accessToken?: string;
  thid?: string;
  format?: DigitalTwinFhirFormat;
  resourceType?: string;
  filters?: Readonly<Record<string, string | readonly string[] | undefined>>;
  pollOptions?: PollOptions;
};

/** One pseudonymous Composition returned by a digital-twin search. */
export type DigitalTwinSearchMatch = Record<string, unknown> & {
  id?: string;
  'Composition.subject': string;
  'Composition.section'?: string;
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

/** Ledger-safe organization-defined marker attached to a research working copy. */
export type DigitalTwinResearchTag = {
  /** Stable position/name for the tag in the Composition metadata. */
  id?: string;
  /** Organization-owned coding system, for example `urn:acme:research:workset`. */
  system: string;
  /** Machine-readable custom value, for example `study-2026-04` or `reviewed`. */
  code: string;
  version?: string;
  userSelected?: boolean;
};

/**
 * Saves a researcher-owned Composition branch for one selected twin.
 *
 * This does not mutate the canonical twin or copy clinical data. The branch
 * stores the pseudonymous subject, section, author and ledger-safe tags used
 * to recover the researcher's working set later.
 */
export type DigitalTwinSelectionInput = {
  accessToken?: string;
  twinSubjectId: string;
  section: string;
  tags: readonly DigitalTwinResearchTag[];
  authorDid?: string;
  compositionId?: string;
  documentType?: string;
  date?: string;
  thid?: string;
  format?: DigitalTwinFhirFormat;
  pollOptions?: PollOptions;
};

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

function normalizeResearchTags(tags: readonly DigitalTwinResearchTag[]): Array<Required<Pick<DigitalTwinResearchTag, 'id' | 'system' | 'code'>> & Pick<DigitalTwinResearchTag, 'version' | 'userSelected'>> {
  if (!Array.isArray(tags) || tags.length === 0) throw new Error('At least one research tag is required.');
  const normalized = tags.map((tag, index) => {
    const system = String(tag?.system || '').trim();
    const code = String(tag?.code || '').trim();
    if (!system || !code) throw new Error('Each research tag requires system and code.');
    return {
      id: String(tag.id || `Composition.meta.tag[${index}]`).trim(),
      system,
      code,
      ...(tag.version ? { version: String(tag.version) } : {}),
      ...(typeof tag.userSelected === 'boolean' ? { userSelected: tag.userSelected } : {}),
    };
  });
  if (new Set(normalized.map((tag) => tag.id)).size !== normalized.length) {
    throw new Error('Research tag ids must be unique within one selection.');
  }
  return normalized;
}

/** Opens the GW async response and exposes the matched Compositions directly. */
export function readDigitalTwinSearchResult(operation: SubmitAndPollResult): DigitalTwinSearchResult {
  const body = operation?.poll?.body as Record<string, unknown> | undefined;
  const responseEntries = Array.isArray(body?.data)
    ? body.data
    : Array.isArray(body?.entry)
      ? body.entry
      : [];
  const responseEntry = responseEntries.find((entry) => {
    const resource = (entry as { resource?: unknown } | undefined)?.resource;
    return Boolean(resource && typeof resource === 'object' && Array.isArray((resource as { data?: unknown }).data));
  }) as { resource?: { total?: unknown; data?: unknown[] } } | undefined;
  if (!responseEntry?.resource || !Array.isArray(responseEntry.resource.data)) {
    throw new Error('Digital twin search did not return a Composition result set.');
  }
  const matches = responseEntry.resource.data as DigitalTwinSearchMatch[];
  const parsedTotal = Number(responseEntry.resource.total);
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
  if (!twinSubjectId) throw new Error('twinSubjectId is required.');
  if (!section) throw new Error('Digital twin selection section is required.');
  if (!authorDid) throw new Error('Digital twin selection authorDid is required.');

  const format = input.format || 'org.hl7.fhir.r4';
  const thid = String(input.thid || randomUUID());
  const compositionId = String(input.compositionId || `urn:uuid:${randomUUID()}`);
  const tags = normalizeResearchTags(input.tags);
  const claims = {
    '@context': format,
    '@type': 'Composition:ResearcherWorkingSelection',
    'Composition.identifier': compositionId,
    'Composition.subject': twinSubjectId,
    'Composition.section': section,
    'Composition.type': input.documentType || 'LOINC|60591-5',
    'Composition.author': authorDid,
    'Composition.date': input.date || new Date().toISOString(),
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

/** Searches the tenant digital-twin index through its public asynchronous route. */
export async function searchDigitalTwinsWithDeps(
  ctx: RouteContext,
  input: DigitalTwinSearchInput,
  deps: DigitalTwinRuntimeDeps,
): Promise<SubmitAndPollResult> {
  const format = input.format || 'org.hl7.fhir.r4';
  const resourceType = String(input.resourceType || 'Composition').trim();
  if (!resourceType) throw new Error('Digital twin resourceType is required.');
  const parameters = Object.entries(input.filters || {}).flatMap(([name, value]) => {
    const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
    return values.map((item) => ({ name, valueString: String(item) }));
  });
  const thid = String(input.thid || randomUUID());
  const body = format === 'org.hl7.fhir.api'
    ? {
        data: [{
          type: `${resourceType}-search-request-v1.0`,
          resource: { resourceType: 'Parameters', parameter: parameters },
          meta: {
            claims: Object.fromEntries([
              ['@context', format],
              ...parameters.map((parameter) => [parameter.name, parameter.valueString]),
            ]),
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
  if (!twinSubjectId) throw new Error('twinSubjectId is required.');
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

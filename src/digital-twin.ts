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

export type DigitalTwinRuntimeDeps = {
  digitalTwinSearchPath: (ctx: RouteContext, format: DigitalTwinFhirFormat, resourceType: string) => string;
  digitalTwinSearchPollPath: (ctx: RouteContext, format: DigitalTwinFhirFormat, resourceType: string) => string;
  digitalTwinCommunicationBatchPath: (ctx: RouteContext, format: DigitalTwinFhirFormat) => string;
  digitalTwinCommunicationPollPath: (ctx: RouteContext, format: DigitalTwinFhirFormat) => string;
  submitAndPoll: (
    submitPath: string,
    pollPath: string,
    payload: { thid: string; body: Record<string, unknown> },
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
};

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

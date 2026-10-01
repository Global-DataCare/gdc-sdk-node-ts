// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import type { SubmitResponse } from 'gdc-sdk-core-ts';

/**
 * Preserves the GW response when an asynchronous operation is rejected before
 * a polling job exists.
 *
 * Callers can inspect {@link status}, {@link body} and {@link location}
 * without losing a FHIR `OperationOutcome`. The SDK must never poll a
 * `*-response` endpoint after this error is raised.
 */
export class GatewaySubmitError extends Error {
  public readonly status: number;
  public readonly body: unknown;
  public readonly location?: string;

  public constructor(response: SubmitResponse) {
    const diagnostics = firstOperationOutcomeDiagnostics(response.body);
    super(`Gateway submit failed with HTTP ${response.status}${diagnostics ? `: ${diagnostics}` : '.'}`);
    this.name = 'GatewaySubmitError';
    this.status = response.status;
    this.body = response.body;
    this.location = response.location;
  }
}

/**
 * Accepts only a successful initial HTTP response before asynchronous polling.
 * A `4xx` or `5xx` is terminal and is preserved as a
 * {@link GatewaySubmitError}; it does not identify an accepted polling job.
 */
export function requireSuccessfulGatewaySubmit(response: SubmitResponse): void {
  if (response.status >= 200 && response.status < 300) return;
  throw new GatewaySubmitError(response);
}

function firstOperationOutcomeDiagnostics(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as { resourceType?: unknown; issue?: unknown };
  if (candidate.resourceType !== 'OperationOutcome' || !Array.isArray(candidate.issue)) return undefined;
  for (const issue of candidate.issue) {
    if (!issue || typeof issue !== 'object') continue;
    const diagnostics = String((issue as { diagnostics?: unknown }).diagnostics || '').trim();
    if (diagnostics) return diagnostics;
  }
  return undefined;
}

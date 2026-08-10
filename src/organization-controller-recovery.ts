// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import type {
  NodeLegalOrganizationVerificationTransactionInput,
  PollOptions,
  SubmitAndPollResult,
} from './orchestration/client-port.js';
import type { HostRouteContext } from './host-onboarding.js';
import type { RouteContext } from './individual-onboarding.js';
import type { EmployeeDeviceActivationResult } from './device-activation.js';
import { activateEmployeeDeviceWithActivationCodeWithDeps } from './device-activation.js';

export type OrganizationControllerRecoveryInput = {
  credentialReissuanceInput?: NodeLegalOrganizationVerificationTransactionInput;
  /** @deprecated Use `credentialReissuanceInput`. */
  issueInput?: NodeLegalOrganizationVerificationTransactionInput;
  controllerIdToken: string;
  dcrPayload: Record<string, unknown>;
  credentialReissuancePollOptions?: PollOptions;
  /** @deprecated Use `credentialReissuancePollOptions`. */
  issuePollOptions?: PollOptions;
  activationPollOptions?: PollOptions;
};

export type OrganizationControllerRecoveryResult = {
  credentialReissuance: SubmitAndPollResult;
  /** @deprecated Use `credentialReissuance`. */
  issue: SubmitAndPollResult;
  activationCode: string;
  activation: EmployeeDeviceActivationResult;
};

type RecoverOrganizationControllerWithCredentialReissuanceDeps = {
  hostCtx: HostRouteContext;
  tenantCtx: RouteContext;
  input: OrganizationControllerRecoveryInput;
  submitLegalOrganizationCredentialReissuance?: (
    hostCtx: HostRouteContext,
    input: NodeLegalOrganizationVerificationTransactionInput,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
  /** @deprecated Use `submitLegalOrganizationCredentialReissuance`. */
  submitLegalOrganizationIssue?: (
    hostCtx: HostRouteContext,
    input: NodeLegalOrganizationVerificationTransactionInput,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
  identityTokenExchangePath: (ctx: RouteContext) => string;
  identityTokenExchangePollPath: (ctx: RouteContext) => string;
  identityDeviceDcrPath: (ctx: RouteContext) => string;
  identityDeviceDcrPollPath: (ctx: RouteContext) => string;
  submitAndPollWithBearerToken: (
    bearerToken: string | undefined,
    submitPath: string,
    pollPath: string,
    payload: { thid?: string } & Record<string, unknown>,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
};

export async function recoverOrganizationControllerWithCredentialReissuanceWithDeps(
  deps: RecoverOrganizationControllerWithCredentialReissuanceDeps,
): Promise<OrganizationControllerRecoveryResult> {
  /**
   * Existing-tenant controller recovery contract:
   * - `Organization/_issue` is expected to reissue controller activation
   *   material only
   * - this flow must not depend on a new commercial Offer or Order step
   */
  const submitCredentialReissuance = deps.submitLegalOrganizationCredentialReissuance
    || deps.submitLegalOrganizationIssue;
  if (!submitCredentialReissuance) {
    throw new Error('recoverOrganizationControllerWithCredentialReissuance: missing credential reissuance client method.');
  }
  const credentialReissuanceInput = deps.input.credentialReissuanceInput
    || deps.input.issueInput;
  if (!credentialReissuanceInput) {
    throw new Error('recoverOrganizationControllerWithCredentialReissuance: missing credentialReissuanceInput.');
  }
  const credentialReissuance = await submitCredentialReissuance(
    deps.hostCtx,
    credentialReissuanceInput,
    deps.input.credentialReissuancePollOptions || deps.input.issuePollOptions,
  );

  const activationCode = readLegalOrganizationCredentialReissuanceActivationCode(credentialReissuance);
  if (!activationCode) {
    throw new Error('recoverOrganizationControllerWithCredentialReissuance: missing org.schema.IndividualProduct.serialNumber in Organization/_issue response.');
  }

  const activation = await activateEmployeeDeviceWithActivationCodeWithDeps({
    routeCtx: deps.tenantCtx,
    input: {
      activationCode,
      idToken: deps.input.controllerIdToken,
      dcrPayload: deps.input.dcrPayload,
      pollOptions: deps.input.activationPollOptions,
    },
    identityTokenExchangePath: deps.identityTokenExchangePath,
    identityTokenExchangePollPath: deps.identityTokenExchangePollPath,
    identityDeviceDcrPath: deps.identityDeviceDcrPath,
    identityDeviceDcrPollPath: deps.identityDeviceDcrPollPath,
    submitAndPollWithBearerToken: deps.submitAndPollWithBearerToken,
  });

  return {
    credentialReissuance,
    issue: credentialReissuance,
    activationCode,
    activation,
  };
}

/** @deprecated Use `recoverOrganizationControllerWithCredentialReissuanceWithDeps`. */
export const recoverOrganizationControllerWithIssueWithDeps =
  recoverOrganizationControllerWithCredentialReissuanceWithDeps;

/**
 * Reads the opaque activation code from a successful Organization/_issue poll result.
 *
 * Gateway deployments may retain one or more transport/job envelopes around
 * the terminal batch response. Only a response entry carrying the canonical
 * serial-number claim, or an explicitly typed `License:Issued` entry carrying
 * its public `id`, is accepted. Unrelated identifiers are never interpreted as
 * activation material.
 */
export function readLegalOrganizationCredentialReissuanceActivationCode(result: SubmitAndPollResult): string {
  const pollBody = (result?.poll?.body || {}) as Record<string, unknown>;
  for (const candidate of nestedObjects(pollBody)) {
    const claims = (candidate.meta as Record<string, unknown> | undefined)?.claims as Record<string, unknown> | undefined;
    const activationCode = String(claims?.['org.schema.IndividualProduct.serialNumber'] || '').trim();
    if (activationCode) return activationCode;

    if (candidate.type === 'License:Issued') {
      const issuedId = String(candidate.id || '').trim();
      if (issuedId) return issuedId;
    }
  }

  const diagnostics = nestedObjects(pollBody)
    .map((candidate) => String(candidate.diagnostics || '').trim())
    .filter(Boolean)
    .join(' | ');
  if (diagnostics) {
    throw new Error(`recoverOrganizationControllerWithIssue: Organization/_issue failed: ${diagnostics}`);
  }
  return '';
}

/** @deprecated Use `readLegalOrganizationCredentialReissuanceActivationCode`. */
export const readOrganizationIssueActivationCode =
  readLegalOrganizationCredentialReissuanceActivationCode;

function nestedObjects(root: unknown): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const pending: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
  const visited = new Set<object>();
  while (pending.length > 0) {
    const current = pending.shift()!;
    if (!current.value || typeof current.value !== 'object' || current.depth > 8) continue;
    if (visited.has(current.value)) continue;
    visited.add(current.value);
    if (Array.isArray(current.value)) {
      current.value.forEach((value) => pending.push({ value, depth: current.depth + 1 }));
      continue;
    }
    const record = current.value as Record<string, unknown>;
    found.push(record);
    Object.values(record).forEach((value) => pending.push({ value, depth: current.depth + 1 }));
  }
  return found;
}

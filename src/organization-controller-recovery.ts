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
  issueInput: NodeLegalOrganizationVerificationTransactionInput;
  controllerIdToken: string;
  dcrPayload: Record<string, unknown>;
  issuePollOptions?: PollOptions;
  activationPollOptions?: PollOptions;
};

export type OrganizationControllerRecoveryResult = {
  issue: SubmitAndPollResult;
  activationCode: string;
  activation: EmployeeDeviceActivationResult;
};

type RecoverOrganizationControllerWithIssueDeps = {
  hostCtx: HostRouteContext;
  tenantCtx: RouteContext;
  input: OrganizationControllerRecoveryInput;
  submitLegalOrganizationIssue: (
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

export async function recoverOrganizationControllerWithIssueWithDeps(
  deps: RecoverOrganizationControllerWithIssueDeps,
): Promise<OrganizationControllerRecoveryResult> {
  const issue = await deps.submitLegalOrganizationIssue(
    deps.hostCtx,
    deps.input.issueInput,
    deps.input.issuePollOptions,
  );

  const activationCode = readActivationCodeFromIssueResult(issue);
  if (!activationCode) {
    throw new Error('recoverOrganizationControllerWithIssue: missing org.schema.IndividualProduct.serialNumber in Organization/_issue response.');
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
    issue,
    activationCode,
    activation,
  };
}

function readActivationCodeFromIssueResult(result: SubmitAndPollResult): string {
  const pollBody = (result?.poll?.body || {}) as Record<string, unknown>;
  const body = ((pollBody.body as Record<string, unknown> | undefined) || pollBody);
  const data = Array.isArray(body.data) ? body.data : Array.isArray(pollBody.data) ? pollBody.data : [];
  const firstEntry = (data[0] as Record<string, unknown> | undefined) || {};
  const claims = (firstEntry.meta as Record<string, unknown> | undefined)?.claims as Record<string, unknown> | undefined;
  const activationCode = String(claims?.['org.schema.IndividualProduct.serialNumber'] || '').trim();
  if (activationCode) {
    return activationCode;
  }

  const diagnostics = (((firstEntry.response as Record<string, unknown> | undefined)?.outcome as Record<string, unknown> | undefined)
    ?.issue as Array<Record<string, unknown>> | undefined)
    ?.map((issue) => String(issue?.diagnostics || '').trim())
    .filter(Boolean)
    .join(' | ');
  if (diagnostics) {
    throw new Error(`recoverOrganizationControllerWithIssue: Organization/_issue failed: ${diagnostics}`);
  }
  return '';
}

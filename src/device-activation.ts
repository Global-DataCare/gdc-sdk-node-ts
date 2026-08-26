// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import { resolvePollOptionsFromSeconds } from './poll-options.js';
import {
  IdentityAuthRequestFields,
  IdentityAuthResponseFields,
  IdentityDcrMetadataFields,
  IdentityDeviceInfoFields,
} from 'gdc-common-utils-ts/constants/identity-auth';
import { buildEmployeeDeviceRevocationBody } from 'gdc-common-utils-ts/utils/organization-employee-lifecycle';
import type { PollOptions, SubmitAndPollResult } from './orchestration/client-port.js';
import type { RouteContext } from './individual-onboarding.js';

export type EmployeeDeviceActivationInput = {
  activationCode: string;
  idToken: string;
  dcrPayload: Record<string, unknown>;
  pollOptions?: PollOptions;
};

export type EmployeeDeviceActivationRequestInput = {
  tenantId?: string;
  jurisdiction?: string;
  sector?: string;
  activationCode: string;
  idToken: string;
  dcrPayload: Record<string, unknown>;
  timeoutSeconds?: number;
  intervalSeconds?: number;
};

export type EmployeeDeviceActivationResult = {
  initialAccessToken: string;
  exchange: SubmitAndPollResult;
  dcr: SubmitAndPollResult;
};

export type EmployeeDeviceRevocationInput = {
  licenseId: string;
  clientId: string;
  requestThid?: string;
  pollOptions?: PollOptions;
};

export async function revokeEmployeeDeviceWithDeps(deps: {
  routeCtx: RouteContext;
  input: EmployeeDeviceRevocationInput;
  identityDeviceRevokePath: (ctx: RouteContext) => string;
  identityDeviceRevokePollPath: (ctx: RouteContext) => string;
  submitAndPoll: (
    submitPath: string,
    pollPath: string,
    payload: { thid?: string } & Record<string, unknown>,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
}): Promise<SubmitAndPollResult> {
  const licenseId = String(deps.input.licenseId || '').trim();
  const clientId = String(deps.input.clientId || '').trim();
  if (!licenseId || !clientId) throw new Error('revokeEmployeeDevice: licenseId and clientId are required.');
  return deps.submitAndPoll(
    deps.identityDeviceRevokePath(deps.routeCtx),
    deps.identityDeviceRevokePollPath(deps.routeCtx),
    {
      thid: deps.input.requestThid || `device-revoke-${createRuntimeUuid()}`,
      body: buildEmployeeDeviceRevocationBody({ licenseId, clientId }),
    },
    deps.input.pollOptions,
  );
}

type ActivateEmployeeDeviceDeps = {
  routeCtx: RouteContext;
  input: EmployeeDeviceActivationInput;
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

type ActivateEmployeeDeviceRequestDeps = {
  routeCtx: RouteContext;
  input: EmployeeDeviceActivationRequestInput;
  defaultTimeoutMs?: number;
  defaultIntervalMs?: number;
  activateEmployeeDeviceWithActivationCode: (
    routeCtx: RouteContext,
    input: EmployeeDeviceActivationInput,
  ) => Promise<EmployeeDeviceActivationResult>;
};

export async function activateEmployeeDeviceWithActivationCodeWithDeps(
  deps: ActivateEmployeeDeviceDeps,
): Promise<EmployeeDeviceActivationResult> {
  const deviceInfo = deps.input.dcrPayload[IdentityDcrMetadataFields.ExtendedDeviceInfo] as Record<string, unknown> | undefined;
  const redirectUris = deps.input.dcrPayload[IdentityDcrMetadataFields.RedirectUris] as unknown[] | undefined;
  const jwks = deps.input.dcrPayload[IdentityDcrMetadataFields.Jwks] as { keys?: Array<{ kid?: string }> } | undefined;
  const clientInstanceId = String(
    deviceInfo?.[IdentityDeviceInfoFields.DeviceId]
    || (deps.input.dcrPayload[IdentityDcrMetadataFields.SoftwareId] ? `software:${deps.input.dcrPayload[IdentityDcrMetadataFields.SoftwareId]}` : '')
    || (redirectUris?.[0] ? `redirect:${redirectUris[0]}` : '')
    || (jwks?.keys?.[0]?.kid ? `key:${jwks.keys[0].kid}` : ''),
  ).trim();
  if (!clientInstanceId) throw new Error('Device activation requires a stable device, software, redirect, or key identifier.');
  const exchangePayload = {
    thid: `exchange-${createRuntimeUuid()}`,
    [IdentityAuthRequestFields.SubjectToken]: deps.input.activationCode,
    [IdentityAuthRequestFields.ClientInstanceId]: clientInstanceId,
  };

  const exchange = await deps.submitAndPollWithBearerToken(
    deps.input.idToken,
    deps.identityTokenExchangePath(deps.routeCtx),
    deps.identityTokenExchangePollPath(deps.routeCtx),
    exchangePayload,
    deps.input.pollOptions,
  );

  const exchangeDiagnostics = firstFailedOperationOutcomeDiagnostic(exchange.poll.body)
    || firstFailedOperationOutcomeDiagnostic(exchange.submit.body);
  if (exchangeDiagnostics) {
    throw new Error(`activateEmployeeDeviceWithActivationCode: exchange failed: ${exchangeDiagnostics}`);
  }
  const failedExchangeStatus = [exchange.submit.status, exchange.poll.status]
    .find((status) => status < 200 || status >= 300);
  if (failedExchangeStatus !== undefined) {
    throw new Error(`activateEmployeeDeviceWithActivationCode: exchange failed (HTTP ${failedExchangeStatus}).`);
  }

  const pollBody = (exchange.poll.body as Record<string, unknown>) || {};
  const exchangeBody = ((pollBody.body as Record<string, unknown> | undefined) || pollBody);
  const initialAccessToken = String(
    exchangeBody[IdentityAuthResponseFields.InitialAccessToken]
      || exchangeBody[IdentityAuthResponseFields.AccessToken]
      || '',
  ).trim();
  if (!initialAccessToken) {
    throw new Error('activateEmployeeDeviceWithActivationCode: missing initial_access_token in exchange response.');
  }

  const dcrPayload = {
    thid: `dcr-${createRuntimeUuid()}`,
    [IdentityAuthRequestFields.Code]: deps.input.activationCode,
    ...deps.input.dcrPayload,
  };

  const dcr = await deps.submitAndPollWithBearerToken(
    initialAccessToken,
    deps.identityDeviceDcrPath(deps.routeCtx),
    deps.identityDeviceDcrPollPath(deps.routeCtx),
    dcrPayload,
    deps.input.pollOptions,
  );

  return {
    initialAccessToken,
    exchange,
    dcr,
  };
}

export async function activateEmployeeDeviceWithActivationRequestWithDeps(
  deps: ActivateEmployeeDeviceRequestDeps,
): Promise<EmployeeDeviceActivationResult> {
  const pollOptions = resolvePollOptionsFromSeconds(
    deps.input.timeoutSeconds,
    deps.input.intervalSeconds,
    {
      timeoutMs: deps.defaultTimeoutMs,
      intervalMs: deps.defaultIntervalMs,
    },
  );

  return deps.activateEmployeeDeviceWithActivationCode(deps.routeCtx, {
    activationCode: deps.input.activationCode,
    idToken: deps.input.idToken,
    dcrPayload: deps.input.dcrPayload,
    pollOptions,
  });
}

function createRuntimeUuid(): string {
  const fromCrypto = globalThis.crypto?.randomUUID?.();
  if (fromCrypto) {
    return fromCrypto;
  }
  return `fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Preserves a terminal async GW diagnostic before checking success fields. */
function firstFailedOperationOutcomeDiagnostic(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const candidate = value.trim();
    if (!candidate || (candidate[0] !== '{' && candidate[0] !== '[')) return undefined;
    try {
      return firstFailedOperationOutcomeDiagnostic(JSON.parse(candidate));
    } catch {
      return undefined;
    }
  }
  if (!value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    for (const child of value) {
      const diagnostic = firstFailedOperationOutcomeDiagnostic(child);
      if (diagnostic) return diagnostic;
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (record.resourceType === 'OperationOutcome' && Array.isArray(record.issue)) {
    for (const rawIssue of record.issue) {
      if (!rawIssue || typeof rawIssue !== 'object') continue;
      const issue = rawIssue as Record<string, unknown>;
      const severity = String(issue.severity || '').trim().toLowerCase();
      if (severity !== 'error' && severity !== 'fatal') continue;
      const diagnostic = String(issue.diagnostics || '').trim();
      if (diagnostic) return diagnostic;
    }
  }
  for (const child of Object.values(record)) {
    const diagnostic = firstFailedOperationOutcomeDiagnostic(child);
    if (diagnostic) return diagnostic;
  }
  return undefined;
}

// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import { resolvePollOptionsFromSeconds } from './poll-options.js';
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
  const exchangePayload = {
    thid: `exchange-${createRuntimeUuid()}`,
    subject_token: deps.input.activationCode,
  };

  const exchange = await deps.submitAndPollWithBearerToken(
    deps.input.idToken,
    deps.identityTokenExchangePath(deps.routeCtx),
    deps.identityTokenExchangePollPath(deps.routeCtx),
    exchangePayload,
    deps.input.pollOptions,
  );

  const pollBody = (exchange.poll.body as Record<string, unknown>) || {};
  const exchangeBody = ((pollBody.body as Record<string, unknown> | undefined) || pollBody);
  const initialAccessToken = String(
    exchangeBody.initial_access_token || exchangeBody.access_token || '',
  ).trim();
  if (!initialAccessToken) {
    throw new Error('activateEmployeeDeviceWithActivationCode: missing initial_access_token in exchange response.');
  }

  const dcrPayload = {
    thid: `dcr-${createRuntimeUuid()}`,
    code: deps.input.activationCode,
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

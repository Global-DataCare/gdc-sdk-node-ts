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
  /** Canonical high-level description converted to OpenID DCR metadata by the SDK. */
  deviceRegistration?: ProfileDeviceRegistrationInput;
  /**
   * @deprecated Low-level OpenID escape hatch. Use
   * `createProfileDeviceActivationRequest(...).set...build()` instead.
   */
  dcrPayload?: Record<string, unknown>;
  timeoutSeconds?: number;
  intervalSeconds?: number;
};

/** Application concepts required to bind one portal/app installation. */
export type ProfileDeviceRegistrationInput = Readonly<{
  clientInstanceId: string;
  clientName: string;
  applicationType: 'native' | 'web';
  redirectUris: readonly string[];
  publicJwks: readonly Record<string, unknown>[];
  deviceName?: string;
  actorDid?: string;
  profileDid?: string;
}>;

/** Advanced typed editor used by SDK runtimes that already own profile keys. */
export interface ProfileDeviceActivationDraft {
  setClientInstanceId(value: string): ProfileDeviceActivationDraft;
  setClientName(value: string): ProfileDeviceActivationDraft;
  setApplicationType(value: 'native' | 'web'): ProfileDeviceActivationDraft;
  setRedirectUris(values: readonly string[]): ProfileDeviceActivationDraft;
  setPublicJwks(values: readonly Record<string, unknown>[]): ProfileDeviceActivationDraft;
  setDeviceName(value: string): ProfileDeviceActivationDraft;
  setActorDid(value: string): ProfileDeviceActivationDraft;
  setProfileDid(value: string): ProfileDeviceActivationDraft;
  setTimeoutSeconds(value: number): ProfileDeviceActivationDraft;
  setIntervalSeconds(value: number): ProfileDeviceActivationDraft;
  build(): EmployeeDeviceActivationRequestInput & { deviceRegistration: ProfileDeviceRegistrationInput };
}

/**
 * Starts an advanced profile-device activation request.
 *
 * Product portals should normally use `ServerProfileSessionManager.enroll`,
 * which provisions the wallet and calls this editor internally. This surface
 * exists for runtimes that already own and select the profile public keys.
 */
export function createProfileDeviceActivationRequest(input: Readonly<{
  activationCode: string;
  idToken: string;
  tenantId?: string;
  jurisdiction?: string;
  sector?: string;
}>): ProfileDeviceActivationDraft {
  const activationCode = requiredText(input.activationCode, 'activation code');
  const idToken = requiredText(input.idToken, 'signed identity token');
  let clientInstanceId = '';
  let clientName = '';
  let applicationType: 'native' | 'web' | undefined;
  let redirectUris: string[] = [];
  let publicJwks: Record<string, unknown>[] = [];
  let deviceName = '';
  let actorDid = '';
  let profileDid = '';
  let timeoutSeconds: number | undefined;
  let intervalSeconds: number | undefined;

  const draft: ProfileDeviceActivationDraft = {
    setClientInstanceId(value) { clientInstanceId = normalizedText(value); return draft; },
    setClientName(value) { clientName = normalizedText(value); return draft; },
    setApplicationType(value) { applicationType = value; return draft; },
    setRedirectUris(values) { redirectUris = uniqueText(values); return draft; },
    setPublicJwks(values) { publicJwks = values.map((value) => ({ ...value })); return draft; },
    setDeviceName(value) { deviceName = normalizedText(value); return draft; },
    setActorDid(value) { actorDid = normalizedText(value); return draft; },
    setProfileDid(value) { profileDid = normalizedText(value); return draft; },
    setTimeoutSeconds(value) { timeoutSeconds = positiveNumber(value, 'timeout seconds'); return draft; },
    setIntervalSeconds(value) { intervalSeconds = positiveNumber(value, 'interval seconds'); return draft; },
    build() {
      const registration: ProfileDeviceRegistrationInput = {
        clientInstanceId: requiredText(clientInstanceId, 'client instance id'),
        clientName: requiredText(clientName, 'client name'),
        applicationType: applicationType || failRequired<'native' | 'web'>('application type'),
        redirectUris: requiredList(redirectUris, 'redirect URI'),
        publicJwks: requiredList(publicJwks, 'public JWK'),
        ...(deviceName ? { deviceName } : {}),
        ...(actorDid ? { actorDid } : {}),
        ...(profileDid ? { profileDid } : {}),
      };
      return {
        ...input,
        activationCode,
        idToken,
        deviceRegistration: registration,
        ...(timeoutSeconds !== undefined ? { timeoutSeconds } : {}),
        ...(intervalSeconds !== undefined ? { intervalSeconds } : {}),
      };
    },
  };
  return draft;
}

export type EmployeeDeviceActivationResult = {
  initialAccessToken: string;
  exchange: SubmitAndPollResult;
  dcr: SubmitAndPollResult;
};

export type EmployeeDeviceOtpRecoveryInput = Readonly<{
  idToken: string;
  clientInstanceId: string;
  pollOptions?: PollOptions;
}>;

export type EmployeeDeviceOtpRecoveryResult = Readonly<{
  activationCode: string;
  licenseId: string;
  employeeRole: string;
  employeeActorIdentifier: string;
  recovery: SubmitAndPollResult;
}>;

/** Requests a fresh replacement credential for one OTP-authenticated installation. */
export async function recoverEmployeeDeviceWithOtpWithDeps(deps: Readonly<{
  routeCtx: RouteContext;
  input: EmployeeDeviceOtpRecoveryInput;
  identityEmployeeRecoveryPath: (ctx: RouteContext) => string;
  identityEmployeeRecoveryPollPath: (ctx: RouteContext) => string;
  submitAndPollWithBearerToken: (
    bearerToken: string | undefined,
    submitPath: string,
    pollPath: string,
    payload: { thid?: string } & Record<string, unknown>,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
}>): Promise<EmployeeDeviceOtpRecoveryResult> {
  const idToken = requiredText(deps.input.idToken, 'fresh OTP identity token');
  const clientInstanceId = requiredText(deps.input.clientInstanceId, 'client instance id');
  const recovery = await deps.submitAndPollWithBearerToken(
    idToken,
    deps.identityEmployeeRecoveryPath(deps.routeCtx),
    deps.identityEmployeeRecoveryPollPath(deps.routeCtx),
    { thid: `employee-recovery-${createRuntimeUuid()}`, client_instance_id: clientInstanceId },
    deps.input.pollOptions,
  );
  const failedStatus = [recovery.submit.status, recovery.poll.status]
    .find(status => status < 200 || status >= 300);
  if (failedStatus !== undefined) {
    throw new Error(`recoverEmployeeDeviceWithOtp: recovery failed (HTTP ${failedStatus}).`);
  }
  const terminal = responseBody(recovery.poll.body);
  const activationCode = findResponseText(terminal, 'activation_code');
  const licenseId = findResponseText(terminal, 'license_id');
  const employeeRole = findResponseText(terminal, 'employee_role');
  const employeeActorIdentifier = findResponseText(terminal, 'employee_same_as');
  if (!activationCode || !licenseId || !employeeRole || !employeeActorIdentifier) {
    throw new Error('recoverEmployeeDeviceWithOtp: incomplete recovery response.');
  }
  return { activationCode, licenseId, employeeRole, employeeActorIdentifier, recovery };
}

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
    dcrPayload: resolveDcrPayload(deps.input),
    pollOptions,
  });
}

function resolveDcrPayload(input: EmployeeDeviceActivationRequestInput): Record<string, unknown> {
  if (input.deviceRegistration && input.dcrPayload) {
    throw new Error('Device activation accepts either deviceRegistration or the deprecated dcrPayload, not both.');
  }
  if (input.deviceRegistration) {
    const registration = input.deviceRegistration;
    return {
      [IdentityDcrMetadataFields.ApplicationType]: registration.applicationType,
      [IdentityDcrMetadataFields.ClientName]: registration.clientName,
      [IdentityDcrMetadataFields.RedirectUris]: [...registration.redirectUris],
      [IdentityDcrMetadataFields.Jwks]: { keys: registration.publicJwks.map((value) => ({ ...value })) },
      [IdentityDcrMetadataFields.ExtendedDeviceInfo]: {
        [IdentityDeviceInfoFields.DeviceId]: registration.clientInstanceId,
        device_name: registration.deviceName || registration.clientName,
      },
      ...(registration.actorDid ? { [IdentityDcrMetadataFields.ActorDid]: registration.actorDid } : {}),
      ...(registration.profileDid ? { [IdentityDcrMetadataFields.ProfileDid]: registration.profileDid } : {}),
    };
  }
  if (input.dcrPayload) return { ...input.dcrPayload };
  throw new Error('Device activation requires a device registration built by createProfileDeviceActivationRequest.');
}

function responseBody(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      return responseBody(JSON.parse(value));
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return record.body && typeof record.body === 'object' && !Array.isArray(record.body)
    ? record.body as Record<string, unknown>
    : record;
}

function findResponseText(value: unknown, key: string): string {
  if (!value || typeof value !== 'object') return '';
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findResponseText(child, key);
      if (found) return found;
    }
    return '';
  }
  const record = value as Record<string, unknown>;
  const direct = normalizedText(record[key]);
  if (direct) return direct;
  for (const child of Object.values(record)) {
    const found = findResponseText(child, key);
    if (found) return found;
  }
  return '';
}

function normalizedText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function requiredText(value: unknown, label: string): string {
  const normalized = normalizedText(value);
  if (!normalized) throw new Error(`Profile device activation requires ${label}.`);
  return normalized;
}

function uniqueText(values: readonly string[]): string[] {
  return [...new Set((values || []).map((value) => normalizedText(value)).filter(Boolean))];
}

function requiredList<T>(values: readonly T[], label: string): T[] {
  if (!values.length) throw new Error(`Profile device activation requires at least one ${label}.`);
  return [...values];
}

function positiveNumber(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Profile device activation ${label} must be positive.`);
  return value;
}

function failRequired<T>(label: string): T {
  throw new Error(`Profile device activation requires ${label}.`);
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

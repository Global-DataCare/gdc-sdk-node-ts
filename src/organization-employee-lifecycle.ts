// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import { createHash } from 'node:crypto';
import {
  ActorKinds,
  EmployeeActivationGrantVersions,
  projectOrganizationEmployeeLifecycle,
  readEmployeeActivationCode,
  type EmployeeActivationGrant,
  type OrganizationEmployeeLifecycleRecord,
} from 'gdc-common-utils-ts';
import { buildStableActorIdentifier } from 'gdc-common-utils-ts/utils/actor-identifier';
import { ClaimsOfferSchemaorg } from 'gdc-common-utils-ts/constants/schemaorg';
import type { RouteContext } from './individual-onboarding.js';
import type { SubmitAndPollResult } from './orchestration/client-port.js';
import type { OrganizationLicenseOrderConfirmInput } from './organization-license-order.js';
import type { ServerProfileEnrollmentInput, ServerProfileRecord } from './server-profile-session.js';
import type {
  LicenseListRuntimeSearchInput,
  OrganizationEmployeeCreationInput,
  OrganizationEmployeeLicenseInvitationInput,
  OrganizationEmployeeSearchInput,
} from './resource-operations.js';

/**
 * Input for atomic interactive provisioning. Every current employee create is
 * seat-required. Supplying `licenseOrder` authorizes the SDK to close a
 * GW-issued Offer before retrying creation and issuing the activation
 * credential. A future batch import requires a separate explicit operation.
 */
export type OrganizationEmployeeProvisioningInput = Readonly<{
  creation: OrganizationEmployeeCreationInput;
  invitation: OrganizationEmployeeLicenseInvitationInput;
  licenseOrder?: Omit<OrganizationLicenseOrderConfirmInput, 'offerId'>;
}>;

/** Results required by a portal to persist routing and display the credential once. */
export type OrganizationEmployeeProvisioningResult = Readonly<{
  employee: SubmitAndPollResult;
  license: SubmitAndPollResult;
  licenseOrder?: SubmitAndPollResult;
  activationCode: string;
  /** Effective installation allowance returned by the reserved GW seat. */
  maxDevices?: number;
}>;

/** Shared dependencies for the create plus seat issuance workflow. */
export type OrganizationEmployeeProvisioningDeps = Readonly<{
  createEmployee(
    routeContext: RouteContext,
    input: OrganizationEmployeeCreationInput,
  ): Promise<SubmitAndPollResult>;
  issueLicense(
    routeContext: RouteContext,
    input: OrganizationEmployeeLicenseInvitationInput,
  ): Promise<SubmitAndPollResult>;
  confirmLicenseOrder?(
    routeContext: RouteContext,
    input: OrganizationLicenseOrderConfirmInput,
  ): Promise<SubmitAndPollResult>;
}>;

/**
 * Creates the employee, closing Offer/Order first when the strict request has
 * no available seat, then reserves that seat through `License/_issue` and
 * returns the exact GW activation credential.
 */
export async function provisionOrganizationEmployeeWithDeps(
  routeContext: RouteContext,
  input: OrganizationEmployeeProvisioningInput,
  deps: OrganizationEmployeeProvisioningDeps,
): Promise<OrganizationEmployeeProvisioningResult> {
  const creation = input.creation;
  let employee = await deps.createEmployee(routeContext, creation);
  assertSuccessfulEmployeeOperation('employee creation', employee);
  let licenseOrder: SubmitAndPollResult | undefined;
  const offerId = readEmployeeLicenseOfferId(employee.poll.body);
  if (offerId) {
    if (!input.licenseOrder || !deps.confirmLicenseOrder) {
      throw new Error('provisionOrganizationEmployee: employee creation requires Offer/Order confirmation before licence issue.');
    }
    licenseOrder = await deps.confirmLicenseOrder(routeContext, {
      ...input.licenseOrder,
      offerId,
    });
    assertSuccessfulEmployeeOperation('licence order confirmation', licenseOrder);
    employee = await deps.createEmployee(routeContext, creation);
    assertSuccessfulEmployeeOperation('employee creation retry', employee);
    if (readEmployeeLicenseOfferId(employee.poll.body)) {
      throw new Error('provisionOrganizationEmployee: employee creation still requires a licence after Order confirmation.');
    }
  }
  const license = await deps.issueLicense(routeContext, input.invitation);
  assertSuccessfulEmployeeOperation('licence issue', license);
  const activationCode = readEmployeeActivationCode(license.poll.body);
  if (!activationCode) {
    throw new Error('provisionOrganizationEmployee: GW response did not contain an employee activation credential.');
  }
  const maxDevices = readEmployeeLicenseMaxDevices(license.poll.body);
  return {
    employee,
    license,
    licenseOrder,
    activationCode,
    ...(maxDevices ? { maxDevices } : {}),
  };
}

/** Reads the effective positive installation allowance returned by `License/_issue`. */
export function readEmployeeLicenseMaxDevices(value: unknown): number | undefined {
  for (const candidate of nestedRecords(value)) {
    const configured = Number(record(candidate.meta)?.maxDevices ?? candidate.maxDevices);
    if (Number.isInteger(configured) && configured > 0) return configured;
  }
  return undefined;
}

/**
 * Reads the pending seat Offer from an employee-create response.
 *
 * Portal BFFs use this boundary when payment is asynchronous: persist the
 * server-owned creation intent, redirect to hosted Checkout, then submit the
 * paid reference in Order before retrying employee creation and License/_issue.
 */
export function readEmployeeLicenseOfferId(value: unknown): string | undefined {
  for (const candidate of nestedRecords(value)) {
    if (candidate.type !== 'Employee-license-offer-v1.0') continue;
    const meta = record(candidate.meta);
    const claims = record(meta?.claims);
    const offerId = String(claims?.[ClaimsOfferSchemaorg.identifier] || '').trim();
    if (offerId) return offerId;
  }
  return undefined;
}

type EmployeeOperationFailure = Readonly<{
  status?: number;
  diagnostics?: string;
}>;

/**
 * Rejects failed outer HTTP responses and failed entries hidden inside a
 * successful async poll envelope before a caller starts the next mutation.
 */
export function assertSuccessfulEmployeeOperation(
  operation: string,
  result: SubmitAndPollResult,
): void {
  const failure = responseFailure(result.submit.status, result.submit.body)
    || responseFailure(result.poll.status, result.poll.body)
    || nestedEmployeeOperationFailure(result.poll.body);
  if (!failure) return;
  const status = failure.status ? ` (HTTP ${failure.status})` : '';
  const diagnostics = failure.diagnostics ? `: ${failure.diagnostics}` : '';
  throw new Error(`provisionOrganizationEmployee: ${operation} failed${status}${diagnostics}.`);
}

function responseFailure(status: number, body: unknown): EmployeeOperationFailure | undefined {
  return status >= 200 && status < 300
    ? undefined
    : { status, diagnostics: firstOperationOutcomeDiagnostics(body) };
}

function nestedEmployeeOperationFailure(value: unknown): EmployeeOperationFailure | undefined {
  for (const candidate of nestedRecords(value)) {
    const response = record(candidate.response);
    const status = parseHttpStatus(response?.status);
    const outcome = record(response?.outcome);
    if (status !== undefined && (status < 200 || status >= 300)) {
      return { status, diagnostics: firstOperationOutcomeDiagnostics(outcome || candidate) };
    }
    if (candidate.resourceType === 'OperationOutcome') {
      const issue = firstFailedIssue(candidate.issue);
      if (issue) return { status, diagnostics: issue };
    }
  }
  return undefined;
}

function firstOperationOutcomeDiagnostics(value: unknown): string | undefined {
  for (const candidate of nestedRecords(value)) {
    if (candidate.resourceType !== 'OperationOutcome') continue;
    const diagnostics = firstFailedIssue(candidate.issue);
    if (diagnostics) return diagnostics;
  }
  return undefined;
}

function firstFailedIssue(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const issue of value) {
    const candidate = record(issue);
    const severity = String(candidate?.severity || '').trim().toLowerCase();
    if (severity !== 'error' && severity !== 'fatal') continue;
    const diagnostics = String(candidate?.diagnostics || '').trim();
    if (diagnostics) return diagnostics;
  }
  return undefined;
}

function parseHttpStatus(value: unknown): number | undefined {
  const match = String(value || '').match(/^\s*(\d{3})/);
  return match ? Number(match[1]) : undefined;
}

function nestedRecords(root: unknown): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  const pending: unknown[] = [root];
  const visited = new Set<object>();
  while (pending.length > 0) {
    const value = pending.shift();
    if (!value || typeof value !== 'object' || visited.has(value)) continue;
    visited.add(value);
    if (Array.isArray(value)) {
      pending.push(...value);
      continue;
    }
    const candidate = value as Record<string, unknown>;
    records.push(candidate);
    pending.push(...Object.values(candidate));
  }
  return records;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/** Shared dependencies for combining employee and license directory searches. */
export type OrganizationEmployeeLifecycleQueryDeps = Readonly<{
  searchEmployees(routeContext: RouteContext, input: OrganizationEmployeeSearchInput): Promise<SubmitAndPollResult>;
  listLicenses(routeContext: RouteContext, input?: LicenseListRuntimeSearchInput): Promise<SubmitAndPollResult>;
}>;

/** Lists employees and their installation allowance through one typed projection. */
export async function listOrganizationEmployeeLifecycleWithDeps(
  routeContext: RouteContext,
  deps: OrganizationEmployeeLifecycleQueryDeps,
): Promise<OrganizationEmployeeLifecycleRecord[]> {
  const [employees, licenses] = await Promise.all([
    deps.searchEmployees(routeContext, {}),
    deps.listLicenses(routeContext),
  ]);
  return projectOrganizationEmployeeLifecycle({
    employeeResponse: employees.poll.body,
    licenseResponse: licenses.poll.body,
  });
}

/** Input used to persist routing metadata for one issued employee credential. */
export type EmployeeActivationGrantInput = Readonly<{
  email: string;
  employeeDid: string;
  employeeRoleCode: string;
  providerDid: string;
  routeContext: RouteContext;
  createdAt: Date;
  expiresAt: Date;
}>;

/** Builds the product-neutral routing grant stored under a credential digest. */
export function createEmployeeActivationGrant(input: EmployeeActivationGrantInput): EmployeeActivationGrant {
  return {
    version: EmployeeActivationGrantVersions.V1,
    employeeDid: input.employeeDid,
    employeeRoleCode: input.employeeRoleCode,
    employeeActorIdentifier: buildStableActorIdentifier({ contactKind: 'email', contact: input.email }),
    providerDid: input.providerDid,
    routeContext: input.routeContext,
    createdAt: input.createdAt.toISOString(),
    expiresAt: input.expiresAt.toISOString(),
  };
}

/** Verifies that a stored routing grant belongs to the authenticated email. */
export function employeeActivationGrantMatchesEmail(grant: EmployeeActivationGrant, email: string): boolean {
  return grant.employeeActorIdentifier === buildStableActorIdentifier({ contactKind: 'email', contact: email });
}

/** Stable profile id derived from account, employee and provider identities. */
export function buildOrganizationEmployeeProfileId(input: Readonly<{
  ownerId: string;
  employeeDid: string;
  providerDid: string;
  clientInstanceId: string;
}>): string {
  const digest = createHash('sha256')
    .update([input.ownerId, input.employeeDid, input.providerDid, input.clientInstanceId].join('\u0000'))
    .digest('base64url');
  return `organization-employee:${digest}`;
}

/** Enrolls a previously invited employee without organization discovery. */
export async function enrollInvitedOrganizationEmployeeWithDeps(input: Readonly<{
  ownerId: string;
  idToken: string;
  activationCode: string;
  pin: string;
  grant: EmployeeActivationGrant;
  dcrRedirectUris: string[];
  dcrClientName: string;
  clientInstanceId: string;
}>, deps: Readonly<{
  enroll(enrollment: ServerProfileEnrollmentInput): Promise<ServerProfileRecord>;
}>): Promise<ServerProfileRecord> {
  const profileId = buildOrganizationEmployeeProfileId({
    ownerId: input.ownerId,
    employeeDid: input.grant.employeeDid,
    providerDid: input.grant.providerDid,
    clientInstanceId: input.clientInstanceId,
  });
  return deps.enroll({
    ownerId: input.ownerId,
    profileId,
    actorKind: ActorKinds.OrganizationEmployee,
    actorMode: 'member',
    actorDid: input.grant.employeeDid,
    profileDid: input.grant.employeeDid,
    providerDid: input.grant.providerDid,
    routeContext: input.grant.routeContext,
    allowedSubjectDids: [input.grant.employeeDid],
    pin: input.pin,
    idToken: input.idToken,
    activationCode: input.activationCode,
    clientInstanceId: input.clientInstanceId,
    dcrRedirectUris: input.dcrRedirectUris,
    dcrClientName: input.dcrClientName,
    vpToken: input.idToken,
  });
}

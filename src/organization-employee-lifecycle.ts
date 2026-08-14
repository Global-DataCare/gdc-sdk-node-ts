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
import type { RouteContext } from './individual-onboarding.js';
import type { SubmitAndPollResult } from './orchestration/client-port.js';
import type { ServerProfileEnrollmentInput, ServerProfileRecord } from './server-profile-session.js';
import type {
  LicenseListRuntimeSearchInput,
  OrganizationEmployeeCreationInput,
  OrganizationEmployeeLicenseInvitationInput,
  OrganizationEmployeeSearchInput,
} from './resource-operations.js';

/** Input for the atomic controller-facing create plus seat issuance workflow. */
export type OrganizationEmployeeProvisioningInput = Readonly<{
  creation: OrganizationEmployeeCreationInput;
  invitation: OrganizationEmployeeLicenseInvitationInput;
}>;

/** Results required by a portal to persist routing and display the credential once. */
export type OrganizationEmployeeProvisioningResult = Readonly<{
  employee: SubmitAndPollResult;
  license: SubmitAndPollResult;
  activationCode: string;
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
}>;

/** Creates the employee, reserves its seat and returns the exact GW credential. */
export async function provisionOrganizationEmployeeWithDeps(
  routeContext: RouteContext,
  input: OrganizationEmployeeProvisioningInput,
  deps: OrganizationEmployeeProvisioningDeps,
): Promise<OrganizationEmployeeProvisioningResult> {
  const employee = await deps.createEmployee(routeContext, input.creation);
  const license = await deps.issueLicense(routeContext, input.invitation);
  const activationCode = readEmployeeActivationCode(license.poll.body);
  if (!activationCode) {
    throw new Error('provisionOrganizationEmployee: GW response did not contain an employee activation credential.');
  }
  return { employee, license, activationCode };
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

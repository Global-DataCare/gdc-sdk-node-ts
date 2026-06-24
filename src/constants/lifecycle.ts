// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.
import { LifecycleRequestType } from 'gdc-common-utils-ts';

/**
 * GW CORE lifecycle route/action tokens used by the Node runtime SDK.
 *
 * These constants intentionally model the currently deployed GW CORE contract.
 * Do not rewrite them to the target normalized `PATCH` contract until the
 * backend migration described in `gwtemplate-node-ts/docs/90.L-LIFECYCLE_CURRENT_VS_TARGET.md`
 * is actually deployed.
 */
export const GwCoreLifecycleAction = Object.freeze({
  Batch: '_batch',
  BatchResponse: '_batch-response',
  Issue: '_issue',
  IssueResponse: '_issue-response',
  Transaction: '_transaction',
  TransactionResponse: '_transaction-response',
  Disable: '_disable',
  Purge: '_purge',
} as const);

/**
 * Entry request methods currently used by GW CORE lifecycle handlers.
 */
export const GwCoreLifecycleRequestMethod = Object.freeze({
  Post: 'POST',
  Delete: 'DELETE',
} as const);

/**
 * Stable request type ids for the currently deployed GW CORE lifecycle flows.
 */
export const GwCoreLifecycleRequestType = Object.freeze({
  EmployeeCreate: 'Employee-create-request-v1.0',
  EmployeeDisable: 'Employee-disable-request-v1.0',
  EmployeePurge: 'Employee-purge-request-v1.0',
  IndividualOrganizationRegistration: 'SubjectOrg-registration-form-v1.0',
  IndividualOrganizationDisable: 'Family-disable-request-v1.0',
  IndividualOrganizationPurge: 'Family-purge-request-v1.0',
  IndividualMemberPurge: LifecycleRequestType.RelatedPersonPurge,
} as const);

/**
 * Named TODO ids kept close to the current lifecycle implementation so the
 * target-contract migration is easy to track later.
 */
export const GwCoreLifecycleTodo = Object.freeze({
  EmployeeDisablePatchMigration: 'TODO(gw-core-lifecycle-target-patch-employee-disable)',
  IndividualDisablePatchMigration: 'TODO(gw-core-lifecycle-target-patch-individual-disable)',
} as const);

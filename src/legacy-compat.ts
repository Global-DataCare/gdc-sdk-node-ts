// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

// Temporary compatibility layer for downstream packages not yet migrated.
export {
  activateEmployeeDeviceWithActivationRequestWithDeps as activateEmployeeDeviceWithActivationCodeSimpleWithDeps,
} from './device-activation.js';
export {
  confirmLegalOrganizationOrderWithDeps as confirmLegalOrganizationOrderSimpleWithDeps,
} from './host-onboarding.js';
export {
  confirmIndividualOrganizationOrderWithDeps as confirmIndividualOrganizationOrderSimpleWithDeps,
} from './individual-onboarding.js';
export {
  requestSmartTokenWithDeps as requestSmartTokenSimpleWithDeps,
} from './smart-token.js';
export {
  startIndividualOrganizationWithDeps as startIndividualOrganizationSimpleWithDeps,
} from './individual-start.js';

export { grantProfessionalAccessWithDeps as grantProfessionalAccessSimpleWithDeps } from './resource-operations.js';
export { resolvePollOptionsFromSeconds as resolveSimplePollOptions } from './poll-options.js';

export type {
  EmployeeDeviceActivationRequestInput as EmployeeDeviceActivationSimpleInput,
} from './device-activation.js';

export type {
  LegalOrganizationOrderInput as LegalOrganizationOrderSimpleInput,
} from './host-onboarding.js';

export type {
  IndividualOrganizationConfirmOrderInput as IndividualOrganizationConfirmOrderSimpleInput,
} from './individual-onboarding.js';

export type {
  IndividualOrganizationBootstrapInput as IndividualOrganizationBootstrapSimpleInput,
  IndividualOrganizationStartResult as IndividualOrganizationStartSimpleResult,
} from './individual-start.js';

export type {
  SmartTokenRequestInput as SmartTokenRequestSimpleInput,
} from './smart-token.js';

export type {
  GrantProfessionalAccessInput as GrantProfessionalAccessSimpleInput,
  GrantProfessionalAccessResult as GrantProfessionalAccessSimpleResult,
} from './resource-operations.js';

export {
  HostOnboardingSdk as GdcHostOnboardingSdk,
} from './orchestration/host-onboarding-sdk.js';
export {
  OrganizationControllerSdk as GdcOrganizationControllerSdk,
} from './orchestration/organization-controller-sdk.js';
export {
  OrganizationEmployeeSdk as GdcOrganizationEmployeeSdk,
} from './orchestration/organization-employee-sdk.js';
export {
  IndividualControllerSdk as GdcIndividualControllerSdk,
} from './orchestration/individual-controller-sdk.js';
export {
  IndividualMemberSdk as GdcIndividualMemberSdk,
} from './orchestration/individual-member-sdk.js';
export {
  PersonalSdk as GdcPersonalSdk,
} from './orchestration/personal-sdk.js';
export {
  ProfessionalSdk as GdcProfessionalSdk,
} from './orchestration/professional-sdk.js';
export { NodeActorSession as GdcNodeActorSession } from './session.js';
export { NodeHttpClient as GdcNodeHttpClient } from './node-runtime-client.js';

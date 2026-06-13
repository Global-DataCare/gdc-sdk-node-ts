// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.
// Always create JSDoc, do not use strings inline in keys nor values, use types instead, and reuse the data test examples.
import type { ControllerBindingInput } from 'gdc-common-utils-ts/models';
import type {
  LicenseListRuntimeSearchInput,
  LicenseOfferRuntimeSearchInput,
  LicenseOrderRuntimeSearchInput,
} from '../resource-operations.js';
import type {
  AsyncPollRequest,
  OrganizationActivationServiceOptions,
  PollOptions,
  PollResult,
  SubmitAndPollResult,
  SubmitPayload,
  SubmitResponse,
} from 'gdc-sdk-core-ts';
export type {
  AsyncPollRequest,
  PollOptions,
  PollResult,
  SubmitAndPollResult,
  SubmitPayload,
  SubmitResponse,
} from 'gdc-sdk-core-ts';
import type { EmployeeDeviceActivationResult, EmployeeDeviceActivationRequestInput } from '../device-activation.js';
import type { HostRouteContext, LegalOrganizationOrderInput } from '../host-onboarding.js';
import type { IndividualOrganizationConfirmOrderInput, RouteContext } from '../individual-onboarding.js';
import type { IndividualOrganizationBootstrapInput, IndividualOrganizationStartResult } from '../individual-start.js';
import type { OrganizationLicenseOrderConfirmInput } from '../organization-license-order.js';
import type { SmartTokenExchangeResult, SmartTokenRequestInput } from '../smart-token.js';
import type {
  CommunicationIngestionInput,
  ClinicalBundleSearchInput,
  DigitalTwinGenerationInput,
  GrantProfessionalAccessInput,
  GrantProfessionalAccessResult,
  IndividualMemberLifecycleInput,
  IndividualOrganizationLifecycleInput,
  IpsOrFhirImportInput,
  OrganizationEmployeeCreationInput,
  OrganizationEmployeeLifecycleInput,
  OrganizationEmployeeSearchInput,
  RelatedPersonUpsertInput,
} from '../resource-operations.js';

/**
 * Shared node-runtime activation input.
 *
 * Keep this centralized in the node runtime until every consumer compiles
 * against a published `gdc-sdk-core-ts` version that exports the same alias.
 */
export type NodeOrganizationActivationInput = {
  vpToken: string;
  controller?: ControllerBindingInput;
  service?: OrganizationActivationServiceOptions;
  additionalClaims?: Record<string, unknown>;
};

/**
 * Runtime-neutral actor/application client contract as exposed by the Node SDK.
 *
 * New code should prefer `RuntimeClient`.
 * `NodeRuntimeClient` is kept as a compatibility alias while package surfaces
 * converge across runtimes.
 */
export type RuntimeClient = {
  activateOrganizationInGatewayFromIcaProof?: (
    hostCtx: HostRouteContext,
    input: NodeOrganizationActivationInput,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
  confirmLegalOrganizationOrder?: (
    hostCtx: HostRouteContext,
    input: LegalOrganizationOrderInput,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
  createOrganizationEmployee?: (
    ctx: RouteContext,
    input: OrganizationEmployeeCreationInput,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
  searchOrganizationEmployees?: (
    ctx: RouteContext,
    input: OrganizationEmployeeSearchInput,
  ) => Promise<SubmitAndPollResult>;
  searchOrganizationLicenses?: (
    ctx: RouteContext,
    input: LicenseListRuntimeSearchInput,
  ) => Promise<SubmitAndPollResult>;
  listOrganizationLicenses?: (
    ctx: RouteContext,
    input?: LicenseListRuntimeSearchInput,
  ) => Promise<SubmitAndPollResult>;
  searchOrganizationLicenseOffers?: (
    ctx: RouteContext,
    input: LicenseOfferRuntimeSearchInput,
  ) => Promise<SubmitAndPollResult>;
  listOrganizationLicenseOffers?: (
    ctx: RouteContext,
    input?: LicenseOfferRuntimeSearchInput,
  ) => Promise<SubmitAndPollResult>;
  searchOrganizationLicenseOrders?: (
    ctx: RouteContext,
    input: LicenseOrderRuntimeSearchInput,
  ) => Promise<SubmitAndPollResult>;
  listOrganizationLicenseOrders?: (
    ctx: RouteContext,
    input?: LicenseOrderRuntimeSearchInput,
  ) => Promise<SubmitAndPollResult>;
  confirmOrganizationLicenseOrder?: (
    ctx: RouteContext,
    input: OrganizationLicenseOrderConfirmInput,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
  disableEmployee?: (
    ctx: RouteContext,
    input: OrganizationEmployeeLifecycleInput,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
  purgeEmployee?: (
    ctx: RouteContext,
    input: OrganizationEmployeeLifecycleInput,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
  disableOrganizationEmployee?: (
    ctx: RouteContext,
    input: OrganizationEmployeeLifecycleInput,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
  purgeOrganizationEmployee?: (
    ctx: RouteContext,
    input: OrganizationEmployeeLifecycleInput,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
  activateEmployeeDeviceWithActivationRequest?: (
    input: EmployeeDeviceActivationRequestInput,
  ) => Promise<EmployeeDeviceActivationResult>;
  requestSmartToken?: (
    input: SmartTokenRequestInput,
  ) => Promise<SmartTokenExchangeResult>;
  startIndividualOrganization?: (
    input: IndividualOrganizationBootstrapInput,
  ) => Promise<IndividualOrganizationStartResult>;
  confirmIndividualOrganizationOrder?: (
    input: IndividualOrganizationConfirmOrderInput,
  ) => Promise<SubmitAndPollResult>;
  disableIndividual?: (
    ctx: RouteContext,
    input: IndividualOrganizationLifecycleInput,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
  purgeIndividual?: (
    ctx: RouteContext,
    input: IndividualOrganizationLifecycleInput,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
  disableIndividualMember?: (
    ctx: RouteContext,
    input: IndividualMemberLifecycleInput,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
  purgeIndividualMember?: (
    ctx: RouteContext,
    input: IndividualMemberLifecycleInput,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
  disableIndividualOrganization?: (
    ctx: RouteContext,
    input: IndividualOrganizationLifecycleInput,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
  purgeIndividualOrganization?: (
    ctx: RouteContext,
    input: IndividualOrganizationLifecycleInput,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
  ingestCommunicationAndUpdateIndex?: (
    ctx: RouteContext,
    input: CommunicationIngestionInput,
  ) => Promise<SubmitAndPollResult>;
  grantProfessionalAccess?: (
    ctx: RouteContext,
    input: GrantProfessionalAccessInput,
  ) => Promise<GrantProfessionalAccessResult>;
  searchIndividualLicenses?: (
    ctx: RouteContext,
    input: LicenseListRuntimeSearchInput,
  ) => Promise<SubmitAndPollResult>;
  listIndividualLicenses?: (
    ctx: RouteContext,
    input?: LicenseListRuntimeSearchInput,
  ) => Promise<SubmitAndPollResult>;
  searchIndividualLicenseOffers?: (
    ctx: RouteContext,
    input: LicenseOfferRuntimeSearchInput,
  ) => Promise<SubmitAndPollResult>;
  listIndividualLicenseOffers?: (
    ctx: RouteContext,
    input?: LicenseOfferRuntimeSearchInput,
  ) => Promise<SubmitAndPollResult>;
  searchIndividualLicenseOrders?: (
    ctx: RouteContext,
    input: LicenseOrderRuntimeSearchInput,
  ) => Promise<SubmitAndPollResult>;
  listIndividualLicenseOrders?: (
    ctx: RouteContext,
    input?: LicenseOrderRuntimeSearchInput,
  ) => Promise<SubmitAndPollResult>;
  bootstrapIndividualOrganization?: (
    input: IndividualOrganizationBootstrapInput,
  ) => Promise<IndividualOrganizationStartResult>;
  importIpsOrFhirAndUpdateIndex?: (
    ctx: RouteContext,
    input: IpsOrFhirImportInput,
  ) => Promise<SubmitAndPollResult>;
  upsertRelatedPersonAndPoll?: (
    ctx: RouteContext,
    input: RelatedPersonUpsertInput,
  ) => Promise<SubmitAndPollResult>;
  generateDigitalTwinFromSubjectData?: (
    ctx: RouteContext,
    input: DigitalTwinGenerationInput,
  ) => Promise<SubmitAndPollResult>;
  searchClinicalBundle?: (
    ctx: RouteContext,
    input: ClinicalBundleSearchInput,
  ) => Promise<SubmitAndPollResult>;
  getLatestIps?: (
    ctx: RouteContext,
    input: Omit<ClinicalBundleSearchInput, 'includedTypes'>,
  ) => Promise<SubmitAndPollResult>;
  submitBatch?: (
    submitPath: string,
    payload: SubmitPayload,
  ) => Promise<SubmitResponse>;
  pollUntilComplete?: (
    pollPath: string,
    request: AsyncPollRequest,
    pollOptions?: PollOptions,
  ) => Promise<PollResult>;
  submitAndPoll?: (
    submitPath: string,
    pollPath: string,
    payload: SubmitPayload,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
};

/**
 * @deprecated Prefer `RuntimeClient`.
 */
export type NodeRuntimeClient = RuntimeClient;


export function requireClientMethod<T extends keyof RuntimeClient>(
  client: RuntimeClient,
  method: T,
): NonNullable<RuntimeClient[T]> {
  const candidate = client[method];
  if (typeof candidate !== 'function') {
    throw new Error(`RuntimeClient does not implement '${String(method)}'.`);
  }
  return candidate.bind(client) as NonNullable<RuntimeClient[T]>;
}

export async function submitAndPollWithMethods(
  methods: Pick<RuntimeClient, 'submitBatch' | 'pollUntilComplete'>,
  submitPath: string,
  pollPath: string,
  payload: SubmitPayload,
  pollOptions?: PollOptions,
): Promise<SubmitAndPollResult> {
  const thid = requireSubmitPayloadThid(payload);
  const submit = await requireClientMethod(methods, 'submitBatch')(submitPath, payload);
  const poll = await requireClientMethod(methods, 'pollUntilComplete')(pollPath, { thid }, pollOptions);
  return { submit, poll };
}

export function canClientSubmitAndPoll(client: NodeRuntimeClient): boolean {
  return typeof client.submitAndPoll === 'function';
}

export async function submitAndPollWithClient(
  client: RuntimeClient,
  submitPath: string,
  pollPath: string,
  payload: SubmitPayload,
  pollOptions?: PollOptions,
): Promise<SubmitAndPollResult> {
  const thid = requireSubmitPayloadThid(payload);
  const normalizedPayload = { ...payload, thid };
  if (canClientSubmitAndPoll(client)) {
    return requireClientMethod(client, 'submitAndPoll')(submitPath, pollPath, normalizedPayload, pollOptions);
  }
  return submitAndPollWithMethods(client, submitPath, pollPath, normalizedPayload, pollOptions);
}

function requireSubmitPayloadThid(payload: SubmitPayload): string {
  const thid = String(payload.thid || '').trim();
  if (!thid) {
    throw new Error('submitAndPoll requires payload.thid.');
  }
  return thid;
}

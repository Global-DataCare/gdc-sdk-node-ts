// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.
/**
 * @fileoverview Shared runtime-client contracts for node orchestration.
 *
 * @architecture 101
 * This module is contract-only. Route/path details stay in concrete runtime clients.
 */
import type { ControllerBindingInput } from 'gdc-common-utils-ts/models/index';
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
  RelatedPersonUpsertInput,
  RelatedProfileSearchRuntimeInput,
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
  searchRelatedProfiles?: (
    ctx: RouteContext,
    input: RelatedProfileSearchRuntimeInput,
  ) => Promise<SubmitAndPollResult>;
  generateDigitalTwinFromSubjectData?: (
    ctx: RouteContext,
    input: DigitalTwinGenerationInput,
  ) => Promise<SubmitAndPollResult>;
  searchClinicalBundle?: (
    ctx: RouteContext,
    input: ClinicalBundleSearchInput,
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

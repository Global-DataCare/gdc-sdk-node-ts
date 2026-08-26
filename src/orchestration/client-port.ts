// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.
// Always create JSDoc, do not use strings inline in keys nor values, use types instead, and reuse the data test examples.
import type { ControllerBindingInput } from 'gdc-common-utils-ts/models';
import type { FamilyOrganizationSummary } from 'gdc-common-utils-ts/utils/family-organization-summary';
import type { LegalOrganizationVerificationTransactionInput } from 'gdc-common-utils-ts/utils/legal-organization-verification-transaction';
import type { IndividualOrganizationLifecycleInput, OrganizationDidBindingInput } from 'gdc-sdk-core-ts';
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
import type { EmployeeDeviceActivationResult, EmployeeDeviceActivationRequestInput, EmployeeDeviceRevocationInput } from '../device-activation.js';
import type {
  OrganizationEmployeeProvisioningInput,
  OrganizationEmployeeProvisioningResult,
} from '../organization-employee-lifecycle.js';
import type { OrganizationEmployeeLifecycleRecord } from 'gdc-common-utils-ts/models/organization-employee-lifecycle';
import type { HostRouteContext, HostedTenantLifecycleInput, LegalOrganizationOrderInput } from '../host-onboarding.js';
import type { IndividualOrganizationConfirmOrderInput, RouteContext } from '../individual-onboarding.js';
import type { IndividualOrganizationBootstrapInput, IndividualOrganizationStartResult } from '../individual-start.js';
import type { FamilyOrganizationSearchInput } from '../family-organization-search.js';
import type { FhirR5Subscription, FhirR5SubscriptionTopic } from 'gdc-common-utils-ts/models/fhir-r5-subscription';
import type { FhirR5SubscriptionBatchInput } from '../fhir-r5-subscription-runtime.js';
import type { EnsureFamilyOrganizationRegistrationInput, EnsureFamilyOrganizationRegistrationResult } from '../family-organization-registration.js';
import type { OrganizationLicenseOrderConfirmInput } from '../organization-license-order.js';
import type { SmartTokenExchangeResult, SmartTokenRequestInput } from '../smart-token.js';
import type { DigitalTwinMaterializationInput, DigitalTwinSearchInput, DigitalTwinSelectionInput } from '../digital-twin.js';
import type {
  CommunicationIngestionInput,
  BlockchainArtifactRegistrationInput,
  CommunicationParticipantRuntimeSearchInput,
  ClinicalBundleSearchInput,
  ClinicalSectionUpdateInput,
  ClinicalSummaryReadResult,
  ClinicalSummaryRequestInput,
  ClinicalSummaryUpdateInput,
  VitalSignBatchCommunicationFromSearchResponseInput,
  DigitalTwinGenerationInput,
  GrantProfessionalAccessInput,
  GrantProfessionalAccessResult,
  IndividualMemberLifecycleInput,
  IndividualMemberLicenseAddInput,
  IndividualMemberLicenseInvitationInput,
  IndividualMemberLicenseTransitionInput,
  IpsOrFhirImportInput,
  OrganizationEmployeeCreationInput,
  OrganizationEmployeeLicenseAddInput,
  OrganizationEmployeeLicenseOfferInput,
  OrganizationEmployeeLicenseInvitationInput,
  OrganizationEmployeeLifecycleInput,
  OrganizationEmployeeSearchInput,
  ProfessionalAccessRequestInput,
  ProfessionalAccessRequestResult,
  RevokeProfessionalAccessInput,
  RevokeProfessionalAccessResult,
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
 * Shared node-runtime input for the first host-side legal-organization
 * verification step.
 *
 * The business payload is owned by shared SDK/common packages:
 * - transport/runtime communication keys stay outside this contract
 * - controller business key binding remains in `controller.*`
 * - GW CORE host routing/polling stays in the runtime adapter
 */
export type NodeLegalOrganizationVerificationTransactionInput =
  LegalOrganizationVerificationTransactionInput;

/**
 * Shared node-runtime input for the organization DID binding operation.
 *
 * Binding contract:
 * - tenant identity is resolved from the route path
 * - `organization.url` carries one or more public aliases/domains
 * - `controller.sameAs` is optional corroborating identity evidence
 */
export type NodeOrganizationDidBindingInput = OrganizationDidBindingInput;

/**
 * Runtime-neutral actor/application client contract as exposed by the Node SDK.
 *
 * New code should prefer `RuntimeClient`.
 * `NodeRuntimeClient` is kept as a compatibility alias while package surfaces
 * converge across runtimes.
 */
export type RuntimeClient = {
  /** Registers a neutral FHIR R5 topic in GW CORE's tenant-owned catalog. */
  submitFhirR5SubscriptionTopicBatch?: (
    ctx: RouteContext,
    topic: FhirR5SubscriptionTopic,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
  /** Registers a tenant-wide or exact-subject FHIR R5 rest-hook Subscription. */
  submitFhirR5SubscriptionBatch?: (
    ctx: RouteContext,
    input: FhirR5SubscriptionBatchInput,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
  submitLegalOrganizationVerificationTransaction?: (
    hostCtx: HostRouteContext,
    input: NodeLegalOrganizationVerificationTransactionInput,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
  submitLegalOrganizationCredentialReissuance?: (
    hostCtx: HostRouteContext,
    input: NodeLegalOrganizationVerificationTransactionInput,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
  /** @deprecated Use `submitLegalOrganizationCredentialReissuance`. */
  submitLegalOrganizationIssue?: (
    hostCtx: HostRouteContext,
    input: NodeLegalOrganizationVerificationTransactionInput,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
  submitOrganizationDidBinding?: (
    ctx: RouteContext,
    input: NodeOrganizationDidBindingInput,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
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
  submitVitalSignBatchCommunicationFromSearchResponse?: (
    ctx: RouteContext,
    input: VitalSignBatchCommunicationFromSearchResponseInput,
  ) => Promise<SubmitAndPollResult>;
  disableHost?: (
    hostCtx: HostRouteContext,
    input: HostedTenantLifecycleInput,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
  purgeHost?: (
    hostCtx: HostRouteContext,
    input: HostedTenantLifecycleInput,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
  disableTenant?: (
    hostCtx: HostRouteContext,
    input: HostedTenantLifecycleInput,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
  purgeTenant?: (
    hostCtx: HostRouteContext,
    input: HostedTenantLifecycleInput,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
  getTenantLifecycleStatus?: (
    hostCtx: HostRouteContext,
    input: HostedTenantLifecycleInput,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
  disableTenantDescendants?: (
    hostCtx: HostRouteContext,
    input: HostedTenantLifecycleInput & { descendantKind: 'employees' | 'individuals' },
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
  purgeTenantDescendants?: (
    hostCtx: HostRouteContext,
    input: HostedTenantLifecycleInput & { descendantKind: 'employees' | 'individuals' },
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
  createOrganizationEmployee?: (
    ctx: RouteContext,
    input: OrganizationEmployeeCreationInput,
    pollOptions?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
  provisionOrganizationEmployee?: (
    ctx: RouteContext,
    input: OrganizationEmployeeProvisioningInput,
  ) => Promise<OrganizationEmployeeProvisioningResult>;
  issueOrganizationEmployeeLicense?: (
    ctx: RouteContext,
    input: OrganizationEmployeeLicenseInvitationInput,
  ) => Promise<SubmitAndPollResult>;
  searchOrganizationEmployees?: (
    ctx: RouteContext,
    input: OrganizationEmployeeSearchInput,
  ) => Promise<SubmitAndPollResult>;
  listOrganizationEmployeeLifecycle?: (
    ctx: RouteContext,
  ) => Promise<OrganizationEmployeeLifecycleRecord[]>;
  searchOrganizationLicenses?: (
    ctx: RouteContext,
    input: LicenseListRuntimeSearchInput,
  ) => Promise<SubmitAndPollResult>;
  listOrganizationLicenses?: (
    ctx: RouteContext,
    input?: LicenseListRuntimeSearchInput,
  ) => Promise<SubmitAndPollResult>;
  addFreeOrganizationEmployeeLicenses?: (
    ctx: RouteContext,
    input: OrganizationEmployeeLicenseAddInput,
  ) => Promise<SubmitAndPollResult>;
  requestOrganizationEmployeeLicenseOffer?: (
    ctx: RouteContext,
    input: OrganizationEmployeeLicenseOfferInput,
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
  revokeEmployeeDevice?: (
    ctx: RouteContext,
    input: EmployeeDeviceRevocationInput,
  ) => Promise<SubmitAndPollResult>;
  requestSmartToken?: (
    input: SmartTokenRequestInput,
  ) => Promise<SmartTokenExchangeResult>;
  startIndividualOrganization?: (
    input: IndividualOrganizationBootstrapInput,
  ) => Promise<IndividualOrganizationStartResult>;
  searchFamilyOrganization?: (
    ctx: RouteContext,
    input: FamilyOrganizationSearchInput,
  ) => Promise<FamilyOrganizationSummary | null>;
  ensureFamilyOrganizationRegistration?: (
    ctx: RouteContext,
    input: EnsureFamilyOrganizationRegistrationInput,
  ) => Promise<EnsureFamilyOrganizationRegistrationResult>;
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
  requestProfessionalAccess?: (
    ctx: RouteContext,
    input: ProfessionalAccessRequestInput,
  ) => Promise<ProfessionalAccessRequestResult>;
  updateClinicalSection?: (
    ctx: RouteContext,
    input: ClinicalSectionUpdateInput,
  ) => Promise<SubmitAndPollResult>;
  updateClinicalSummary?: (
    ctx: RouteContext,
    input: ClinicalSummaryUpdateInput,
  ) => Promise<SubmitAndPollResult>;
  requestClinicalSummary?: (
    ctx: RouteContext,
    input: ClinicalSummaryRequestInput,
  ) => Promise<ClinicalSummaryReadResult>;
  registerBlockchainArtifactAndUpdateIndex?: (
    ctx: RouteContext,
    input: BlockchainArtifactRegistrationInput,
  ) => Promise<SubmitAndPollResult>;
  searchCommunicationParticipants?: (
    ctx: RouteContext,
    input: CommunicationParticipantRuntimeSearchInput,
  ) => Promise<SubmitAndPollResult>;
  grantProfessionalAccess?: (
    ctx: RouteContext,
    input: GrantProfessionalAccessInput,
  ) => Promise<GrantProfessionalAccessResult>;
  revokeProfessionalAccess?: (
    ctx: RouteContext,
    input: RevokeProfessionalAccessInput,
  ) => Promise<RevokeProfessionalAccessResult>;
  searchIndividualLicenses?: (
    ctx: RouteContext,
    input: LicenseListRuntimeSearchInput,
  ) => Promise<SubmitAndPollResult>;
  listIndividualLicenses?: (
    ctx: RouteContext,
    input?: LicenseListRuntimeSearchInput,
  ) => Promise<SubmitAndPollResult>;
  addFreeIndividualMemberLicenses?: (
    ctx: RouteContext,
    input: IndividualMemberLicenseAddInput,
  ) => Promise<SubmitAndPollResult>;
  issueIndividualMemberLicense?: (
    ctx: RouteContext,
    input: IndividualMemberLicenseInvitationInput,
  ) => Promise<SubmitAndPollResult>;
  transitionIndividualMemberLicense?: (
    ctx: RouteContext,
    action: '_accept' | '_deactivate' | '_release',
    input: IndividualMemberLicenseTransitionInput,
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
  searchDigitalTwins?: (
    ctx: RouteContext,
    input: DigitalTwinSearchInput,
  ) => Promise<SubmitAndPollResult>;
  saveDigitalTwinSelection?: (
    ctx: RouteContext,
    input: DigitalTwinSelectionInput,
  ) => Promise<SubmitAndPollResult>;
  materializeDigitalTwin?: (
    ctx: RouteContext,
    input: DigitalTwinMaterializationInput,
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

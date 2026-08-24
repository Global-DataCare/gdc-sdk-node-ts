// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.
// Always create JSDoc, do not use strings inline in keys nor values, use types instead, and reuse the data test examples.
import {
  DIDCOMM_PLAINTEXT_JSON_MEDIA_TYPE,
} from 'gdc-common-utils-ts/utils/didcomm-submit';
import type { OrganizationDidBindingInput } from 'gdc-sdk-core-ts';
import type { AppInfo } from 'gdc-sdk-core-ts';
import type { IndividualOrganizationLifecycleInput } from 'gdc-sdk-core-ts';
import {
  buildAppHeaders,
  createBootstrapFacade,
  decodeTransportResponse,
  renderCommunicationOutboxRequest,
  renderGatewayMessageRequest,
  renderTransportPollRequest,
  resolveAppInfo,
  TransportProfiles,
  type ResolvedAppInfo,
  type CommunicationClinicalFormatRenderers,
  type SecureDidcommTransportAdapter,
  type TransportProfile,
} from 'gdc-sdk-core-ts';

import { pollUntilCompleteWithMethod } from './async-polling.js';
import {
  confirmLegalOrganizationOrderWithDeps,
  HostLifecycleRequestType,
  HostedTenantLifecycleRequestType,
  submitHostedTenantLifecycleWithDeps,
  type HostRouteContext,
  type HostedTenantLifecycleInput,
} from './host-onboarding.js';
import type {
  NodeLegalOrganizationVerificationTransactionInput,
  NodeOrganizationDidBindingInput,
  NodeOrganizationActivationInput,
} from './orchestration/client-port.js';
import {
  confirmIndividualOrganizationOrderWithDeps,
  type IndividualOrganizationConfirmOrderInput,
  type RouteContext,
} from './individual-onboarding.js';
import {
  ensureFamilyOrganizationRegistrationWithDeps,
  type EnsureFamilyOrganizationRegistrationInput,
} from './family-organization-registration.js';
import { searchFamilyOrganizationWithDeps, type FamilyOrganizationSearchInput } from './family-organization-search.js';
import { requestSmartTokenWithDeps, type SmartTokenRequestInput } from './smart-token.js';
import {
  activateEmployeeDeviceWithActivationCodeWithDeps,
  activateEmployeeDeviceWithActivationRequestWithDeps,
  revokeEmployeeDeviceWithDeps,
  type EmployeeDeviceActivationRequestInput,
  type EmployeeDeviceActivationResult,
  type EmployeeDeviceRevocationInput,
} from './device-activation.js';
import {
  extractOfferIdFromResponseBody,
  extractOfferPreviewFromResponseBody,
} from './order-offer-summary.js';
import { confirmOrganizationLicenseOrderWithDeps, type OrganizationLicenseOrderConfirmInput } from './organization-license-order.js';
import { startIndividualOrganizationWithDeps, type IndividualOrganizationBootstrapInput, type IndividualOrganizationStartResult } from './individual-start.js';
import {
  createOrganizationEmployeeWithDeps,
  issueOrganizationEmployeeLicenseWithDeps,
  disableIndividualMemberWithDeps,
  disableIndividualOrganizationWithDeps,
  disableOrganizationEmployeeWithDeps,
  listIndividualLicenseOffersWithDeps,
  listIndividualLicenseOrdersWithDeps,
  listIndividualLicensesWithDeps,
  addFreeIndividualMemberLicensesWithDeps,
  issueIndividualMemberLicenseWithDeps,
  transitionIndividualMemberLicenseWithDeps,
  listOrganizationLicenseOffersWithDeps,
  listOrganizationLicenseOrdersWithDeps,
  listOrganizationLicensesWithDeps,
  grantProfessionalAccessWithDeps,
  buildClinicalSectionUpdateIngestion,
  buildClinicalSummaryUpdateIngestion,
  ingestCommunicationAndUpdateIndexWithDeps,
  requestProfessionalAccessWithDeps,
  buildVitalSignBatchCommunicationFromSearchResponse,
  registerBlockchainArtifactAndUpdateIndexWithDeps,
  requestClinicalSummaryWithDeps,
  revokeProfessionalAccessWithDeps,
  searchCommunicationParticipantsWithDeps,
  purgeIndividualMemberWithDeps,
  purgeIndividualOrganizationWithDeps,
  purgeOrganizationEmployeeWithDeps,
  prepareEmployeeLifecycleMessageForTransport,
  searchIndividualLicensesWithDeps,
  searchIndividualLicenseOffersWithDeps,
  searchIndividualLicenseOrdersWithDeps,
  searchOrganizationLicensesWithDeps,
  searchOrganizationLicenseOffersWithDeps,
  searchOrganizationLicenseOrdersWithDeps,
  searchOrganizationEmployeesWithDeps,
  searchClinicalBundleWithDeps,
  searchLatestIpsWithDeps,
  upsertRelatedPersonAndPollWithDeps,
  type CommunicationIngestionInput,
  normalizeCommunicationPathFormatSegment,
  type BlockchainArtifactRegistrationInput,
  type VitalSignBatchCommunicationFromSearchResponseInput,
  type CommunicationParticipantRuntimeSearchInput,
  type ClinicalBundleSearchInput,
  type ClinicalSectionUpdateInput,
  type ClinicalSummaryReadResult,
  type ClinicalSummaryRequestInput,
  type ClinicalSummaryUpdateInput,
  type GrantProfessionalAccessInput,
  type GrantProfessionalAccessResult,
  type IndividualMemberLifecycleInput,
  type IndividualMemberLicenseAddInput,
  type IndividualMemberLicenseInvitationInput,
  type IndividualMemberLicenseTransitionInput,
  type LicenseListRuntimeSearchInput,
  type LicenseOfferRuntimeSearchInput,
  type LicenseOrderRuntimeSearchInput,
  type OrganizationEmployeeCreationInput,
  type OrganizationEmployeeLicenseAddInput,
  type OrganizationEmployeeLicenseOfferInput,
  type OrganizationEmployeeLicenseInvitationInput,
  type OrganizationEmployeeLifecycleInput,
  type OrganizationEmployeeSearchInput,
  type ProfessionalAccessRequestInput,
  type ProfessionalAccessRequestResult,
  type RevokeProfessionalAccessInput,
  type RevokeProfessionalAccessResult,
  type RelatedPersonUpsertInput,
  addFreeOrganizationEmployeeLicensesWithDeps,
  requestOrganizationEmployeeLicenseOfferWithDeps,
} from './resource-operations.js';
import type { LegalOrganizationOrderInput } from './host-onboarding.js';
import type { SmartTokenExchangeResult } from './smart-token.js';
import {
  listOrganizationEmployeeLifecycleWithDeps,
  provisionOrganizationEmployeeWithDeps,
  type OrganizationEmployeeProvisioningInput,
  type OrganizationEmployeeProvisioningResult,
} from './organization-employee-lifecycle.js';
import type { OrganizationEmployeeLifecycleRecord } from 'gdc-common-utils-ts/models/organization-employee-lifecycle';
import type {
  NodeRuntimeClient,
  PollOptions,
  PollResult,
  SubmitAndPollResult,
  SubmitPayload,
  SubmitResponse,
} from './orchestration/client-port.js';
import { submitAndPollWithMethods } from './orchestration/client-port.js';
import {
  buildRuntimeHeaders,
  fetchWithTimeout,
  parseResponseBody,
  pollBatchResponseWithRuntimeConfig,
  postJsonWithRuntimeConfig,
  postRenderedWithRuntimeConfig,
  type RuntimeTransportConfig,
} from './runtime-transport.js';
import {
  activateOrganizationInGatewayFromIcaProofWithDeps,
  submitLegalOrganizationCredentialReissuanceWithDeps,
  submitLegalOrganizationVerificationTransactionWithDeps,
  submitOrganizationDidBindingWithDeps,
} from './runtime-host-submission.js';
import { buildGrantProfessionalAccessClaimsWithCid } from './runtime-consent.js';
import { RuntimeClientPaths } from './runtime-client-paths.js';
import { runtimeUuid, wrapBundleAsGatewayTransactionMessage } from './runtime-message.js';
import {
  submitFhirR5SubscriptionBatchWithDeps,
  submitFhirR5SubscriptionTopicBatchWithDeps,
  type FhirR5SubscriptionBatchInput,
} from './fhir-r5-subscription-runtime.js';
import type { FhirR5SubscriptionTopic } from 'gdc-common-utils-ts/models/fhir-r5-subscription';
import {
  materializeDigitalTwinWithDeps,
  saveDigitalTwinSelectionWithDeps,
  searchDigitalTwinsWithDeps,
  type DigitalTwinMaterializationInput,
  type DigitalTwinSearchInput,
  type DigitalTwinSelectionInput,
} from './digital-twin.js';

const bootstrapFacade = createBootstrapFacade();

export type HttpRuntimeClientOptions = {
  baseUrl: string;
  bearerToken?: string;
  /**
   * Optional ICA-issued runtime/software proof token reused as the default
   * HTTP Bearer credential in demo/compat profiles when no explicit
   * `bearerToken` is provided.
   *
   * This keeps the SDK wiring ready for a future ICA-authorized software
   * runtime contract without forcing callers to overload the semantic name
   * `bearerToken` in documentation or app code.
   *
   * Current `gwtemplate-node-ts` demo/bootstrap flows do not yet require a
   * registered software/runtime proof for this path, so callers may omit this
   * field or pass an empty string until the ICA runtime-registration contract
   * is finalized.
   */
  runtimeVpToken?: string;
  /**
   * Host app identity required by GW CORE.
   *
   * `appId` is mandatory when you want the SDK to inject canonical `AppId` and
   * `AppVersion` headers automatically. `appVersion` is optional and defaults
   * to `v1.0`.
   */
  appInfo?: AppInfo;
  /**
   * Optional default route context for the authenticated actor's home tenant.
   * A professional runtime should set this to the employer organization; a
   * selected subject's provider context is passed to each subject operation.
   */
  ctx?: RouteContext;
  defaultHeaders?: Record<string, string>;
  requestTimeoutMs?: number;
  /** Default wire profile for high-level clinical outbox submissions. */
  transportProfile?: TransportProfile;
  /** Wallet-backed pack/unpack adapter required by the secure-form profile. */
  secureTransportAdapter?: SecureDidcommTransportAdapter;
  /** Product-supplied clinical projections not owned by the generic runtime. */
  communicationFormatRenderers?: CommunicationClinicalFormatRenderers;
  /** Injectable fetch implementation for BFF adapters and deterministic tests. */
  fetchImpl?: typeof fetch;
  /**
   * Optional trusted provider-index/DID resolver for subject-scoped SMART
   * requests. The runtime uses the resolved endpoint for transport and JWT
   * audience; application-level callers do not need to pass `audience`.
   */
  smartTokenEndpointResolver?: (subjectDid: string) => Promise<string | undefined>;
};

/**
 * @deprecated Prefer `HttpRuntimeClientOptions`.
 */
export type NodeHttpClientOptions = HttpRuntimeClientOptions;

/**
 * Runtime-oriented HTTP client for Node backends, BFFs, and workers that need
 * to submit GDC gateway requests and poll asynchronous responses.
 *
 * This class is intentionally transport-focused. It does not try to be the
 * high-level editor of FHIR documents; that role belongs to the shared helpers
 * re-exported from `gdc-sdk-core-ts`.
 */
export class HttpRuntimeClient implements NodeRuntimeClient {
  private readonly baseUrl: string;
  private readonly bearerToken?: string;
  private readonly runtimeVpToken?: string;
  private readonly resolvedAppInfo?: ResolvedAppInfo;
  private readonly ctx?: RouteContext;
  private readonly defaultHeaders: Record<string, string>;
  private readonly requestTimeoutMs: number;
  private readonly transportProfile: TransportProfile;
  private readonly secureTransportAdapter?: SecureDidcommTransportAdapter;
  private readonly communicationFormatRenderers: CommunicationClinicalFormatRenderers;
  private readonly fetchImpl?: typeof fetch;
  private readonly smartTokenEndpointResolver?: (subjectDid: string) => Promise<string | undefined>;
  private readonly httpTraceFile?: string;
  private readonly tokenCache = new Map<string, { accessToken: string; tokenType: string; scopes: string[]; expiresAt: number }>();
  private readonly paths: RuntimeClientPaths;

  private get transportConfig(): RuntimeTransportConfig {
    return {
      baseUrl: this.baseUrl,
      bearerToken: this.bearerToken,
      defaultHeaders: this.defaultHeaders,
      requestTimeoutMs: this.requestTimeoutMs,
      httpTraceFile: this.httpTraceFile,
      fetchImpl: this.fetchImpl,
    };
  }

  /**
   * @param options.baseUrl Gateway base URL without trailing slash.
   * @param options.interopMode Optional runtime interoperability mode from the SDK config layer (`demo`, `compat`, `strict`).
   * @param options.bearerToken Optional bearer token reused for direct HTTP calls.
   * @param options.runtimeVpToken Optional ICA-issued runtime/software proof token reused as Bearer when `bearerToken` is not set. Current `gwtemplate-node-ts` demo/bootstrap flows may omit it or pass an empty string because software/runtime registration is not enforced there yet.
   * @param options.appInfo Optional GW CORE app identity. When present, the
   * client injects `AppId` and `AppVersion` into all outgoing requests.
   * @param options.ctx Optional default route context.
   * @param options.defaultHeaders Optional static headers appended to every request.
   * @param options.requestTimeoutMs Optional per-request timeout in milliseconds.
   */
  constructor(options: HttpRuntimeClientOptions) {
    this.baseUrl = String(options.baseUrl || '').replace(/\/+$/, '');
    this.runtimeVpToken = String(options.runtimeVpToken || '').trim() || undefined;
    this.bearerToken = String(options.bearerToken || '').trim()
      || this.runtimeVpToken
      || undefined;
    this.resolvedAppInfo = options.appInfo ? resolveAppInfo(options.appInfo) : undefined;
    this.ctx = options.ctx;
    this.defaultHeaders = {
      ...(this.resolvedAppInfo ? buildAppHeaders(this.resolvedAppInfo) : {}),
      ...(options.defaultHeaders || {}),
    };
    this.requestTimeoutMs = Math.max(1, Math.floor(options.requestTimeoutMs ?? 15_000));
    this.transportProfile = options.transportProfile || TransportProfiles.DidcommPlainJson;
    this.secureTransportAdapter = options.secureTransportAdapter;
    this.communicationFormatRenderers = options.communicationFormatRenderers || {};
    this.fetchImpl = options.fetchImpl;
    this.smartTokenEndpointResolver = options.smartTokenEndpointResolver;
    this.httpTraceFile = String(process.env.SDK_HTTP_TRACE_FILE || '').trim() || undefined;
    this.paths = new RuntimeClientPaths(this.ctx);
  }

  /**
   * Returns the canonical GW CORE app identity resolved by the Node client.
   */
  public getResolvedAppInfo(): ResolvedAppInfo | undefined {
    return this.resolvedAppInfo ? { ...this.resolvedAppInfo } : undefined;
  }

  /**
   * Returns the standard GW CORE headers currently injected by the Node client.
   */
  public getAppHeaders(): Record<'AppId' | 'AppVersion', string> | undefined {
    if (!this.resolvedAppInfo) return undefined;
    return buildAppHeaders(this.resolvedAppInfo);
  }

  /**
   * Returns the configured ICA-issued runtime/software proof token, when present.
   */
  public getRuntimeVpToken(): string | undefined {
    return this.runtimeVpToken;
  }

  /**
   * Builds a canonical GDC v1 resource/action path from a route context.
   */
  public v1Path(ctx: RouteContext | undefined, section: string, format: string, resourceType: string, action: string): string {
    return this.paths.v1Path(ctx, section, format, resourceType, action);
  }

  /**
   * Submits a batch payload to a gateway batch endpoint.
   */
  public async submitBatch(path: string, payload: SubmitPayload): Promise<SubmitResponse> {
    return this.postJson(path, payload, DIDCOMM_PLAINTEXT_JSON_MEDIA_TYPE);
  }

  /**
   * Polls a batch-response endpoint until the GW reports a terminal state.
   */
  public async pollUntilComplete(pollPath: string, request: { thid: string }, pollOptions?: PollOptions): Promise<PollResult> {
    return pollUntilCompleteWithMethod(this.pollBatchResponse.bind(this), pollPath, request, pollOptions);
  }

  /**
   * Convenience wrapper that performs submit and poll in sequence.
   */
  public async submitAndPoll(
    submitPath: string,
    pollPath: string,
    payload: SubmitPayload,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return submitAndPollWithMethods(this, submitPath, pollPath, payload, pollOptions);
  }

  /** Registers one neutral FHIR R5 topic in the tenant-owned CORE catalog. */
  public submitFhirR5SubscriptionTopicBatch(
    ctx: RouteContext,
    topic: FhirR5SubscriptionTopic,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return submitFhirR5SubscriptionTopicBatchWithDeps(ctx, topic, pollOptions, {
      createRuntimeUuid: runtimeUuid,
      submitPath: this.paths.fhirR5SubscriptionTopicBatchPath.bind(this.paths),
      pollPath: this.paths.fhirR5SubscriptionTopicPollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  /** Registers one tenant or exact-subject FHIR R5 rest-hook Subscription. */
  public submitFhirR5SubscriptionBatch(
    ctx: RouteContext,
    input: FhirR5SubscriptionBatchInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return submitFhirR5SubscriptionBatchWithDeps(ctx, input, pollOptions, {
      createRuntimeUuid: runtimeUuid,
      submitPath: this.paths.fhirR5SubscriptionBatchPath.bind(this.paths),
      pollPath: this.paths.fhirR5SubscriptionPollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  private async submitAndPollWithBearerToken(
    bearerToken: string | undefined,
    submitPath: string,
    pollPath: string,
    payload: SubmitPayload,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    const config = { ...this.transportConfig, bearerToken };
    const submitted = await postJsonWithRuntimeConfig(
      config,
      submitPath,
      payload,
      DIDCOMM_PLAINTEXT_JSON_MEDIA_TYPE,
    );
    const poll = await pollUntilCompleteWithMethod(
      (path, request) => pollBatchResponseWithRuntimeConfig(config, path, request),
      pollPath,
      { thid: String(payload.thid) },
      pollOptions,
    );
    return {
      submit: { status: submitted.status, location: submitted.location, body: submitted.body },
      poll,
    };
  }

  /**
   * Starts the host-side legal-organization verification transaction that GW
   * CORE forwards to ICA `_verify`.
   *
   * Runtime ownership:
   * - builds the canonical shared business bundle from `sdk-core/common-utils`
   * - keeps communication/runtime transport concerns at the outer message layer
   * - keeps the controller business key inside the submitted bundle payload
   *
   * Flow separation:
   * - `_transaction` is the new host onboarding step
   * - this runtime does not chain `_activate` after `_transaction`
   * - `_activate` remains available only for the older ICA `_verify` based flow
   *
   * Commercial contract:
   * - the final poll response is expected to mint
   *   `resource.meta.claims['org.schema.Offer.identifier']`
   * - callers should then pass that exact value to
   *   `confirmLegalOrganizationOrder(...)`
   */
  public async submitLegalOrganizationVerificationTransaction(
    hostCtx: HostRouteContext,
    input: NodeLegalOrganizationVerificationTransactionInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return submitLegalOrganizationVerificationTransactionWithDeps({
      hostCtx,
      verificationInput: input,
      pollOptions,
      createRuntimeUuid: runtimeUuid,
      wrapBundleAsGatewayTransactionMessage: this.wrapBundleAsGatewayTransactionMessage.bind(this),
      submitPath: this.hostRegistryOrganizationTransactionPath.bind(this),
      pollPath: this.hostRegistryOrganizationTransactionPollPath.bind(this),
      submitAndPoll: this.transportProfile === TransportProfiles.DidcommEncryptedForm
        ? (submitPath, pollPath, payload, pollOptions) => this.submitClinicalMessageAndPoll(
            submitPath,
            pollPath,
            payload,
            this.transportProfile,
            pollOptions,
          )
        : this.submitAndPoll.bind(this),
    });
  }

  /**
   * Starts the host-side existing-tenant legal-organization reissue flow that
   * GW CORE forwards to ICA `_verify`.
   *
   * Semantics:
   * - reuse the same signed evidence/controller binding contract as `_transaction`
   * - do not create a new Offer
   * - expect GW CORE to reissue one controller activation code in the response
   * - do not call `confirmLegalOrganizationOrder(...)` after this flow
   */
  public async submitLegalOrganizationCredentialReissuance(
    hostCtx: HostRouteContext,
    input: NodeLegalOrganizationVerificationTransactionInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return submitLegalOrganizationCredentialReissuanceWithDeps({
      hostCtx,
      verificationInput: input,
      pollOptions,
      createRuntimeUuid: runtimeUuid,
      wrapBundleAsGatewayTransactionMessage: this.wrapBundleAsGatewayTransactionMessage.bind(this),
      submitPath: this.hostRegistryOrganizationIssuePath.bind(this),
      pollPath: this.hostRegistryOrganizationIssuePollPath.bind(this),
      submitAndPoll: this.transportProfile === TransportProfiles.DidcommEncryptedForm
        ? (submitPath, pollPath, payload, pollOptions) => this.submitClinicalMessageAndPoll(
            submitPath,
            pollPath,
            payload,
            this.transportProfile,
            pollOptions,
          )
        : this.submitAndPoll.bind(this),
    });
  }

  /**
   * @deprecated Use `submitLegalOrganizationCredentialReissuance`.
   * This alias remains for compatibility with clients named after the
   * underlying `Organization/_issue` HTTP action.
   */
  public async submitLegalOrganizationIssue(
    hostCtx: HostRouteContext,
    input: NodeLegalOrganizationVerificationTransactionInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return this.submitLegalOrganizationCredentialReissuance(hostCtx, input, pollOptions);
  }

  /**
   * Submits one tenant-scoped DID document binding request.
   *
   * Binding semantics:
   * - the tenant path identifies the existing organization
   * - `organization.url` carries the public alias/domain list
   * - `controller.sameAs` is optional corroborating identity material
   * - the flow does not rotate or replace organization public keys
   */
  public async submitOrganizationDidBinding(
    ctx: RouteContext,
    input: NodeOrganizationDidBindingInput | OrganizationDidBindingInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return submitOrganizationDidBindingWithDeps({
      routeCtx: ctx,
      bindingInput: input,
      pollOptions,
      createRuntimeUuid: runtimeUuid,
      organizationDidBindingPath: this.organizationDidBindingPath.bind(this),
      organizationDidBindingPollPath: this.organizationDidBindingPollPath.bind(this),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  /**
   * Activates a legal organization in the gateway host registry using an ICA
   * proof token already obtained by the caller.
   *
   * Plaintext transport note:
   * - this Node runtime currently submits `_activate` as
   *   `application/didcomm-plain+json`
   * - because there is no real outer JWS/JWE envelope in that mode, the
   *   runtime mirrors the technical communication metadata derived from
   *   `controller.publicKeyJwk` / `controller.jwks` into `meta.jws.protected`
   *   and `meta.jwe.header`
   * - secure JOSE transports should carry those values in the real protected
   *   headers instead of plaintext `meta`
   * - this mirrored metadata is transport fallback only; the canonical
   *   activation contract remains `body.vp_token` plus `body.controller.*`
   *
   * Credential compatibility:
   * - canonical VP: organization + legal-representative + organization-controller VCs
   * - legacy two-VC VP: accepted only when the old representative VC itself
   *   carries both `RESPRSN` and matching `hasCredential` key material
   * - a representative VC containing only `ISCO-08|1120` is not controller
   *   evidence and will be rejected
   *
   * Commercial contract:
   * - legacy `_activate` is still expected to mint
   *   `resource.meta.claims['org.schema.Offer.identifier']`
   * - callers should then pass that exact value to
   *   `confirmLegalOrganizationOrder(...)`
   */
  public async activateOrganizationInGatewayFromIcaProof(
    hostCtx: HostRouteContext,
    input: NodeOrganizationActivationInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return activateOrganizationInGatewayFromIcaProofWithDeps({
      hostCtx,
      activationInput: input,
      pollOptions,
      createRuntimeUuid: runtimeUuid,
      activationDraftFactory: (draftInput) => bootstrapFacade.createOrganizationActivationDraft(draftInput),
      submitPath: this.hostRegistryOrganizationActivatePath.bind(this),
      pollPath: this.hostRegistryOrganizationActivatePollPath.bind(this),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  /**
   * Confirms a host-side legal organization order after the initial activation.
   *
   * Use this only when the previous flow actually returned one canonical Offer
   * identifier. `_transaction` and legacy `_activate` do; `_issue` does not.
   */
  public async confirmLegalOrganizationOrder(hostCtx: HostRouteContext, input: LegalOrganizationOrderInput, pollOptions?: PollOptions): Promise<SubmitAndPollResult> {
    return confirmLegalOrganizationOrderWithDeps({
      input,
      hostCtx,
      hostRegistryOrderBatchPath: this.paths.hostRegistryOrderBatchPath.bind(this.paths),
      hostRegistryOrderPollPath: this.paths.hostRegistryOrderPollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
      defaultTimeoutMs: pollOptions?.timeoutMs,
      defaultIntervalMs: pollOptions?.intervalMs,
    });
  }

  /**
   * Disables the host registration itself after every hosted tenant has
   * already been purged from the host registry.
   */
  public async disableHost(
    hostCtx: HostRouteContext,
    input: HostedTenantLifecycleInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return submitHostedTenantLifecycleWithDeps({
      hostCtx,
      input,
      requestType: HostLifecycleRequestType.Disable,
      submitPath: this.paths.hostRegistryOrganizationDisablePath.bind(this.paths),
      pollPath: this.paths.hostRegistryOrganizationDisablePollPath.bind(this.paths),
      thidPrefix: 'host-disable',
      submitAndPoll: this.submitAndPoll.bind(this),
      defaultTimeoutMs: pollOptions?.timeoutMs,
      defaultIntervalMs: pollOptions?.intervalMs,
    });
  }

  /**
   * Purges the disabled host registration after the hosted tenant registry has
   * become empty.
   */
  public async purgeHost(
    hostCtx: HostRouteContext,
    input: HostedTenantLifecycleInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return submitHostedTenantLifecycleWithDeps({
      hostCtx,
      input,
      requestType: HostLifecycleRequestType.Purge,
      submitPath: this.paths.hostRegistryOrganizationPurgePath.bind(this.paths),
      pollPath: this.paths.hostRegistryOrganizationPurgePollPath.bind(this.paths),
      thidPrefix: 'host-purge',
      submitAndPoll: this.submitAndPoll.bind(this),
      defaultTimeoutMs: pollOptions?.timeoutMs,
      defaultIntervalMs: pollOptions?.intervalMs,
    });
  }

  /**
   * Disables one hosted tenant through the host registry after its descendants
   * have already been disabled/purged.
   */
  public async disableTenant(
    hostCtx: HostRouteContext,
    input: HostedTenantLifecycleInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return submitHostedTenantLifecycleWithDeps({
      hostCtx,
      input,
      requestType: HostedTenantLifecycleRequestType.Disable,
      submitPath: this.paths.hostRegistryOrganizationDisablePath.bind(this.paths),
      pollPath: this.paths.hostRegistryOrganizationDisablePollPath.bind(this.paths),
      thidPrefix: 'tenant-disable',
      submitAndPoll: this.submitAndPoll.bind(this),
      defaultTimeoutMs: pollOptions?.timeoutMs,
      defaultIntervalMs: pollOptions?.intervalMs,
    });
  }

  /**
   * Purges one already-disabled hosted tenant through the host registry.
   */
  public async purgeTenant(
    hostCtx: HostRouteContext,
    input: HostedTenantLifecycleInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return submitHostedTenantLifecycleWithDeps({
      hostCtx,
      input,
      requestType: HostedTenantLifecycleRequestType.Purge,
      submitPath: this.paths.hostRegistryOrganizationPurgePath.bind(this.paths),
      pollPath: this.paths.hostRegistryOrganizationPurgePollPath.bind(this.paths),
      thidPrefix: 'tenant-purge',
      submitAndPoll: this.submitAndPoll.bind(this),
      defaultTimeoutMs: pollOptions?.timeoutMs,
      defaultIntervalMs: pollOptions?.intervalMs,
    });
  }

  /**
   * Creates an employee or professional entry under an existing organization tenant.
   */
  public async createOrganizationEmployee(ctx: RouteContext, input: OrganizationEmployeeCreationInput, pollOptions?: PollOptions): Promise<SubmitAndPollResult> {
    return createOrganizationEmployeeWithDeps(ctx, input, pollOptions, {
      employeeBatchPath: this.paths.employeeBatchPath.bind(this.paths),
      employeePollPath: this.paths.employeePollPath.bind(this.paths),
      submitAndPoll: (submitPath, pollPath, payload, options) => this.submitClinicalMessageAndPoll(
        submitPath,
        pollPath,
        prepareEmployeeLifecycleMessageForTransport(payload, this.transportProfile),
        this.transportProfile,
        options,
      ),
    });
  }

  /** Creates an employee and reserves its activation credential as one SDK workflow. */
  public async provisionOrganizationEmployee(
    ctx: RouteContext,
    input: OrganizationEmployeeProvisioningInput,
  ): Promise<OrganizationEmployeeProvisioningResult> {
    return provisionOrganizationEmployeeWithDeps(ctx, input, {
      createEmployee: (routeContext, creation) => this.createOrganizationEmployee(routeContext, creation),
      confirmLicenseOrder: (routeContext, licenseOrder) => this.confirmOrganizationLicenseOrder(routeContext, licenseOrder),
      issueLicense: (routeContext, invitation) => this.issueOrganizationEmployeeLicense(routeContext, invitation),
    });
  }

  /** Revokes one selected employee installation without releasing its seat. */
  public async revokeEmployeeDevice(
    ctx: RouteContext,
    input: EmployeeDeviceRevocationInput,
  ): Promise<SubmitAndPollResult> {
    return revokeEmployeeDeviceWithDeps({
      routeCtx: ctx,
      input,
      identityDeviceRevokePath: this.paths.identityDeviceRevokePath.bind(this.paths),
      identityDeviceRevokePollPath: this.paths.identityDeviceRevokePollPath.bind(this.paths),
      submitAndPoll: this.transportProfile === TransportProfiles.DidcommEncryptedForm
        ? (submitPath, pollPath, payload, pollOptions) => this.submitClinicalMessageAndPoll(
            submitPath, pollPath, payload, this.transportProfile, pollOptions,
          )
        : this.submitAndPoll.bind(this),
    });
  }

  /** Reserves an employee seat and issues its bounded multi-device activation credential. */
  public async issueOrganizationEmployeeLicense(
    ctx: RouteContext,
    input: OrganizationEmployeeLicenseInvitationInput,
  ): Promise<SubmitAndPollResult> {
    return issueOrganizationEmployeeLicenseWithDeps(ctx, input, {
      identityLicenseIssuePath: this.paths.identityLicenseIssuePath.bind(this.paths),
      identityLicenseIssuePollPath: this.paths.identityLicenseIssuePollPath.bind(this.paths),
      submitAndPoll: this.transportProfile === TransportProfiles.DidcommEncryptedForm
        ? (submitPath, pollPath, payload, pollOptions) => this.submitClinicalMessageAndPoll(
            submitPath,
            pollPath,
            payload,
            this.transportProfile,
            pollOptions,
          )
        : this.submitAndPoll.bind(this),
    });
  }

  /**
   * Disables an employee using the current GW CORE contract.
   *
   * Current live behavior still uses `Employee/_batch` with entry
   * `request.method = DELETE`. This intentionally does not release licenses.
   */
  public async disableOrganizationEmployee(
    ctx: RouteContext,
    input: OrganizationEmployeeLifecycleInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return disableOrganizationEmployeeWithDeps(ctx, input, pollOptions, {
      employeeBatchPath: this.paths.employeeBatchPath.bind(this.paths),
      employeePollPath: this.paths.employeePollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  /**
   * Preferred public alias for employee disable in the current SDK surface.
   */
  public async disableEmployee(
    ctx: RouteContext,
    input: OrganizationEmployeeLifecycleInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return this.disableOrganizationEmployee(ctx, input, pollOptions);
  }

  /**
   * Purges an inactive employee using the current GW CORE explicit purge route.
   *
   * Purge preserves traceability and releases/disassociates licenses only after
   * the employee is already inactive.
   */
  public async purgeOrganizationEmployee(
    ctx: RouteContext,
    input: OrganizationEmployeeLifecycleInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return purgeOrganizationEmployeeWithDeps(ctx, input, pollOptions, {
      employeePurgePath: this.paths.employeePurgePath.bind(this.paths),
      employeePurgePollPath: this.paths.employeePurgePollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  /**
   * Preferred public alias for employee purge in the current SDK surface.
   */
  public async purgeEmployee(
    ctx: RouteContext,
    input: OrganizationEmployeeLifecycleInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return this.purgeOrganizationEmployee(ctx, input, pollOptions);
  }

  /**
   * Searches employees/professionals under the selected organization tenant.
   */
  public async searchOrganizationEmployees(
    ctx: RouteContext,
    input: OrganizationEmployeeSearchInput,
  ): Promise<SubmitAndPollResult> {
    return searchOrganizationEmployeesWithDeps(ctx, input, {
      employeeSearchPath: this.paths.employeeSearchPath.bind(this.paths),
      employeeSearchPollPath: this.paths.employeeSearchPollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  /** Lists employees with their license and installation state. */
  public async listOrganizationEmployeeLifecycle(
    ctx: RouteContext,
  ): Promise<OrganizationEmployeeLifecycleRecord[]> {
    return listOrganizationEmployeeLifecycleWithDeps(ctx, {
      searchEmployees: (routeContext, input) => this.searchOrganizationEmployees(routeContext, input),
      listLicenses: (routeContext, input) => this.listOrganizationLicenses(routeContext, input),
    });
  }

  /**
   * Searches organization-owned license seats through the canonical
   * `License/_search` route.
   */
  public async searchOrganizationLicenses(
    ctx: RouteContext,
    input: LicenseListRuntimeSearchInput,
  ): Promise<SubmitAndPollResult> {
    return searchOrganizationLicensesWithDeps(ctx, input, {
      organizationLicenseSearchPath: this.paths.organizationLicenseSearchPath.bind(this.paths),
      organizationLicenseSearchPollPath: this.paths.organizationLicenseSearchPollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  /**
   * Lists organization-owned license seats using the same `License/_search`
   * route with optional filters.
   */
  public async listOrganizationLicenses(
    ctx: RouteContext,
    input: LicenseListRuntimeSearchInput = {},
  ): Promise<SubmitAndPollResult> {
    return listOrganizationLicensesWithDeps(ctx, input, {
      organizationLicenseSearchPath: this.paths.organizationLicenseSearchPath.bind(this.paths),
      organizationLicenseSearchPollPath: this.paths.organizationLicenseSearchPollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  /** @deprecated Professional seats use Employee Offer and confirmed Order. */
  public async addFreeOrganizationEmployeeLicenses(
    ctx: RouteContext,
    input: OrganizationEmployeeLicenseAddInput,
  ): Promise<SubmitAndPollResult> {
    return addFreeOrganizationEmployeeLicensesWithDeps(ctx, input, {
      organizationLicenseOfferCreatePath: this.paths.organizationLicenseOfferCreatePath.bind(this.paths),
      organizationLicenseOfferCreatePollPath: this.paths.organizationLicenseOfferCreatePollPath.bind(this.paths),
      submitAndPoll: this.transportProfile === TransportProfiles.DidcommEncryptedForm
        ? (submitPath, pollPath, payload, pollOptions) => this.submitClinicalMessageAndPoll(
            submitPath,
            pollPath,
            payload,
            this.transportProfile,
            pollOptions,
          )
        : this.submitAndPoll.bind(this),
    });
  }

  /** Starts the commercial Offer flow for additional professional seats. */
  public async requestOrganizationEmployeeLicenseOffer(
    ctx: RouteContext,
    input: OrganizationEmployeeLicenseOfferInput,
  ): Promise<SubmitAndPollResult> {
    return requestOrganizationEmployeeLicenseOfferWithDeps(ctx, input, {
      organizationLicenseOfferCreatePath: this.paths.organizationLicenseOfferCreatePath.bind(this.paths),
      organizationLicenseOfferCreatePollPath: this.paths.organizationLicenseOfferCreatePollPath.bind(this.paths),
      submitAndPoll: this.transportProfile === TransportProfiles.DidcommEncryptedForm
        ? (submitPath, pollPath, payload, pollOptions) => this.submitClinicalMessageAndPoll(
            submitPath,
            pollPath,
            payload,
            this.transportProfile,
            pollOptions,
          )
        : this.submitAndPoll.bind(this),
    });
  }

  public async searchOrganizationLicenseOffers(
    ctx: RouteContext,
    input: LicenseOfferRuntimeSearchInput,
  ): Promise<SubmitAndPollResult> {
    return searchOrganizationLicenseOffersWithDeps(ctx, input, {
      organizationLicenseOfferSearchPath: this.paths.organizationLicenseOfferSearchPath.bind(this.paths),
      organizationLicenseOfferSearchPollPath: this.paths.organizationLicenseOfferSearchPollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  public async listOrganizationLicenseOffers(
    ctx: RouteContext,
    input: LicenseOfferRuntimeSearchInput = {},
  ): Promise<SubmitAndPollResult> {
    return listOrganizationLicenseOffersWithDeps(ctx, input, {
      organizationLicenseOfferSearchPath: this.paths.organizationLicenseOfferSearchPath.bind(this.paths),
      organizationLicenseOfferSearchPollPath: this.paths.organizationLicenseOfferSearchPollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  public async searchOrganizationLicenseOrders(
    ctx: RouteContext,
    input: LicenseOrderRuntimeSearchInput,
  ): Promise<SubmitAndPollResult> {
    return searchOrganizationLicenseOrdersWithDeps(ctx, input, {
      organizationLicenseOrderSearchPath: this.paths.organizationLicenseOrderSearchPath.bind(this.paths),
      organizationLicenseOrderSearchPollPath: this.paths.organizationLicenseOrderSearchPollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  public async listOrganizationLicenseOrders(
    ctx: RouteContext,
    input: LicenseOrderRuntimeSearchInput = {},
  ): Promise<SubmitAndPollResult> {
    return listOrganizationLicenseOrdersWithDeps(ctx, input, {
      organizationLicenseOrderSearchPath: this.paths.organizationLicenseOrderSearchPath.bind(this.paths),
      organizationLicenseOrderSearchPollPath: this.paths.organizationLicenseOrderSearchPollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  /**
   * Confirms an already paid organization-side license order so additional
   * seats become usable once GW CORE exposes the public converged route.
   *
   * Current runtime note:
   * - search/list for organization license offers and orders already works
   * - the public/write post-payment seat activation route is not wired yet
   * - this method therefore fails explicitly instead of guessing a transport
   *   contract that is not stable in GW CORE
   */
  public async confirmOrganizationLicenseOrder(
    ctx: RouteContext,
    input: OrganizationLicenseOrderConfirmInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return confirmOrganizationLicenseOrderWithDeps({
      routeCtx: ctx,
      input,
      defaultTimeoutMs: pollOptions?.timeoutMs,
      defaultIntervalMs: pollOptions?.intervalMs,
      hostRegistryOrderBatchPath: this.paths.hostRegistryOrderBatchPath.bind(this.paths),
      hostRegistryOrderPollPath: this.paths.hostRegistryOrderPollPath.bind(this.paths),
      submitAndPoll: this.transportProfile === TransportProfiles.DidcommEncryptedForm
        ? (submitPath, pollPath, payload, options) => this.submitClinicalMessageAndPoll(
            submitPath,
            pollPath,
            payload,
            this.transportProfile,
            options,
          )
        : this.submitAndPoll.bind(this),
    });
  }

  /**
   * Starts the onboarding flow for an individual-oriented tenant or index.
   *
   * Commercial contract:
   * - this SDK method targets the family/individual commercial bootstrap flow
   * - the registration poll response is expected to return one Offer id
   * - callers should then confirm it through
   *   `confirmIndividualOrganizationOrder(...)`
   *
   * This is distinct from embedded legacy individual registration helpers in
   * GW CORE that may persist an individual record without minting an Offer.
   */
  public async startIndividualOrganization(input: IndividualOrganizationBootstrapInput): Promise<IndividualOrganizationStartResult> {
    const routeCtx = this.paths.routeCtxFromInput(input);
    return startIndividualOrganizationWithDeps({
      input,
      routeCtx,
      individualFamilyOrganizationBatchPath: this.paths.individualFamilyOrganizationTransactionPath.bind(this.paths),
      individualFamilyOrganizationPollPath: this.paths.individualFamilyOrganizationTransactionPollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
      getOfferIdFromResponse: (result) => extractOfferIdFromResponseBody(result.poll.body),
      getOfferPreviewFromResponse: (result) => extractOfferPreviewFromResponseBody(result.poll.body),
    });
  }

  /**
   * Searches one existing family/individual registration by controller phone +
   * usualname, with optional birth-date disambiguation.
   */
  public async searchFamilyOrganization(
    ctx: RouteContext,
    input: FamilyOrganizationSearchInput,
  ) {
    return searchFamilyOrganizationWithDeps({
      routeCtx: ctx,
      input,
      defaultTimeoutMs: 20_000,
      defaultIntervalMs: 1_000,
      individualFamilyOrganizationSearchPath: this.paths.individualFamilyOrganizationSearchPath.bind(this.paths),
      individualFamilyOrganizationSearchPollPath: this.paths.individualFamilyOrganizationSearchPollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  /**
   * Searches one existing family/individual registration and starts the
   * bootstrap flow only when the registration does not already exist.
   */
  public async ensureFamilyOrganizationRegistration(
    ctx: RouteContext,
    input: EnsureFamilyOrganizationRegistrationInput,
  ) {
    return ensureFamilyOrganizationRegistrationWithDeps({
      routeCtx: ctx,
      input,
      defaultTimeoutMs: 20_000,
      defaultIntervalMs: 1_000,
      individualFamilyOrganizationSearchPath: this.paths.individualFamilyOrganizationSearchPath.bind(this.paths),
      individualFamilyOrganizationSearchPollPath: this.paths.individualFamilyOrganizationSearchPollPath.bind(this.paths),
      individualFamilyOrganizationBatchPath: this.paths.individualFamilyOrganizationTransactionPath.bind(this.paths),
      individualFamilyOrganizationPollPath: this.paths.individualFamilyOrganizationTransactionPollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  /**
   * Confirms the order returned by `startIndividualOrganization(...)`.
   */
  public async confirmIndividualOrganizationOrder(input: IndividualOrganizationConfirmOrderInput): Promise<SubmitAndPollResult> {
    const routeCtx = this.paths.routeCtxFromInput(input);
    return confirmIndividualOrganizationOrderWithDeps({
      input,
      routeCtx,
      individualFamilyOrderBatchPath: this.paths.individualFamilyOrderBatchPath.bind(this.paths),
      individualFamilyOrderPollPath: this.paths.individualFamilyOrderPollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  /**
   * Disables a hosted individual/family organization without releasing licenses.
   *
   * This follows the current explicit GW CORE `_disable` route rather than the
   * future normalized `_batch + PATCH` target contract.
   */
  public async disableIndividualOrganization(
    ctx: RouteContext,
    input: IndividualOrganizationLifecycleInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return disableIndividualOrganizationWithDeps(ctx, input, pollOptions, {
      individualOrganizationDisablePath: this.paths.individualFamilyOrganizationDisablePath.bind(this.paths),
      individualOrganizationDisablePollPath: this.paths.individualFamilyOrganizationDisablePollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  /**
   * Preferred public alias for hosted individual/family disable.
   */
  public async disableIndividual(
    ctx: RouteContext,
    input: IndividualOrganizationLifecycleInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return this.disableIndividualOrganization(ctx, input, pollOptions);
  }

  /**
   * Purges an inactive hosted individual/family organization.
   *
   * Purge preserves the record for traceability and releases/disassociates
   * licenses only after the registration is already inactive.
   */
  public async purgeIndividualOrganization(
    ctx: RouteContext,
    input: IndividualOrganizationLifecycleInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return purgeIndividualOrganizationWithDeps(ctx, input, pollOptions, {
      individualOrganizationPurgePath: this.paths.individualFamilyOrganizationPurgePath.bind(this.paths),
      individualOrganizationPurgePollPath: this.paths.individualFamilyOrganizationPurgePollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  /**
   * Preferred public alias for hosted individual/family purge.
   */
  public async purgeIndividual(
    ctx: RouteContext,
    input: IndividualOrganizationLifecycleInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return this.purgeIndividualOrganization(ctx, input, pollOptions);
  }

  /**
   * Soft-disables a `RelatedPerson` membership/contact using the current
   * public batch-update path and `RelatedPerson.active = false`.
   */
  public async disableIndividualMember(
    ctx: RouteContext,
    input: IndividualMemberLifecycleInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return disableIndividualMemberWithDeps(ctx, input, pollOptions, {
      individualRelatedPersonBatchPath: this.paths.individualRelatedPersonBatchPath.bind(this.paths),
      individualRelatedPersonPollPath: this.paths.individualRelatedPersonPollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  /**
   * Searches individual/family-side license seats through the canonical
   * `License/_search` route.
   */
  public async searchIndividualLicenses(
    ctx: RouteContext,
    input: LicenseListRuntimeSearchInput,
  ): Promise<SubmitAndPollResult> {
    return searchIndividualLicensesWithDeps(ctx, input, {
      individualLicenseSearchPath: this.paths.individualLicenseSearchPath.bind(this.paths),
      individualLicenseSearchPollPath: this.paths.individualLicenseSearchPollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  /**
   * Lists individual/family-side license seats using the same search route
   * with optional filters.
   */
  public async listIndividualLicenses(
    ctx: RouteContext,
    input: LicenseListRuntimeSearchInput = {},
  ): Promise<SubmitAndPollResult> {
    return listIndividualLicensesWithDeps(ctx, input, {
      individualLicenseSearchPath: this.paths.individualLicenseSearchPath.bind(this.paths),
      individualLicenseSearchPollPath: this.paths.individualLicenseSearchPollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  /** Adds zero-cost seats to one individual organization's member pool. */
  public async addFreeIndividualMemberLicenses(
    ctx: RouteContext,
    input: IndividualMemberLicenseAddInput,
  ): Promise<SubmitAndPollResult> {
    return addFreeIndividualMemberLicensesWithDeps(ctx, input, {
      individualLicenseActionPath: this.paths.individualLicenseActionPath.bind(this.paths),
      individualLicenseActionPollPath: this.paths.individualLicenseActionPollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  /** Reserves one individual seat for an existing FHIR v3-role contact. */
  public async issueIndividualMemberLicense(
    ctx: RouteContext,
    input: IndividualMemberLicenseInvitationInput,
  ): Promise<SubmitAndPollResult> {
    return issueIndividualMemberLicenseWithDeps(ctx, input, {
      individualLicenseActionPath: this.paths.individualLicenseActionPath.bind(this.paths),
      individualLicenseActionPollPath: this.paths.individualLicenseActionPollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  /** Accepts, deactivates or releases one individual-member seat. */
  public async transitionIndividualMemberLicense(
    ctx: RouteContext,
    action: '_accept' | '_deactivate' | '_release',
    input: IndividualMemberLicenseTransitionInput,
  ): Promise<SubmitAndPollResult> {
    return transitionIndividualMemberLicenseWithDeps(ctx, action, input, {
      individualLicenseActionPath: this.paths.individualLicenseActionPath.bind(this.paths),
      individualLicenseActionPollPath: this.paths.individualLicenseActionPollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  public async searchIndividualLicenseOffers(
    ctx: RouteContext,
    input: LicenseOfferRuntimeSearchInput,
  ): Promise<SubmitAndPollResult> {
    return searchIndividualLicenseOffersWithDeps(ctx, input, {
      individualLicenseOfferSearchPath: this.paths.individualLicenseOfferSearchPath.bind(this.paths),
      individualLicenseOfferSearchPollPath: this.paths.individualLicenseOfferSearchPollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  public async listIndividualLicenseOffers(
    ctx: RouteContext,
    input: LicenseOfferRuntimeSearchInput = {},
  ): Promise<SubmitAndPollResult> {
    return listIndividualLicenseOffersWithDeps(ctx, input, {
      individualLicenseOfferSearchPath: this.paths.individualLicenseOfferSearchPath.bind(this.paths),
      individualLicenseOfferSearchPollPath: this.paths.individualLicenseOfferSearchPollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  public async searchIndividualLicenseOrders(
    ctx: RouteContext,
    input: LicenseOrderRuntimeSearchInput,
  ): Promise<SubmitAndPollResult> {
    return searchIndividualLicenseOrdersWithDeps(ctx, input, {
      individualLicenseOrderSearchPath: this.paths.individualLicenseOrderSearchPath.bind(this.paths),
      individualLicenseOrderSearchPollPath: this.paths.individualLicenseOrderSearchPollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  public async listIndividualLicenseOrders(
    ctx: RouteContext,
    input: LicenseOrderRuntimeSearchInput = {},
  ): Promise<SubmitAndPollResult> {
    return listIndividualLicenseOrdersWithDeps(ctx, input, {
      individualLicenseOrderSearchPath: this.paths.individualLicenseOrderSearchPath.bind(this.paths),
      individualLicenseOrderSearchPollPath: this.paths.individualLicenseOrderSearchPollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  /**
   * Purges one previously disabled `RelatedPerson` membership/contact through
   * the explicit public purge path.
   */
  public async purgeIndividualMember(
    ctx: RouteContext,
    input: IndividualMemberLifecycleInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return purgeIndividualMemberWithDeps(ctx, input, pollOptions, {
      individualRelatedPersonPurgePath: this.paths.individualRelatedPersonPurgePath.bind(this.paths),
      individualRelatedPersonPurgePollPath: this.paths.individualRelatedPersonPurgePollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  /**
   * Creates and submits a consent-oriented access grant for a professional actor.
   */
  public async grantProfessionalAccess(
    ctx: RouteContext,
    input: GrantProfessionalAccessInput,
  ): Promise<GrantProfessionalAccessResult> {
    return grantProfessionalAccessWithDeps(ctx, input, {
      buildConsentClaimsWithCid: this.buildConsentClaimsWithCid.bind(this),
      individualConsentR4BatchPath: this.paths.individualConsentR4BatchPath.bind(this.paths),
      individualConsentR4PollPath: this.paths.individualConsentR4PollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  /**
   * Closes an existing professional consent by setting its period end and
   * resubmitting the updated consent resource.
   */
  public async revokeProfessionalAccess(
    ctx: RouteContext,
    input: RevokeProfessionalAccessInput,
  ): Promise<RevokeProfessionalAccessResult> {
    return revokeProfessionalAccessWithDeps(ctx, input, {
      individualConsentR4BatchPath: this.paths.individualConsentR4BatchPath.bind(this.paths),
      individualConsentR4PollPath: this.paths.individualConsentR4PollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  /**
   * Requests SMART/OpenID token material through the gateway.
   *
   * The business inputs are typically the actor DID plus requested scopes.
   * Route details are resolved either from `input` compatibility fields
   * (`tenantId` / `jurisdiction` / `sector`) or from
   * the default client route context configured in the constructor.
   */
  public async requestSmartToken(input: SmartTokenRequestInput): Promise<SmartTokenExchangeResult> {
    const routeCtx = this.paths.routeCtxFromInput(input);
    return requestSmartTokenWithDeps({
      input,
      routeCtx,
      baseUrl: this.baseUrl,
      defaultTimeoutMs: undefined,
      defaultIntervalMs: undefined,
      identityTokenExchangePath: this.paths.identityTokenExchangePath.bind(this.paths),
      identityTokenExchangePollPath: this.paths.identityTokenExchangePollPath.bind(this.paths),
      identityOpenIdSmartTokenPath: this.paths.identityOpenIdSmartTokenPath.bind(this.paths),
      identityOpenIdSmartTokenPollPath: this.paths.identityOpenIdSmartTokenPollPath.bind(this.paths),
      resolveSmartTokenEndpoint: this.smartTokenEndpointResolver,
      submitAndPoll: this.submitAndPoll.bind(this),
      setTokenCache: (tokenCacheKey, token) => this.tokenCache.set(tokenCacheKey, token),
    });
  }

  /**
   * Registers any actor profile device through activation-code exchange plus
   * GW DCR. The historical helper name says employee, but the transport is
   * actor-neutral and is used by portal and telephone profile runtimes.
   */
  public async activateProfileDeviceWithActivationRequest(
    input: EmployeeDeviceActivationRequestInput,
  ): Promise<EmployeeDeviceActivationResult> {
    const routeCtx = this.paths.routeCtxFromInput(input);
    return activateEmployeeDeviceWithActivationRequestWithDeps({
      routeCtx,
      input,
      activateEmployeeDeviceWithActivationCode: (ctx, activationInput) =>
        activateEmployeeDeviceWithActivationCodeWithDeps({
          routeCtx: ctx,
          input: activationInput,
          identityTokenExchangePath: this.paths.identityTokenExchangePath.bind(this.paths),
          identityTokenExchangePollPath: this.paths.identityTokenExchangePollPath.bind(this.paths),
          identityDeviceDcrPath: this.paths.identityDeviceDcrPath.bind(this.paths),
          identityDeviceDcrPollPath: this.paths.identityDeviceDcrPollPath.bind(this.paths),
          submitAndPollWithBearerToken: this.submitAndPollWithBearerToken.bind(this),
        }),
    });
  }

  /**
   * Creates or updates a `RelatedPerson` for non-employee family/caregiver
   * roles such as a grandfather, guardian, or external caregiver.
   */
  public async upsertRelatedPersonAndPoll(
    ctx: RouteContext,
    input: RelatedPersonUpsertInput,
  ): Promise<SubmitAndPollResult> {
    return upsertRelatedPersonAndPollWithDeps(ctx, input, {
      individualRelatedPersonBatchPath: this.paths.individualRelatedPersonBatchPath.bind(this.paths),
      individualRelatedPersonPollPath: this.paths.individualRelatedPersonPollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  /**
   * Submits a FHIR `Communication` ingestion request and polls until the
   * GW has persisted the audit record and related projections.
   *
   * @param ctx Route context containing tenant/jurisdiction/sector.
   * @param input Communication payload plus route/format options.
   */
  public async ingestCommunicationAndUpdateIndex(
    ctx: RouteContext,
    input: CommunicationIngestionInput,
  ): Promise<SubmitAndPollResult> {
    if (input.communicationJob) {
      return this.submitCommunicationOutboxJobAndPoll(ctx, input);
    }
    return ingestCommunicationAndUpdateIndexWithDeps(ctx, input, {
      individualCommunicationBatchPath: this.paths.individualCommunicationBatchPath.bind(this.paths),
      individualCommunicationPollPath: this.paths.individualCommunicationPollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  /**
   * Records a subject-scoped permission-request Communication before SMART
   * authorization exists. The configured bearer authenticates HTTP and the
   * configured secure transport adapter signs/encrypts DIDComm when enabled.
   */
  public async requestProfessionalAccess(
    ctx: RouteContext,
    input: ProfessionalAccessRequestInput,
  ): Promise<ProfessionalAccessRequestResult> {
    return requestProfessionalAccessWithDeps(ctx, input, {
      individualCommunicationBatchPath: this.paths.individualCommunicationBatchPath.bind(this.paths),
      individualCommunicationPollPath: this.paths.individualCommunicationPollPath.bind(this.paths),
      submitAndPoll: (submitPath, pollPath, payload, pollOptions) => this.submitClinicalMessageAndPoll(
        submitPath,
        pollPath,
        payload,
        input.transportProfile || this.transportProfile,
        pollOptions,
      ),
    });
  }

  /**
   * Updates exactly one clinical section.
   *
   * The attached payload must be a `Bundle.type=batch|collection`, and the
   * exact section is carried on the outer Communication. This flow is suitable
   * for vital-sign or other explicitly section-scoped updates; it does not
   * replace a multi-section IPS document.
   */
  public async updateClinicalSection(
    ctx: RouteContext,
    input: ClinicalSectionUpdateInput,
  ): Promise<SubmitAndPollResult> {
    return this.ingestCommunicationAndUpdateIndex(
      ctx,
      buildClinicalSectionUpdateIngestion(input),
    );
  }

  /**
   * Updates several clinical sections as one Composition-first document.
   *
   * The attached payload must be `Bundle.type=document` with `Composition` in
   * `entry[0]`; its `section[].entry[]` references delimit the updated data.
   */
  public async updateClinicalSummary(
    ctx: RouteContext,
    input: ClinicalSummaryUpdateInput,
  ): Promise<SubmitAndPollResult> {
    return this.ingestCommunicationAndUpdateIndex(
      ctx,
      buildClinicalSummaryUpdateIngestion(input),
    );
  }

  /**
   * Reads the authoritative clinical document currently available for one
   * subject through an auditable `Communication` carrying GW's internal
   * `Subject/$summary` operation reference. The runtime submits
   * `Communication/_batch`; callers do not invoke `$summary` directly.
   *
   * Unlike `ingestCommunicationAndUpdateIndex(...)`, this method does not
   * represent a write or projection lifecycle. It returns the GW document and
   * a `BundleReader` for section-by-section navigation.
   */
  public async requestClinicalSummary(
    ctx: RouteContext,
    input: ClinicalSummaryRequestInput,
  ): Promise<ClinicalSummaryReadResult> {
    return requestClinicalSummaryWithDeps(ctx, input, {
      submitSummaryCommunication: this.submitCommunicationOutboxJobAndPoll.bind(this),
    });
  }

  /**
   * Renders and submits one canonical clinical outbox job without requiring
   * BFF, portal or assistant consumers to know GW wire envelopes.
   */
  private async submitCommunicationOutboxJobAndPoll(
    ctx: RouteContext,
    input: CommunicationIngestionInput,
  ): Promise<SubmitAndPollResult> {
    const job = input.communicationJob!;
    const profile = input.transportProfile || this.transportProfile;
    const format = normalizeCommunicationPathFormatSegment(input.clinicalFormat || input.pathFormatSegment);
    const submitPath = this.paths.individualCommunicationBatchPath(ctx, format);
    const pollPath = this.paths.individualCommunicationPollPath(ctx, format);
    const renderedSubmit = await renderCommunicationOutboxRequest(
      job,
      profile,
      this.secureTransportAdapter,
      {
        clinicalFormat: input.clinicalFormat || input.pathFormatSegment || 'api',
        formatRenderers: this.communicationFormatRenderers,
      },
    );
    const submit = await postRenderedWithRuntimeConfig(this.transportConfig, submitPath, renderedSubmit);
    const poll = await pollUntilCompleteWithMethod(
      async (path, request) => {
        const renderedPoll = await renderTransportPollRequest(request.thid, profile, this.secureTransportAdapter);
        const response = await postRenderedWithRuntimeConfig(this.transportConfig, path, renderedPoll);
        return {
          status: response.status,
          body: response.status === 202
            ? response.body
            : response.status >= 200 && response.status < 300
              ? await decodeTransportResponse(response.body, profile, this.secureTransportAdapter)
              : response.body,
          retryAfterMs: response.retryAfterMs,
        };
      },
      pollPath,
      { thid: job.thid },
      input.pollOptions,
    );
    return {
      submit: {
        status: submit.status,
        location: submit.location,
        body: submit.body,
      },
      poll,
    };
  }

  /**
   * Applies the configured wire profile to a direct subject-index search.
   * This is compatibility/specialized plumbing, not the primary summary read.
   */
  private async submitClinicalMessageAndPoll(
    submitPath: string,
    pollPath: string,
    payload: SubmitPayload,
    profile: TransportProfile,
    pollOptions?: PollOptions,
    accessToken?: string,
  ): Promise<SubmitAndPollResult> {
    const transportConfig = accessToken
      ? { ...this.transportConfig, bearerToken: accessToken }
      : this.transportConfig;
    const renderedSubmit = await renderGatewayMessageRequest(payload, profile, this.secureTransportAdapter);
    const submit = await postRenderedWithRuntimeConfig(transportConfig, submitPath, renderedSubmit);
    const poll = await pollUntilCompleteWithMethod(
      async (path, request) => {
        const renderedPoll = await renderTransportPollRequest(request.thid, profile, this.secureTransportAdapter);
        const response = await postRenderedWithRuntimeConfig(transportConfig, path, renderedPoll);
        return {
          status: response.status,
          body: response.status === 202
            ? response.body
            : response.status >= 200 && response.status < 300
              ? await decodeTransportResponse(response.body, profile, this.secureTransportAdapter)
              : response.body,
          retryAfterMs: response.retryAfterMs,
        };
      },
      pollPath,
      { thid: renderedSubmit.thid },
      pollOptions,
    );
    return {
      submit: { status: submit.status, location: submit.location, body: submit.body },
      poll,
    };
  }

  /**
   * Registers one FHIR resource or raw artifact on blockchain and waits until
   * GW has indexed the resulting DocumentReference projection.
   */
  public async registerBlockchainArtifactAndUpdateIndex(
    ctx: RouteContext,
    input: BlockchainArtifactRegistrationInput,
  ): Promise<SubmitAndPollResult> {
    return registerBlockchainArtifactAndUpdateIndexWithDeps(ctx, input, {
      individualDocumentReferenceBatchPath: this.paths.individualDocumentReferenceBatchPath.bind(this.paths),
      individualDocumentReferencePollPath: this.paths.individualDocumentReferencePollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  /**
   * Builds and submits a Communication carrying the selected vital-sign day
   * batch artifacts from a paginated search response.
   */
  public async submitVitalSignBatchCommunicationFromSearchResponse(
    ctx: RouteContext,
    input: VitalSignBatchCommunicationFromSearchResponseInput,
  ): Promise<SubmitAndPollResult> {
    return ingestCommunicationAndUpdateIndexWithDeps(
      ctx,
      buildVitalSignBatchCommunicationFromSearchResponse(input),
      {
        individualCommunicationBatchPath: this.paths.individualCommunicationBatchPath.bind(this.paths),
        individualCommunicationPollPath: this.paths.individualCommunicationPollPath.bind(this.paths),
        submitAndPoll: this.submitAndPoll.bind(this),
      },
    );
  }

  /**
   * Searches communication channel records by subject and participant
   * identifiers through `Communication/_search`.
   */
  public async searchCommunicationParticipants(
    ctx: RouteContext,
    input: CommunicationParticipantRuntimeSearchInput,
  ): Promise<SubmitAndPollResult> {
    return searchCommunicationParticipantsWithDeps(ctx, input, {
      communicationSearchPath: this.paths.individualCommunicationSearchPath.bind(this.paths),
      communicationSearchPollPath: this.paths.individualCommunicationSearchPollPath.bind(this.paths),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  /**
   * Alias for `ingestCommunicationAndUpdateIndex(...)`.
   *
   * @param ctx Route context containing tenant/jurisdiction/sector.
   * @param input Communication payload plus route/format options.
   */
  public async submitCommunicationAndPoll(
    ctx: RouteContext,
    input: CommunicationIngestionInput,
  ): Promise<SubmitAndPollResult> {
    return this.ingestCommunicationAndUpdateIndex(ctx, input);
  }

  /**
   * Executes the compatibility/specialized direct `Bundle/_search` surface.
   * New summary viewers use `requestClinicalSummary(...)`, whose Communication
   * transport keeps the internal index operation hidden from application code.
   *
   * @param ctx Route context containing tenant/jurisdiction/sector.
   * @param input Search parameters such as subject, section, date and included resource types.
   */
  public async searchClinicalBundle(
    ctx: RouteContext,
    input: ClinicalBundleSearchInput,
  ): Promise<SubmitAndPollResult> {
    return searchClinicalBundleWithDeps(ctx, input, {
      bundleSearchPath: this.paths.individualBundleSearchPath.bind(this.paths),
      bundleSearchPollPath: this.paths.individualBundleSearchPollPath.bind(this.paths),
      submitAndPoll: (submitPath, pollPath, payload, pollOptions) => this.submitClinicalMessageAndPoll(
        submitPath,
        pollPath,
        payload,
        input.transportProfile || this.transportProfile,
        pollOptions,
      ),
    });
  }

  /** Searches tenant digital twins using coded, pseudonymous research claims. */
  public async searchDigitalTwins(
    ctx: RouteContext,
    input: DigitalTwinSearchInput,
  ): Promise<SubmitAndPollResult> {
    return searchDigitalTwinsWithDeps(ctx, input, {
      digitalTwinSearchPath: this.paths.digitalTwinSearchPath.bind(this.paths),
      digitalTwinSearchPollPath: this.paths.digitalTwinSearchPollPath.bind(this.paths),
      digitalTwinCompositionBatchPath: this.paths.digitalTwinCompositionBatchPath.bind(this.paths),
      digitalTwinCompositionPollPath: this.paths.digitalTwinCompositionPollPath.bind(this.paths),
      digitalTwinCommunicationBatchPath: this.paths.digitalTwinCommunicationBatchPath.bind(this.paths),
      digitalTwinCommunicationPollPath: this.paths.digitalTwinCommunicationPollPath.bind(this.paths),
      submitAndPoll: (submitPath, pollPath, payload, pollOptions) => this.submitClinicalMessageAndPoll(
        submitPath,
        pollPath,
        payload,
        this.transportProfile,
        pollOptions,
        input.accessToken,
      ),
    });
  }

  /** Saves one tagged researcher working copy without mutating the canonical twin. */
  public async saveDigitalTwinSelection(
    ctx: RouteContext,
    input: DigitalTwinSelectionInput,
  ): Promise<SubmitAndPollResult> {
    return saveDigitalTwinSelectionWithDeps(ctx, input, {
      digitalTwinSearchPath: this.paths.digitalTwinSearchPath.bind(this.paths),
      digitalTwinSearchPollPath: this.paths.digitalTwinSearchPollPath.bind(this.paths),
      digitalTwinCompositionBatchPath: this.paths.digitalTwinCompositionBatchPath.bind(this.paths),
      digitalTwinCompositionPollPath: this.paths.digitalTwinCompositionPollPath.bind(this.paths),
      digitalTwinCommunicationBatchPath: this.paths.digitalTwinCommunicationBatchPath.bind(this.paths),
      digitalTwinCommunicationPollPath: this.paths.digitalTwinCommunicationPollPath.bind(this.paths),
      submitAndPoll: (submitPath, pollPath, payload, pollOptions) => this.submitClinicalMessageAndPoll(
        submitPath,
        pollPath,
        payload,
        this.transportProfile,
        pollOptions,
        input.accessToken,
      ),
    });
  }

  /** Materializes one selected pseudonymous research subject as a summary Bundle. */
  public async materializeDigitalTwin(
    ctx: RouteContext,
    input: DigitalTwinMaterializationInput,
  ): Promise<SubmitAndPollResult> {
    return materializeDigitalTwinWithDeps(ctx, input, {
      digitalTwinSearchPath: this.paths.digitalTwinSearchPath.bind(this.paths),
      digitalTwinSearchPollPath: this.paths.digitalTwinSearchPollPath.bind(this.paths),
      digitalTwinCompositionBatchPath: this.paths.digitalTwinCompositionBatchPath.bind(this.paths),
      digitalTwinCompositionPollPath: this.paths.digitalTwinCompositionPollPath.bind(this.paths),
      digitalTwinCommunicationBatchPath: this.paths.digitalTwinCommunicationBatchPath.bind(this.paths),
      digitalTwinCommunicationPollPath: this.paths.digitalTwinCommunicationPollPath.bind(this.paths),
      submitAndPoll: (submitPath, pollPath, payload, pollOptions) => this.submitClinicalMessageAndPoll(
        submitPath,
        pollPath,
        payload,
        this.transportProfile,
        pollOptions,
        input.accessToken,
      ),
    });
  }

  /**
   * Searches the latest IPS-oriented document view for a subject.
   *
   * Defaults the section to the IPS patient summary document and includes
   * `Composition` plus `DocumentReference`.
   *
   * @param ctx Route context containing tenant/jurisdiction/sector.
   * @param input Subject-scoped search parameters.
   */
  public async searchLatestIps(
    ctx: RouteContext,
    input: Omit<ClinicalBundleSearchInput, 'includedTypes'>,
  ): Promise<SubmitAndPollResult> {
    return searchLatestIpsWithDeps(ctx, input, {
      searchClinicalBundle: this.searchClinicalBundle.bind(this),
    });
  }

  /**
   * Preferred runtime alias for latest-IPS retrieval used by shared facades.
   */
  public async getLatestIps(
    ctx: RouteContext,
    input: Omit<ClinicalBundleSearchInput, 'includedTypes'>,
  ): Promise<SubmitAndPollResult> {
    return this.searchLatestIps(ctx, input);
  }

  /**
   * Searches a communication/document thread using `thid` and returns the
   * indexed communication/document projections.
   */
  public async listCommunicationThread(
    ctx: RouteContext,
    input: { subject: string; thid: string; pollOptions?: PollOptions },
  ): Promise<SubmitAndPollResult> {
    return this.searchClinicalBundle(ctx, {
      subject: input.subject,
      thid: input.thid,
      includedTypes: ['Communication', 'DocumentReference', 'Composition'],
      pollOptions: input.pollOptions,
    });
  }


  private buildConsentClaimsWithCid(input: GrantProfessionalAccessInput): {
    actorIdentifier: string;
    subjectIdentifier: string;
    consentClaims: Record<string, unknown>;
    claimsCid?: string;
  } {
    return buildGrantProfessionalAccessClaimsWithCid(input, runtimeUuid);
  }

  private async pollBatchResponse(path: string, request: { thid: string }): Promise<{ status: number; body: unknown; retryAfterMs?: number }> {
    return pollBatchResponseWithRuntimeConfig(this.transportConfig, path, request);
  }

  private async postJson(path: string, payload: unknown, contentType: string): Promise<SubmitResponse> {
    return postJsonWithRuntimeConfig(this.transportConfig, path, payload, contentType);
  }

  private buildHeaders(contentType: string): Record<string, string> {
    return buildRuntimeHeaders(this.transportConfig, contentType);
  }

  private async fetchWithTimeout(path: string, init: RequestInit): Promise<Response> {
    return fetchWithTimeout(this.transportConfig, path, init);
  }

  private async parseResponseBody(response: Response): Promise<unknown> {
    return parseResponseBody(response);
  }

  /**
   * Reuses the shared bundle business contract while keeping attachment
   * transport fields at the DIDComm/plaintext message layer expected by GW.
   */
  private wrapBundleAsGatewayTransactionMessage(input: Readonly<Parameters<typeof wrapBundleAsGatewayTransactionMessage>[0]>): SubmitPayload {
    return wrapBundleAsGatewayTransactionMessage(input);
  }

  public hostRegistryOrganizationTransactionPath(ctx?: HostRouteContext): string { return this.paths.hostRegistryOrganizationTransactionPath(ctx); }
  public hostRegistryOrganizationTransactionPollPath(ctx?: HostRouteContext): string { return this.paths.hostRegistryOrganizationTransactionPollPath(ctx); }
  public hostRegistryOrganizationIssuePath(ctx?: HostRouteContext): string { return this.paths.hostRegistryOrganizationIssuePath(ctx); }
  public hostRegistryOrganizationIssuePollPath(ctx?: HostRouteContext): string { return this.paths.hostRegistryOrganizationIssuePollPath(ctx); }
  public hostRegistryOrganizationActivatePath(ctx?: HostRouteContext): string { return this.paths.hostRegistryOrganizationActivatePath(ctx); }
  public hostRegistryOrganizationActivatePollPath(ctx?: HostRouteContext): string { return this.paths.hostRegistryOrganizationActivatePollPath(ctx); }
  public hostRegistryOrganizationDisablePath(ctx?: HostRouteContext): string { return this.paths.hostRegistryOrganizationDisablePath(ctx); }
  public hostRegistryOrganizationDisablePollPath(ctx?: HostRouteContext): string { return this.paths.hostRegistryOrganizationDisablePollPath(ctx); }
  public hostRegistryOrganizationPurgePath(ctx?: HostRouteContext): string { return this.paths.hostRegistryOrganizationPurgePath(ctx); }
  public hostRegistryOrganizationPurgePollPath(ctx?: HostRouteContext): string { return this.paths.hostRegistryOrganizationPurgePollPath(ctx); }
  public hostRegistryOrderBatchPath(ctx?: HostRouteContext): string { return this.paths.hostRegistryOrderBatchPath(ctx); }
  public hostRegistryOrderPollPath(ctx?: HostRouteContext): string { return this.paths.hostRegistryOrderPollPath(ctx); }
  public employeeBatchPath(ctx?: RouteContext): string { return this.paths.employeeBatchPath(ctx); }
  public employeePollPath(ctx?: RouteContext): string { return this.paths.employeePollPath(ctx); }
  public employeeSearchPath(ctx?: RouteContext): string { return this.paths.employeeSearchPath(ctx); }
  public employeeSearchPollPath(ctx?: RouteContext): string { return this.paths.employeeSearchPollPath(ctx); }
  public organizationLicenseSearchPath(ctx?: RouteContext): string { return this.paths.organizationLicenseSearchPath(ctx); }
  public organizationLicenseSearchPollPath(ctx?: RouteContext): string { return this.paths.organizationLicenseSearchPollPath(ctx); }
  public organizationDidBindingPath(ctx?: RouteContext): string { return this.paths.organizationDidBindingPath(ctx); }
  public organizationDidBindingPollPath(ctx?: RouteContext): string { return this.paths.organizationDidBindingPollPath(ctx); }
  public organizationLicenseOfferSearchPath(ctx?: RouteContext): string { return this.paths.organizationLicenseOfferSearchPath(ctx); }
  public organizationLicenseOfferSearchPollPath(ctx?: RouteContext): string { return this.paths.organizationLicenseOfferSearchPollPath(ctx); }
  public organizationLicenseOrderSearchPath(ctx?: RouteContext): string { return this.paths.organizationLicenseOrderSearchPath(ctx); }
  public organizationLicenseOrderSearchPollPath(ctx?: RouteContext): string { return this.paths.organizationLicenseOrderSearchPollPath(ctx); }
  public employeePurgePath(ctx?: RouteContext): string { return this.paths.employeePurgePath(ctx); }
  public employeePurgePollPath(ctx?: RouteContext): string { return this.paths.employeePurgePollPath(ctx); }
  public individualFamilyOrganizationBatchPath(ctx?: RouteContext): string { return this.paths.individualFamilyOrganizationBatchPath(ctx); }
  public individualFamilyOrganizationPollPath(ctx?: RouteContext): string { return this.paths.individualFamilyOrganizationPollPath(ctx); }
  public individualFamilyOrganizationSearchPath(ctx?: RouteContext): string { return this.paths.individualFamilyOrganizationSearchPath(ctx); }
  public individualFamilyOrganizationSearchPollPath(ctx?: RouteContext): string { return this.paths.individualFamilyOrganizationSearchPollPath(ctx); }
  public individualFamilyOrganizationTransactionPath(ctx?: RouteContext): string { return this.paths.individualFamilyOrganizationTransactionPath(ctx); }
  public individualFamilyOrganizationTransactionPollPath(ctx?: RouteContext): string { return this.paths.individualFamilyOrganizationTransactionPollPath(ctx); }
  public individualFamilyOrganizationDisablePath(ctx?: RouteContext): string { return this.paths.individualFamilyOrganizationDisablePath(ctx); }
  public individualFamilyOrganizationDisablePollPath(ctx?: RouteContext): string { return this.paths.individualFamilyOrganizationDisablePollPath(ctx); }
  public individualFamilyOrganizationPurgePath(ctx?: RouteContext): string { return this.paths.individualFamilyOrganizationPurgePath(ctx); }
  public individualFamilyOrganizationPurgePollPath(ctx?: RouteContext): string { return this.paths.individualFamilyOrganizationPurgePollPath(ctx); }
  public individualLicenseSearchPath(ctx?: RouteContext): string { return this.paths.individualLicenseSearchPath(ctx); }
  public individualLicenseSearchPollPath(ctx?: RouteContext): string { return this.paths.individualLicenseSearchPollPath(ctx); }
  public individualLicenseActionPath(ctx: RouteContext | undefined, action: string): string { return this.paths.individualLicenseActionPath(ctx, action); }
  public individualLicenseActionPollPath(ctx: RouteContext | undefined, action: string): string { return this.paths.individualLicenseActionPollPath(ctx, action); }
  public individualLicenseOfferSearchPath(ctx?: RouteContext): string { return this.paths.individualLicenseOfferSearchPath(ctx); }
  public individualLicenseOfferSearchPollPath(ctx?: RouteContext): string { return this.paths.individualLicenseOfferSearchPollPath(ctx); }
  public individualLicenseOrderSearchPath(ctx?: RouteContext): string { return this.paths.individualLicenseOrderSearchPath(ctx); }
  public individualLicenseOrderSearchPollPath(ctx?: RouteContext): string { return this.paths.individualLicenseOrderSearchPollPath(ctx); }
  public individualFamilyOrderBatchPath(ctx?: RouteContext): string { return this.paths.individualFamilyOrderBatchPath(ctx); }
  public individualFamilyOrderPollPath(ctx?: RouteContext): string { return this.paths.individualFamilyOrderPollPath(ctx); }
  public individualRelatedPersonBatchPath(ctx?: RouteContext): string { return this.paths.individualRelatedPersonBatchPath(ctx); }
  public individualRelatedPersonPollPath(ctx?: RouteContext): string { return this.paths.individualRelatedPersonPollPath(ctx); }
  public individualRelatedPersonPurgePath(ctx?: RouteContext): string { return this.paths.individualRelatedPersonPurgePath(ctx); }
  public individualRelatedPersonPurgePollPath(ctx?: RouteContext): string { return this.paths.individualRelatedPersonPurgePollPath(ctx); }
  public individualConsentR4BatchPath(ctx: RouteContext): string { return this.paths.individualConsentR4BatchPath(ctx); }
  public individualConsentR4PollPath(ctx: RouteContext): string { return this.paths.individualConsentR4PollPath(ctx); }
  public individualCommunicationBatchPath(ctx: RouteContext, format: string): string { return this.paths.individualCommunicationBatchPath(ctx, format); }
  public individualCommunicationPollPath(ctx: RouteContext, format: string): string { return this.paths.individualCommunicationPollPath(ctx, format); }
  public individualCommunicationSearchPath(ctx: RouteContext): string { return this.paths.individualCommunicationSearchPath(ctx); }
  public individualCommunicationSearchPollPath(ctx: RouteContext): string { return this.paths.individualCommunicationSearchPollPath(ctx); }
  public individualDocumentReferenceBatchPath(ctx: RouteContext): string { return this.paths.individualDocumentReferenceBatchPath(ctx); }
  public individualDocumentReferencePollPath(ctx: RouteContext): string { return this.paths.individualDocumentReferencePollPath(ctx); }
  public individualBundleSearchPath(ctx: RouteContext): string { return this.paths.individualBundleSearchPath(ctx); }
  public individualBundleSearchPollPath(ctx: RouteContext): string { return this.paths.individualBundleSearchPollPath(ctx); }
  public identityTokenExchangePath(ctx: RouteContext): string { return this.paths.identityTokenExchangePath(ctx); }
  public identityTokenExchangePollPath(ctx: RouteContext): string { return this.paths.identityTokenExchangePollPath(ctx); }
  public identityDeviceDcrPath(ctx: RouteContext): string { return this.paths.identityDeviceDcrPath(ctx); }
  public identityDeviceDcrPollPath(ctx: RouteContext): string { return this.paths.identityDeviceDcrPollPath(ctx); }
  public identityOpenIdSmartTokenPath(ctx: RouteContext): string { return this.paths.identityOpenIdSmartTokenPath(ctx); }
  public identityOpenIdSmartTokenPollPath(ctx: RouteContext): string { return this.paths.identityOpenIdSmartTokenPollPath(ctx); }
}

/**
 * @deprecated Prefer `HttpRuntimeClient`.
 */
export class NodeHttpClient extends HttpRuntimeClient {}

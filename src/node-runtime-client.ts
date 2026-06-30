// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.
// Always create JSDoc, do not use strings inline in keys nor values, use types instead, and reuse the data test examples.
import {
  DIDCOMM_PLAINTEXT_JSON_MEDIA_TYPE,
} from 'gdc-common-utils-ts/utils/didcomm-submit';
import type { OrganizationDidBindingInput } from 'gdc-sdk-core-ts';
import type { AppInfo } from 'gdc-sdk-core-ts';
import {
  buildAppHeaders,
  createBootstrapFacade,
  resolveAppInfo,
  type ResolvedAppInfo,
} from 'gdc-sdk-core-ts';

import { buildConsentClaimsSimpleWithCid } from 'gdc-common-utils-ts/utils/consent';
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
  extractOfferIdFromResponseBody,
  extractOfferPreviewFromResponseBody,
} from './order-offer-summary.js';
import { confirmOrganizationLicenseOrderWithDeps, type OrganizationLicenseOrderConfirmInput } from './organization-license-order.js';
import { startIndividualOrganizationWithDeps, type IndividualOrganizationBootstrapInput, type IndividualOrganizationStartResult } from './individual-start.js';
import {
  createOrganizationEmployeeWithDeps,
  disableIndividualMemberWithDeps,
  disableIndividualOrganizationWithDeps,
  disableOrganizationEmployeeWithDeps,
  listIndividualLicenseOffersWithDeps,
  listIndividualLicenseOrdersWithDeps,
  listIndividualLicensesWithDeps,
  listOrganizationLicenseOffersWithDeps,
  listOrganizationLicenseOrdersWithDeps,
  listOrganizationLicensesWithDeps,
  grantProfessionalAccessWithDeps,
  ingestCommunicationAndUpdateIndexWithDeps,
  revokeProfessionalAccessWithDeps,
  searchCommunicationParticipantsWithDeps,
  purgeIndividualMemberWithDeps,
  purgeIndividualOrganizationWithDeps,
  purgeOrganizationEmployeeWithDeps,
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
  type CommunicationParticipantRuntimeSearchInput,
  type ClinicalBundleSearchInput,
  type GrantProfessionalAccessInput,
  type GrantProfessionalAccessResult,
  type IndividualMemberLifecycleInput,
  type IndividualOrganizationLifecycleInput,
  type LicenseListRuntimeSearchInput,
  type LicenseOfferRuntimeSearchInput,
  type LicenseOrderRuntimeSearchInput,
  type OrganizationEmployeeCreationInput,
  type OrganizationEmployeeLifecycleInput,
  type OrganizationEmployeeSearchInput,
  type RevokeProfessionalAccessInput,
  type RevokeProfessionalAccessResult,
  type RelatedPersonUpsertInput,
} from './resource-operations.js';
import type { LegalOrganizationOrderInput } from './host-onboarding.js';
import type { SmartTokenExchangeResult } from './smart-token.js';
import type {
  NodeRuntimeClient,
  PollOptions,
  PollResult,
  SubmitAndPollResult,
  SubmitPayload,
  SubmitResponse,
} from './orchestration/client-port.js';
import { submitAndPollWithMethods } from './orchestration/client-port.js';
import { GwCoreLifecycleAction } from './constants/lifecycle.js';
import {
  buildRuntimeHeaders,
  fetchWithTimeout,
  parseResponseBody,
  pollBatchResponseWithRuntimeConfig,
  postJsonWithRuntimeConfig,
  type RuntimeTransportConfig,
} from './runtime-transport.js';
import {
  activateOrganizationInGatewayFromIcaProofWithDeps,
  submitLegalOrganizationIssueWithDeps,
  submitLegalOrganizationVerificationTransactionWithDeps,
  submitOrganizationDidBindingWithDeps,
} from './runtime-host-submission.js';
import {
  buildHostRegistryPath,
  buildIdentityDeviceDcrPath,
  buildIdentityDeviceDcrPollPath,
  buildIdentityOpenIdSmartTokenPath,
  buildIdentityOpenIdSmartTokenPollPath,
  buildIdentityTokenExchangePath,
  buildIdentityTokenExchangePollPath,
  buildOrganizationDidBindingPath,
  buildOrganizationDidBindingPollPath,
  buildV1Path,
} from './runtime-paths.js';
import {
  requireHostRouteContext,
  requireRouteContext,
  routeCtxFromInput,
  type HostNetworkWarningState,
} from './runtime-route-context.js';
import { runtimeUuid, wrapBundleAsGatewayTransactionMessage } from './runtime-message.js';

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
   * Optional default tenant route context reused by methods such as
   * `requestSmartToken(...)` when callers do not want to repeat
   * tenant/jurisdiction/sector on every call.
   */
  ctx?: RouteContext;
  defaultHeaders?: Record<string, string>;
  requestTimeoutMs?: number;
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
  private readonly httpTraceFile?: string;
  private readonly tokenCache = new Map<string, { accessToken: string; tokenType: string; scopes: string[]; expiresAt: number }>();
  private readonly hostNetworkWarningState: HostNetworkWarningState = {
    warnedDefaultHostNetwork: false,
  };

  private get transportConfig(): RuntimeTransportConfig {
    return {
      baseUrl: this.baseUrl,
      bearerToken: this.bearerToken,
      defaultHeaders: this.defaultHeaders,
      requestTimeoutMs: this.requestTimeoutMs,
      httpTraceFile: this.httpTraceFile,
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
    this.httpTraceFile = String(process.env.SDK_HTTP_TRACE_FILE || '').trim() || undefined;
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
    const routeCtx = this.requireRouteContext(ctx);
    return buildV1Path(routeCtx, section, format, resourceType, action);
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
   *   `meta.claims['org.schema.Offer.identifier']`
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
      submitAndPoll: this.submitAndPoll.bind(this),
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
  public async submitLegalOrganizationIssue(
    hostCtx: HostRouteContext,
    input: NodeLegalOrganizationVerificationTransactionInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return submitLegalOrganizationIssueWithDeps({
      hostCtx,
      verificationInput: input,
      pollOptions,
      createRuntimeUuid: runtimeUuid,
      wrapBundleAsGatewayTransactionMessage: this.wrapBundleAsGatewayTransactionMessage.bind(this),
      submitPath: this.hostRegistryOrganizationIssuePath.bind(this),
      pollPath: this.hostRegistryOrganizationIssuePollPath.bind(this),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
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
   * Commercial contract:
   * - legacy `_activate` is still expected to mint
   *   `meta.claims['org.schema.Offer.identifier']`
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
      hostRegistryOrderBatchPath: this.hostRegistryOrderBatchPath.bind(this),
      hostRegistryOrderPollPath: this.hostRegistryOrderPollPath.bind(this),
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
      submitPath: this.hostRegistryOrganizationDisablePath.bind(this),
      pollPath: this.hostRegistryOrganizationDisablePollPath.bind(this),
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
      submitPath: this.hostRegistryOrganizationPurgePath.bind(this),
      pollPath: this.hostRegistryOrganizationPurgePollPath.bind(this),
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
      submitPath: this.hostRegistryOrganizationDisablePath.bind(this),
      pollPath: this.hostRegistryOrganizationDisablePollPath.bind(this),
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
      submitPath: this.hostRegistryOrganizationPurgePath.bind(this),
      pollPath: this.hostRegistryOrganizationPurgePollPath.bind(this),
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
      employeeBatchPath: this.employeeBatchPath.bind(this),
      employeePollPath: this.employeePollPath.bind(this),
      submitAndPoll: this.submitAndPoll.bind(this),
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
      employeeBatchPath: this.employeeBatchPath.bind(this),
      employeePollPath: this.employeePollPath.bind(this),
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
      employeePurgePath: this.employeePurgePath.bind(this),
      employeePurgePollPath: this.employeePurgePollPath.bind(this),
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
      employeeSearchPath: this.employeeSearchPath.bind(this),
      employeeSearchPollPath: this.employeeSearchPollPath.bind(this),
      submitAndPoll: this.submitAndPoll.bind(this),
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
      organizationLicenseSearchPath: this.organizationLicenseSearchPath.bind(this),
      organizationLicenseSearchPollPath: this.organizationLicenseSearchPollPath.bind(this),
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
      organizationLicenseSearchPath: this.organizationLicenseSearchPath.bind(this),
      organizationLicenseSearchPollPath: this.organizationLicenseSearchPollPath.bind(this),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  public async searchOrganizationLicenseOffers(
    ctx: RouteContext,
    input: LicenseOfferRuntimeSearchInput,
  ): Promise<SubmitAndPollResult> {
    return searchOrganizationLicenseOffersWithDeps(ctx, input, {
      organizationLicenseOfferSearchPath: this.organizationLicenseOfferSearchPath.bind(this),
      organizationLicenseOfferSearchPollPath: this.organizationLicenseOfferSearchPollPath.bind(this),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  public async listOrganizationLicenseOffers(
    ctx: RouteContext,
    input: LicenseOfferRuntimeSearchInput = {},
  ): Promise<SubmitAndPollResult> {
    return listOrganizationLicenseOffersWithDeps(ctx, input, {
      organizationLicenseOfferSearchPath: this.organizationLicenseOfferSearchPath.bind(this),
      organizationLicenseOfferSearchPollPath: this.organizationLicenseOfferSearchPollPath.bind(this),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  public async searchOrganizationLicenseOrders(
    ctx: RouteContext,
    input: LicenseOrderRuntimeSearchInput,
  ): Promise<SubmitAndPollResult> {
    return searchOrganizationLicenseOrdersWithDeps(ctx, input, {
      organizationLicenseOrderSearchPath: this.organizationLicenseOrderSearchPath.bind(this),
      organizationLicenseOrderSearchPollPath: this.organizationLicenseOrderSearchPollPath.bind(this),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  public async listOrganizationLicenseOrders(
    ctx: RouteContext,
    input: LicenseOrderRuntimeSearchInput = {},
  ): Promise<SubmitAndPollResult> {
    return listOrganizationLicenseOrdersWithDeps(ctx, input, {
      organizationLicenseOrderSearchPath: this.organizationLicenseOrderSearchPath.bind(this),
      organizationLicenseOrderSearchPollPath: this.organizationLicenseOrderSearchPollPath.bind(this),
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
      hostRegistryOrderBatchPath: this.hostRegistryOrderBatchPath.bind(this),
      hostRegistryOrderPollPath: this.hostRegistryOrderPollPath.bind(this),
      submitAndPoll: this.submitAndPoll.bind(this),
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
    const routeCtx = this.routeCtxFromInput(input);
    return startIndividualOrganizationWithDeps({
      input,
      routeCtx,
      individualFamilyOrganizationBatchPath: this.individualFamilyOrganizationTransactionPath.bind(this),
      individualFamilyOrganizationPollPath: this.individualFamilyOrganizationTransactionPollPath.bind(this),
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
      individualFamilyOrganizationSearchPath: this.individualFamilyOrganizationSearchPath.bind(this),
      individualFamilyOrganizationSearchPollPath: this.individualFamilyOrganizationSearchPollPath.bind(this),
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
      individualFamilyOrganizationSearchPath: this.individualFamilyOrganizationSearchPath.bind(this),
      individualFamilyOrganizationSearchPollPath: this.individualFamilyOrganizationSearchPollPath.bind(this),
      individualFamilyOrganizationBatchPath: this.individualFamilyOrganizationTransactionPath.bind(this),
      individualFamilyOrganizationPollPath: this.individualFamilyOrganizationTransactionPollPath.bind(this),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  /**
   * Confirms the order returned by `startIndividualOrganization(...)`.
   */
  public async confirmIndividualOrganizationOrder(input: IndividualOrganizationConfirmOrderInput): Promise<SubmitAndPollResult> {
    const routeCtx = this.routeCtxFromInput(input);
    return confirmIndividualOrganizationOrderWithDeps({
      input,
      routeCtx,
      individualFamilyOrderBatchPath: this.individualFamilyOrderBatchPath.bind(this),
      individualFamilyOrderPollPath: this.individualFamilyOrderPollPath.bind(this),
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
      individualOrganizationDisablePath: this.individualFamilyOrganizationDisablePath.bind(this),
      individualOrganizationDisablePollPath: this.individualFamilyOrganizationDisablePollPath.bind(this),
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
      individualOrganizationPurgePath: this.individualFamilyOrganizationPurgePath.bind(this),
      individualOrganizationPurgePollPath: this.individualFamilyOrganizationPurgePollPath.bind(this),
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
      individualRelatedPersonBatchPath: this.individualRelatedPersonBatchPath.bind(this),
      individualRelatedPersonPollPath: this.individualRelatedPersonPollPath.bind(this),
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
      individualLicenseSearchPath: this.individualLicenseSearchPath.bind(this),
      individualLicenseSearchPollPath: this.individualLicenseSearchPollPath.bind(this),
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
      individualLicenseSearchPath: this.individualLicenseSearchPath.bind(this),
      individualLicenseSearchPollPath: this.individualLicenseSearchPollPath.bind(this),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  public async searchIndividualLicenseOffers(
    ctx: RouteContext,
    input: LicenseOfferRuntimeSearchInput,
  ): Promise<SubmitAndPollResult> {
    return searchIndividualLicenseOffersWithDeps(ctx, input, {
      individualLicenseOfferSearchPath: this.individualLicenseOfferSearchPath.bind(this),
      individualLicenseOfferSearchPollPath: this.individualLicenseOfferSearchPollPath.bind(this),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  public async listIndividualLicenseOffers(
    ctx: RouteContext,
    input: LicenseOfferRuntimeSearchInput = {},
  ): Promise<SubmitAndPollResult> {
    return listIndividualLicenseOffersWithDeps(ctx, input, {
      individualLicenseOfferSearchPath: this.individualLicenseOfferSearchPath.bind(this),
      individualLicenseOfferSearchPollPath: this.individualLicenseOfferSearchPollPath.bind(this),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  public async searchIndividualLicenseOrders(
    ctx: RouteContext,
    input: LicenseOrderRuntimeSearchInput,
  ): Promise<SubmitAndPollResult> {
    return searchIndividualLicenseOrdersWithDeps(ctx, input, {
      individualLicenseOrderSearchPath: this.individualLicenseOrderSearchPath.bind(this),
      individualLicenseOrderSearchPollPath: this.individualLicenseOrderSearchPollPath.bind(this),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  public async listIndividualLicenseOrders(
    ctx: RouteContext,
    input: LicenseOrderRuntimeSearchInput = {},
  ): Promise<SubmitAndPollResult> {
    return listIndividualLicenseOrdersWithDeps(ctx, input, {
      individualLicenseOrderSearchPath: this.individualLicenseOrderSearchPath.bind(this),
      individualLicenseOrderSearchPollPath: this.individualLicenseOrderSearchPollPath.bind(this),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
  }

  /**
   * Placeholder for a future GW CORE member/caregiver lifecycle contract.
   *
   * Current GW CORE does not yet expose a stable lifecycle route for
   * `RelatedPerson` / individual-member purge.
   */
  public async purgeIndividualMember(
    ctx: RouteContext,
    input: IndividualMemberLifecycleInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return purgeIndividualMemberWithDeps(ctx, input, pollOptions, {
      individualRelatedPersonPurgePath: this.individualRelatedPersonPurgePath.bind(this),
      individualRelatedPersonPurgePollPath: this.individualRelatedPersonPurgePollPath.bind(this),
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
      individualConsentR4BatchPath: this.individualConsentR4BatchPath.bind(this),
      individualConsentR4PollPath: this.individualConsentR4PollPath.bind(this),
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
      individualConsentR4BatchPath: this.individualConsentR4BatchPath.bind(this),
      individualConsentR4PollPath: this.individualConsentR4PollPath.bind(this),
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
    const routeCtx = this.routeCtxFromInput(input);
    return requestSmartTokenWithDeps({
      input,
      routeCtx,
      baseUrl: this.baseUrl,
      defaultTimeoutMs: undefined,
      defaultIntervalMs: undefined,
      identityTokenExchangePath: this.identityTokenExchangePath.bind(this),
      identityTokenExchangePollPath: this.identityTokenExchangePollPath.bind(this),
      identityOpenIdSmartTokenPath: this.identityOpenIdSmartTokenPath.bind(this),
      identityOpenIdSmartTokenPollPath: this.identityOpenIdSmartTokenPollPath.bind(this),
      submitAndPoll: this.submitAndPoll.bind(this),
      setTokenCache: (tokenCacheKey, token) => this.tokenCache.set(tokenCacheKey, token),
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
      individualRelatedPersonBatchPath: this.individualRelatedPersonBatchPath.bind(this),
      individualRelatedPersonPollPath: this.individualRelatedPersonPollPath.bind(this),
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
    return ingestCommunicationAndUpdateIndexWithDeps(ctx, input, {
      individualCommunicationBatchPath: this.individualCommunicationBatchPath.bind(this),
      individualCommunicationPollPath: this.individualCommunicationPollPath.bind(this),
      submitAndPoll: this.submitAndPoll.bind(this),
    });
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
      communicationSearchPath: this.individualCommunicationSearchPath.bind(this),
      communicationSearchPollPath: this.individualCommunicationSearchPollPath.bind(this),
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
   * Executes a clinical `Bundle/_search` through the converged runtime.
   *
   * @param ctx Route context containing tenant/jurisdiction/sector.
   * @param input Search parameters such as subject, section, date and included resource types.
   */
  public async searchClinicalBundle(
    ctx: RouteContext,
    input: ClinicalBundleSearchInput,
  ): Promise<SubmitAndPollResult> {
    return searchClinicalBundleWithDeps(ctx, input, {
      bundleSearchPath: this.individualBundleSearchPath.bind(this),
      bundleSearchPollPath: this.individualBundleSearchPollPath.bind(this),
      submitAndPoll: this.submitAndPoll.bind(this),
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
    return buildConsentClaimsSimpleWithCid(
      {
        subjectDid: input.subjectDid,
        subjectPhone: input.subjectPhone,
        subjectGivenName: input.subjectGivenName,
        actor: input.actorId ?? input.actor ?? '',
        actorRole: String(input?.actorRole || ''),
        purpose: String(input?.purpose || ''),
        actions: Array.isArray(input?.actions) ? input.actions : [],
        consentIdentifier: input.consentIdentifier,
        consentDate: input.consentDate,
        decision: input.decision,
        attachmentContentType: input.attachmentContentType,
        attachmentBase64: input.attachmentBase64,
      },
      {
        errorPrefix: 'grantProfessionalAccess:',
        consentIdentifierFactory: () => `urn:uuid:${runtimeUuid()}`,
      },
    );
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

  private requireRouteContext(ctx?: RouteContext): RouteContext {
    return requireRouteContext(ctx, this.ctx);
  }

  private routeCtxFromInput(input: { serviceProviderDid?: string; tenantId?: string; jurisdiction?: string; sector?: string }): RouteContext {
    return routeCtxFromInput(input, this.ctx);
  }

  /**
   * Reuses the shared bundle business contract while keeping attachment
   * transport fields at the DIDComm/plaintext message layer expected by GW.
   */
  private wrapBundleAsGatewayTransactionMessage(input: Readonly<Parameters<typeof wrapBundleAsGatewayTransactionMessage>[0]>): SubmitPayload {
    return wrapBundleAsGatewayTransactionMessage(input);
  }

  private hostRegistryPath(ctx: HostRouteContext | undefined, resourceType: string, action: string): string {
    const hostCtx = this.requireHostRouteContext(ctx);
    return buildHostRegistryPath(hostCtx, resourceType, action);
  }
  /**
   * Resolves the host route segment without allowing tenant-route `sector`
   * semantics to leak into host onboarding.
   *
   * Step by step:
   * - host routes use `/host/cds-{jurisdiction}/v1/{host-network}`
   * - tenant routes use `/{tenantId}/cds-{jurisdiction}/v1/{tenant-sector}`
   * - passing the host segment under `sector` is rejected because that name is
   *   reserved for tenant business sectors such as `health-care`
   * - compatibility code may still pass `hostNetworkOrTenantSector`, but the
   *   value must still be one of the allowed host runtime/network selectors
   */
  private requireHostRouteContext(ctx?: HostRouteContext): HostRouteContext {
    return requireHostRouteContext(ctx, {
      defaultJurisdiction: this.ctx?.jurisdiction,
      warningState: this.hostNetworkWarningState,
      warn: (message: string) => console.warn(message),
    });
  }

  public hostRegistryOrganizationTransactionPath(ctx?: HostRouteContext): string { return this.hostRegistryPath(ctx, 'Organization', GwCoreLifecycleAction.Transaction); }
  public hostRegistryOrganizationTransactionPollPath(ctx?: HostRouteContext): string { return this.hostRegistryPath(ctx, 'Organization', GwCoreLifecycleAction.TransactionResponse); }
  public hostRegistryOrganizationIssuePath(ctx?: HostRouteContext): string { return this.hostRegistryPath(ctx, 'Organization', GwCoreLifecycleAction.Issue); }
  public hostRegistryOrganizationIssuePollPath(ctx?: HostRouteContext): string { return this.hostRegistryPath(ctx, 'Organization', GwCoreLifecycleAction.IssueResponse); }
  public hostRegistryOrganizationActivatePath(ctx?: HostRouteContext): string { return this.hostRegistryPath(ctx, 'Organization', '_activate'); }
  public hostRegistryOrganizationActivatePollPath(ctx?: HostRouteContext): string { return this.hostRegistryPath(ctx, 'Organization', '_activate-response'); }
  public hostRegistryOrganizationDisablePath(ctx?: HostRouteContext): string { return this.hostRegistryPath(ctx, 'Organization', GwCoreLifecycleAction.Disable); }
  public hostRegistryOrganizationDisablePollPath(ctx?: HostRouteContext): string { return this.hostRegistryPath(ctx, 'Organization', `${GwCoreLifecycleAction.Disable}-response`); }
  public hostRegistryOrganizationPurgePath(ctx?: HostRouteContext): string { return this.hostRegistryPath(ctx, 'Organization', GwCoreLifecycleAction.Purge); }
  public hostRegistryOrganizationPurgePollPath(ctx?: HostRouteContext): string { return this.hostRegistryPath(ctx, 'Organization', `${GwCoreLifecycleAction.Purge}-response`); }
  public hostRegistryOrderBatchPath(ctx?: HostRouteContext): string { return this.hostRegistryPath(ctx, 'Order', '_batch'); }
  public hostRegistryOrderPollPath(ctx?: HostRouteContext): string { return this.hostRegistryPath(ctx, 'Order', '_batch-response'); }
  public employeeBatchPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'entity', 'org.schema', 'Employee', GwCoreLifecycleAction.Batch); }
  public employeePollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'entity', 'org.schema', 'Employee', GwCoreLifecycleAction.BatchResponse); }
  public employeeSearchPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'entity', 'org.schema', 'Employee', '_search'); }
  public employeeSearchPollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'entity', 'org.schema', 'Employee', '_search-response'); }
  public organizationLicenseSearchPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'entity', 'org.schema', 'License', '_search'); }
  public organizationLicenseSearchPollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'entity', 'org.schema', 'License', '_search-response'); }
  public organizationDidBindingPath(ctx?: RouteContext): string {
    return buildOrganizationDidBindingPath(this.requireRouteContext(ctx));
  }
  public organizationDidBindingPollPath(ctx?: RouteContext): string {
    return buildOrganizationDidBindingPollPath(this.requireRouteContext(ctx));
  }
  public organizationLicenseOfferSearchPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'entity', 'org.schema', 'Offer', '_search'); }
  public organizationLicenseOfferSearchPollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'entity', 'org.schema', 'Offer', '_search-response'); }
  public organizationLicenseOrderSearchPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'entity', 'org.schema', 'Order', '_search'); }
  public organizationLicenseOrderSearchPollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'entity', 'org.schema', 'Order', '_search-response'); }
  public employeePurgePath(ctx?: RouteContext): string { return this.v1Path(ctx, 'entity', 'org.schema', 'Employee', GwCoreLifecycleAction.Purge); }
  public employeePurgePollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'entity', 'org.schema', 'Employee', `${GwCoreLifecycleAction.Purge}-response`); }
  public individualFamilyOrganizationBatchPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Organization', GwCoreLifecycleAction.Batch); }
  public individualFamilyOrganizationPollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Organization', GwCoreLifecycleAction.BatchResponse); }
  public individualFamilyOrganizationSearchPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Organization', '_search'); }
  public individualFamilyOrganizationSearchPollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Organization', '_search-response'); }
  public individualFamilyOrganizationTransactionPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Organization', GwCoreLifecycleAction.Transaction); }
  public individualFamilyOrganizationTransactionPollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Organization', GwCoreLifecycleAction.TransactionResponse); }
  public individualFamilyOrganizationDisablePath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Organization', GwCoreLifecycleAction.Disable); }
  public individualFamilyOrganizationDisablePollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Organization', `${GwCoreLifecycleAction.Disable}-response`); }
  public individualFamilyOrganizationPurgePath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Organization', GwCoreLifecycleAction.Purge); }
  public individualFamilyOrganizationPurgePollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Organization', `${GwCoreLifecycleAction.Purge}-response`); }
  public individualLicenseSearchPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'License', '_search'); }
  public individualLicenseSearchPollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'License', '_search-response'); }
  public individualLicenseOfferSearchPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Offer', '_search'); }
  public individualLicenseOfferSearchPollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Offer', '_search-response'); }
  public individualLicenseOrderSearchPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Order', '_search'); }
  public individualLicenseOrderSearchPollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Order', '_search-response'); }
  public individualFamilyOrderBatchPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Order', '_batch'); }
  public individualFamilyOrderPollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Order', '_batch-response'); }
  public individualRelatedPersonBatchPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.hl7.fhir.r4', 'RelatedPerson', '_batch'); }
  public individualRelatedPersonPollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.hl7.fhir.r4', 'RelatedPerson', '_batch-response'); }
  public individualRelatedPersonPurgePath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.hl7.fhir.r4', 'RelatedPerson', '_purge'); }
  public individualRelatedPersonPurgePollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.hl7.fhir.r4', 'RelatedPerson', '_purge-response'); }
  public individualConsentR4BatchPath(ctx: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.hl7.fhir.r4', 'Consent', '_batch'); }
  public individualConsentR4PollPath(ctx: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.hl7.fhir.r4', 'Consent', '_batch-response'); }
  public individualCommunicationBatchPath(ctx: RouteContext, format: 'org.hl7.fhir.api' | 'org.hl7.fhir.r4'): string { return this.v1Path(ctx, 'individual', format, 'Communication', '_batch'); }
  public individualCommunicationPollPath(ctx: RouteContext, format: 'org.hl7.fhir.api' | 'org.hl7.fhir.r4'): string { return this.v1Path(ctx, 'individual', format, 'Communication', '_batch-response'); }
  public individualCommunicationSearchPath(ctx: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.hl7.fhir.r4', 'Communication', '_search'); }
  public individualCommunicationSearchPollPath(ctx: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.hl7.fhir.r4', 'Communication', '_search-response'); }
  public individualBundleSearchPath(ctx: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.hl7.fhir.r4', 'Bundle', '_search'); }
  public individualBundleSearchPollPath(ctx: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.hl7.fhir.r4', 'Bundle', '_search-response'); }
  public identityTokenExchangePath(ctx: RouteContext): string {
    return buildIdentityTokenExchangePath(ctx);
  }
  public identityTokenExchangePollPath(ctx: RouteContext): string {
    return buildIdentityTokenExchangePollPath(ctx);
  }
  public identityDeviceDcrPath(ctx: RouteContext): string {
    return buildIdentityDeviceDcrPath(ctx);
  }
  public identityDeviceDcrPollPath(ctx: RouteContext): string {
    return buildIdentityDeviceDcrPollPath(ctx);
  }
  public identityOpenIdSmartTokenPath(ctx: RouteContext): string {
    return buildIdentityOpenIdSmartTokenPath(ctx);
  }
  public identityOpenIdSmartTokenPollPath(ctx: RouteContext): string {
    return buildIdentityOpenIdSmartTokenPollPath(ctx);
  }
}

/**
 * @deprecated Prefer `HttpRuntimeClient`.
 */
export class NodeHttpClient extends HttpRuntimeClient {}

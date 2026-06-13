// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.
// Always create JSDoc, do not use strings inline in keys nor values, use types instead, and reuse the data test examples.
import fs from 'node:fs';
import path from 'node:path';
import type {
  AppInfo,
  OrganizationActivationDraft,
} from 'gdc-sdk-core-ts';
import {
  buildAppHeaders,
  createBootstrapFacade,
  resolveAppInfo,
  type ResolvedAppInfo,
} from 'gdc-sdk-core-ts';

import { buildConsentClaimsSimpleWithCid } from 'gdc-common-utils-ts/utils/consent';
import { pollUntilCompleteWithMethod } from './async-polling.js';
import { confirmLegalOrganizationOrderWithDeps, type HostRouteContext } from './host-onboarding.js';
import type { NodeOrganizationActivationInput } from './orchestration/client-port.js';
import {
  confirmIndividualOrganizationOrderWithDeps,
  type IndividualOrganizationConfirmOrderInput,
  type RouteContext,
} from './individual-onboarding.js';
import { requestSmartTokenWithDeps, type SmartTokenRequestInput } from './smart-token.js';
import {
  extractOfferIdFromResponseBody,
  extractOfferPreviewFromResponseBody,
} from './order-offer-summary.js';
import { startIndividualOrganizationWithDeps, type IndividualOrganizationBootstrapInput, type IndividualOrganizationStartResult } from './individual-start.js';
import {
  createOrganizationEmployeeWithDeps,
  disableIndividualMemberWithDeps,
  disableIndividualOrganizationWithDeps,
  disableOrganizationEmployeeWithDeps,
  grantProfessionalAccessWithDeps,
  ingestCommunicationAndUpdateIndexWithDeps,
  purgeIndividualMemberWithDeps,
  purgeIndividualOrganizationWithDeps,
  purgeOrganizationEmployeeWithDeps,
  searchOrganizationEmployeesWithDeps,
  searchClinicalBundleWithDeps,
  searchLatestIpsWithDeps,
  upsertRelatedPersonAndPollWithDeps,
  type CommunicationIngestionInput,
  type ClinicalBundleSearchInput,
  type GrantProfessionalAccessInput,
  type GrantProfessionalAccessResult,
  type IndividualMemberLifecycleInput,
  type IndividualOrganizationLifecycleInput,
  type OrganizationEmployeeCreationInput,
  type OrganizationEmployeeLifecycleInput,
  type OrganizationEmployeeSearchInput,
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
    return `/${encodeURIComponent(routeCtx.tenantId)}/cds-${encodeURIComponent(routeCtx.jurisdiction)}/v1/${encodeURIComponent(routeCtx.sector)}/${encodeURIComponent(section)}/${encodeURIComponent(format)}/${encodeURIComponent(resourceType)}/${encodeURIComponent(action)}`;
  }

  /**
   * Submits a batch payload to a gateway batch endpoint.
   */
  public async submitBatch(path: string, payload: SubmitPayload): Promise<SubmitResponse> {
    return this.postJson(path, payload, 'application/didcomm-plaintext+json');
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
   * Activates a legal organization in the gateway host registry using an ICA
   * proof token already obtained by the caller.
   */
  public async activateOrganizationInGatewayFromIcaProof(
    hostCtx: HostRouteContext,
    input: NodeOrganizationActivationInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    const thid = `activate-org-${runtimeUuid()}`;
    const activationDraft: OrganizationActivationDraft = bootstrapFacade.createOrganizationActivationDraft({
      vpToken: input.vpToken,
      controller: input.controller,
      service: input.service,
      additionalClaims: input.additionalClaims,
    });
    const serviceClaims = activationDraft.buildServiceClaims();
    const payload: SubmitPayload = {
      thid,
      iss: String(hostCtx.controllerDid || '').trim() || undefined,
      aud: String(hostCtx.hostDid || '').trim() || undefined,
      type: 'application/api+json',
      body: {
        vp_token: input.vpToken,
        ...(input.controller ? { controller: input.controller } : {}),
        data: [{
          type: 'Organization-activation-request-v1.0',
          meta: {
            claims: {
              '@context': 'org.schema',
              ...serviceClaims,
              ...(input.additionalClaims || {}),
            },
          },
          resource: {
            meta: {
              claims: {
                '@context': 'org.schema',
                ...serviceClaims,
                ...(input.additionalClaims || {}),
              },
            },
          },
        }],
      },
    };
    return this.submitAndPoll(this.hostRegistryOrganizationActivatePath(hostCtx), this.hostRegistryOrganizationActivatePollPath(hostCtx), payload, pollOptions);
  }

  /**
   * Confirms a host-side legal organization order after the initial activation.
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
   * Starts the onboarding flow for an individual-oriented tenant or index.
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
    const response = await this.fetchWithTimeout(path, {
      method: 'POST',
      headers: this.buildHeaders('application/json'),
      body: JSON.stringify(request),
    });
    const retryAfter = Number(response.headers.get('retry-after'));
    return {
      status: response.status,
      body: await this.parseResponseBody(response),
      retryAfterMs: Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined,
    };
  }

  private async postJson(path: string, payload: unknown, contentType: string): Promise<SubmitResponse> {
    const response = await this.fetchWithTimeout(path, {
      method: 'POST',
      headers: this.buildHeaders(contentType),
      body: JSON.stringify(payload),
    });
    return { status: response.status, location: response.headers.get('location') || undefined, body: await this.parseResponseBody(response) };
  }

  private buildHeaders(contentType: string): Record<string, string> {
    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      'Content-Type': contentType,
      Accept: 'application/json, application/didcomm-plaintext+json, */*',
    };
    if (this.bearerToken) headers.Authorization = `Bearer ${this.bearerToken}`;
    return headers;
  }

  private async fetchWithTimeout(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    const url = /^https?:\/\//.test(path) ? path : `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const requestBody = this.parseTraceBody(init.body);
    const traceBase = {
      ts: new Date().toISOString(),
      request: {
        url,
        method: String(init.method || 'GET').toUpperCase(),
        headers: this.redactTraceValue(init.headers || {}),
        body: this.redactTraceValue(requestBody),
      },
    };
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const responseClone = response.clone();
      const responseRaw = await responseClone.text();
      this.appendHttpTrace({
        ...traceBase,
        response: {
          status: response.status,
          headers: this.redactTraceValue(Object.fromEntries(response.headers.entries())),
          body: this.redactTraceValue(this.parseTraceRawText(responseRaw)),
        },
      });
      return response;
    } catch (error) {
      this.appendHttpTrace({
        ...traceBase,
        error: {
          name: error instanceof Error ? error.name : 'Error',
          message: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async parseResponseBody(response: Response): Promise<unknown> {
    const raw = await response.text();
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  private requireRouteContext(ctx?: RouteContext): RouteContext {
    const resolved = ctx || this.ctx;
    const tenantId = String(resolved?.tenantId || '').trim();
    const jurisdiction = String(resolved?.jurisdiction || '').trim();
    const sector = String(resolved?.sector || '').trim();
    if (!tenantId || !jurisdiction || !sector) {
      throw new Error('Route context is required.');
    }
    return { tenantId, jurisdiction, sector };
  }

  private routeCtxFromInput(input: { serviceProviderDid?: string; tenantId?: string; jurisdiction?: string; sector?: string }): RouteContext {
    const tenantId = String(input.serviceProviderDid || input.tenantId || '').trim();
    return this.requireRouteContext(
      tenantId && input.jurisdiction && input.sector
        ? { tenantId, jurisdiction: input.jurisdiction, sector: input.sector }
        : undefined,
    );
  }

  private hostRegistryPath(ctx: HostRouteContext | undefined, resourceType: string, action: string): string {
    const hostCtx = this.requireHostRouteContext(ctx);
    return `/host/cds-${encodeURIComponent(hostCtx.jurisdiction)}/v1/${encodeURIComponent(hostCtx.hostNetwork || '')}/registry/org.schema/${encodeURIComponent(resourceType)}/${encodeURIComponent(action)}`;
  }
  private requireHostRouteContext(ctx?: HostRouteContext): HostRouteContext {
    const runtimeCtx = (this.ctx || {}) as { jurisdiction?: string; sector?: string; hostNetwork?: string };
    const jurisdiction = String(ctx?.jurisdiction || this.ctx?.jurisdiction || '').trim();
    const hostNetwork = String(ctx?.hostNetwork || ctx?.sector || runtimeCtx.hostNetwork || runtimeCtx.sector || '').trim();
    if (!jurisdiction || !hostNetwork) throw new Error('Host route context is required.');
    return { jurisdiction, hostNetwork };
  }

  public hostRegistryOrganizationActivatePath(ctx?: HostRouteContext): string { return this.hostRegistryPath(ctx, 'Organization', '_activate'); }
  public hostRegistryOrganizationActivatePollPath(ctx?: HostRouteContext): string { return this.hostRegistryPath(ctx, 'Organization', '_activate-response'); }
  public hostRegistryOrderBatchPath(ctx?: HostRouteContext): string { return this.hostRegistryPath(ctx, 'Order', '_batch'); }
  public hostRegistryOrderPollPath(ctx?: HostRouteContext): string { return this.hostRegistryPath(ctx, 'Order', '_batch-response'); }
  public employeeBatchPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'entity', 'org.schema', 'Employee', GwCoreLifecycleAction.Batch); }
  public employeePollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'entity', 'org.schema', 'Employee', GwCoreLifecycleAction.BatchResponse); }
  public employeeSearchPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'entity', 'org.schema', 'Employee', '_search'); }
  public employeeSearchPollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'entity', 'org.schema', 'Employee', '_search-response'); }
  public employeePurgePath(ctx?: RouteContext): string { return this.v1Path(ctx, 'entity', 'org.schema', 'Employee', GwCoreLifecycleAction.Purge); }
  public employeePurgePollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'entity', 'org.schema', 'Employee', `${GwCoreLifecycleAction.Purge}-response`); }
  public individualFamilyOrganizationBatchPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Organization', GwCoreLifecycleAction.Batch); }
  public individualFamilyOrganizationPollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Organization', GwCoreLifecycleAction.BatchResponse); }
  public individualFamilyOrganizationTransactionPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Organization', GwCoreLifecycleAction.Transaction); }
  public individualFamilyOrganizationTransactionPollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Organization', GwCoreLifecycleAction.TransactionResponse); }
  public individualFamilyOrganizationDisablePath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Organization', GwCoreLifecycleAction.Disable); }
  public individualFamilyOrganizationDisablePollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Organization', `${GwCoreLifecycleAction.Disable}-response`); }
  public individualFamilyOrganizationPurgePath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Organization', GwCoreLifecycleAction.Purge); }
  public individualFamilyOrganizationPurgePollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Organization', `${GwCoreLifecycleAction.Purge}-response`); }
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
  public individualBundleSearchPath(ctx: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.hl7.fhir.r4', 'Bundle', '_search'); }
  public individualBundleSearchPollPath(ctx: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.hl7.fhir.r4', 'Bundle', '_search-response'); }
  public identityTokenExchangePath(ctx: RouteContext): string {
    return `/${encodeURIComponent('host')}/cds-${encodeURIComponent(ctx.jurisdiction)}/v1/${encodeURIComponent(ctx.sector)}/${encodeURIComponent(ctx.tenantId)}/identity/auth/_exchange`;
  }
  public identityTokenExchangePollPath(ctx: RouteContext): string {
    return `/${encodeURIComponent('host')}/cds-${encodeURIComponent(ctx.jurisdiction)}/v1/${encodeURIComponent(ctx.sector)}/${encodeURIComponent(ctx.tenantId)}/identity/auth/_exchange-response`;
  }
  public identityOpenIdSmartTokenPath(ctx: RouteContext): string {
    return `/${encodeURIComponent(ctx.tenantId)}/cds-${encodeURIComponent(ctx.jurisdiction)}/v1/${encodeURIComponent(ctx.sector)}/identity/openid/smart/token`;
  }
  public identityOpenIdSmartTokenPollPath(ctx: RouteContext): string {
    return `/${encodeURIComponent(ctx.tenantId)}/cds-${encodeURIComponent(ctx.jurisdiction)}/v1/${encodeURIComponent(ctx.sector)}/identity/openid/smart/_batch-response`;
  }

  private appendHttpTrace(entry: Record<string, unknown>): void {
    if (!this.httpTraceFile) return;
    try {
      fs.mkdirSync(path.dirname(this.httpTraceFile), { recursive: true });
      fs.appendFileSync(this.httpTraceFile, `${JSON.stringify(entry)}\n`);
    } catch {
      // Tracing must never break runtime requests.
    }
  }

  private parseTraceBody(body: BodyInit | null | undefined): unknown {
    if (body == null) return undefined;
    if (typeof body === 'string') return this.parseTraceRawText(body);
    if (body instanceof URLSearchParams) return Object.fromEntries(body.entries());
    return '[non-text-body]';
  }

  private parseTraceRawText(raw: string): unknown {
    if (!raw) return '';
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  private redactTraceValue<T>(value: T): T {
    if (value === undefined) return value;
    const serialized = JSON.stringify(value, (key, nestedValue) => {
      if (/token|authorization|secret|password/i.test(String(key || ''))) {
        return '[redacted]';
      }
      return nestedValue;
    });
    return serialized === undefined ? value : JSON.parse(serialized);
  }
}

/**
 * @deprecated Prefer `HttpRuntimeClient`.
 */
export class NodeHttpClient extends HttpRuntimeClient {}

function runtimeUuid(): string {
  const fromCrypto = globalThis.crypto?.randomUUID?.();
  if (fromCrypto) return fromCrypto;
  return `fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

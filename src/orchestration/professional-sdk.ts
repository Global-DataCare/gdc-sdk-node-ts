// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.
import type { ControllerBindingInput } from 'gdc-common-utils-ts/models';

import {
  requireClientMethod,
  submitAndPollWithClient,
  type NodeRuntimeClient,
  type PollOptions,
  type SubmitAndPollResult,
  type SubmitPayload,
} from './client-port.js';
import type { HostRouteContext } from '../host-onboarding.js';
import type { RouteContext } from '../individual-onboarding.js';
import type { EmployeeDeviceActivationResult, EmployeeDeviceActivationRequestInput } from '../device-activation.js';
import type { SmartTokenExchangeResult, SmartTokenRequestInput } from '../smart-token.js';
import type { CommunicationIngestionInput, GrantProfessionalAccessInput, GrantProfessionalAccessResult, OrganizationEmployeeCreationInput } from '../resource-operations.js';

/**
 * Professional-oriented facade combining host onboarding, employee bootstrap,
 * consent, communication, and SMART token runtime calls.
 */
export class ProfessionalSdk {
  /**
   * @param client Runtime client implementation used to submit and poll GW flows.
   */
  constructor(private readonly client: NodeRuntimeClient) {}

  /**
   * Activates the legal organization in the gateway from an ICA-issued proof token.
   */
  public activateOrganizationInGatewayFromIcaProof(
    hostCtx: HostRouteContext,
    input: { vpToken: string; controller?: ControllerBindingInput; additionalClaims?: Record<string, unknown> },
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'activateOrganizationInGatewayFromIcaProof')(hostCtx, input, pollOptions);
  }

  /**
   * Creates an employee/professional under the current organization tenant.
   */
  public createOrganizationEmployee(
    ctx: RouteContext,
    input: OrganizationEmployeeCreationInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'createOrganizationEmployee')(ctx, input, pollOptions);
  }

  /**
   * Activates the current employee device from a previously issued activation request.
   */
  public activateEmployeeDeviceWithActivationRequest(input: EmployeeDeviceActivationRequestInput): Promise<EmployeeDeviceActivationResult> {
    return requireClientMethod(this.client, 'activateEmployeeDeviceWithActivationRequest')(input);
  }

  /**
   * Requests a SMART token suitable for subsequent clinical/document calls.
   *
   * In the canonical flow the caller normally provides:
   * - `actorDid`
   * - `subjectDid`
   * - requested `scopes`
   *
   * Tenant route context can be inherited from the configured
   * `NodeHttpClient({ ctx })` instead of being repeated on every call.
   */
  public requestSmartToken(input: SmartTokenRequestInput): Promise<SmartTokenExchangeResult> {
    return requireClientMethod(this.client, 'requestSmartToken')(input);
  }

  /**
   * Ingests a FHIR `Communication` and waits for indexing.
   */
  public ingestCommunicationAndUpdateIndex(ctx: RouteContext, input: CommunicationIngestionInput): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'ingestCommunicationAndUpdateIndex')(ctx, input);
  }

  /**
   * Grants access to a professional through a consent flow.
   */
  public grantProfessionalAccess(ctx: RouteContext, input: GrantProfessionalAccessInput): Promise<GrantProfessionalAccessResult> {
    return requireClientMethod(this.client, 'grantProfessionalAccess')(ctx, input);
  }

  /**
   * Low-level escape hatch for direct submit/poll flows.
   */
  public submitAndPoll(
    submitPath: string,
    pollPath: string,
    payload: SubmitPayload,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return submitAndPollWithClient(this.client, submitPath, pollPath, payload, pollOptions);
  }
}

// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import {
  requireClientMethod,
  submitAndPollWithClient,
  type NodeRuntimeClient,
  type PollOptions,
  type SubmitAndPollResult,
  type SubmitPayload,
} from './client-port.js';
import type { RouteContext } from '../individual-onboarding.js';
import type { EmployeeDeviceActivationResult, EmployeeDeviceActivationRequestInput } from '../device-activation.js';
import type { SmartTokenExchangeResult, SmartTokenRequestInput } from '../smart-token.js';
import type { CommunicationIngestionInput, GrantProfessionalAccessInput, GrantProfessionalAccessResult, OrganizationEmployeeCreationInput } from '../resource-operations.js';

/**
 * Organization-controller oriented facade over a `NodeRuntimeClient`.
 *
 * Use this class when the caller already knows it is acting as an organization
 * controller/admin and wants the smallest API surface for that role.
 */
export class OrganizationControllerSdk {
  /**
   * @param client Runtime client implementation used to submit and poll GW flows.
   */
  constructor(private readonly client: NodeRuntimeClient) {}

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
   * Activates the employee device from a previously issued activation request.
   */
  public activateEmployeeDeviceWithActivationRequest(input: EmployeeDeviceActivationRequestInput): Promise<EmployeeDeviceActivationResult> {
    return requireClientMethod(this.client, 'activateEmployeeDeviceWithActivationRequest')(input);
  }

  /**
   * Requests a SMART token for the current organization-scoped actor.
   *
   * The actor identity should normally be passed as `actorDid`, while route
   * details should come from the client default context unless legacy
   * compatibility requires overriding them on the call.
   */
  public requestSmartToken(input: SmartTokenRequestInput): Promise<SmartTokenExchangeResult> {
    return requireClientMethod(this.client, 'requestSmartToken')(input);
  }

  /**
   * Ingests a `Communication` and waits for indexing.
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

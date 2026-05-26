// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.
// Always create JSDoc, do not use strings inline in keys nor values, use types instead, and reuse the data test examples.
import {
  requireClientMethod,
  submitAndPollWithClient,
  type NodeOrganizationActivationInput,
  type NodeRuntimeClient,
  type PollOptions,
  type SubmitAndPollResult,
  type SubmitPayload,
} from './client-port.js';
import type { HostRouteContext, LegalOrganizationOrderInput } from '../host-onboarding.js';

export class HostOnboardingSdk {
  constructor(private readonly client: NodeRuntimeClient) {}

  /**
   * Submits the legal organization activation proof and required declared
   * service capabilities to GW CORE.
   */
  public activateOrganizationInGatewayFromIcaProof(
    hostCtx: HostRouteContext,
    input: NodeOrganizationActivationInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'activateOrganizationInGatewayFromIcaProof')(hostCtx, input, pollOptions);
  }

  public confirmLegalOrganizationOrder(
    hostCtx: HostRouteContext,
    input: LegalOrganizationOrderInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'confirmLegalOrganizationOrder')(hostCtx, input, pollOptions);
  }

  public submitAndPoll(
    submitPath: string,
    pollPath: string,
    payload: SubmitPayload,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return submitAndPollWithClient(this.client, submitPath, pollPath, payload, pollOptions);
  }
}

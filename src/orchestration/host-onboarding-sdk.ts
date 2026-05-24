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
import type { HostRouteContext, LegalOrganizationOrderInput } from '../host-onboarding.js';

export class HostOnboardingSdk {
  constructor(private readonly client: NodeRuntimeClient) {}

  public activateOrganizationInGatewayFromIcaProof(
    hostCtx: HostRouteContext,
    input: { vpToken: string; controller?: ControllerBindingInput; additionalClaims?: Record<string, unknown> },
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

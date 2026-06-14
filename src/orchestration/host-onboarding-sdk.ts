// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.
// Always create JSDoc, do not use strings inline in keys nor values, use types instead, and reuse the data test examples.
import {
  requireClientMethod,
  submitAndPollWithClient,
  type NodeRuntimeClient,
  type NodeOrganizationActivationInput,
  type PollOptions,
  type SubmitAndPollResult,
  type SubmitPayload,
} from './client-port.js';
import { ActorCapabilities, ActorKinds } from 'gdc-common-utils-ts/constants/actor-session';
import type {
  HostingControllerFacade,
  HostLifecycleInput,
  HostRouteContext,
  LegalOrganizationOrderInput,
} from '../host-onboarding.js';
import type { NodeCapability } from '../session.js';
import { assertFacadeCapability } from './capability-guard.js';

export class HostOnboardingSdk implements HostingControllerFacade {
  constructor(
    private readonly client: NodeRuntimeClient,
    private readonly capabilities: readonly NodeCapability[] = [],
  ) {}

  /**
   * Submits the legal organization activation proof and required declared
   * service capabilities to GW CORE.
   */
  public activateOrganizationInGatewayFromIcaProof(
    hostCtx: HostRouteContext,
    input: NodeOrganizationActivationInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.HostingActivateOrganization, ActorKinds.HostOnboarding, 'activateOrganizationInGatewayFromIcaProof');
    return requireClientMethod(this.client, 'activateOrganizationInGatewayFromIcaProof')(hostCtx, input, pollOptions);
  }

  public confirmLegalOrganizationOrder(
    hostCtx: HostRouteContext,
    input: LegalOrganizationOrderInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.HostingConfirmOrder, ActorKinds.HostOnboarding, 'confirmLegalOrganizationOrder');
    return requireClientMethod(this.client, 'confirmLegalOrganizationOrder')(hostCtx, input, pollOptions);
  }

  /**
   * Disables the host registration after all hosted tenants have already been
   * purged and the hosting operator should stop publishing discovery services.
   */
  public disableHost(
    hostCtx: HostRouteContext,
    input: HostLifecycleInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.HostingDisableHost, ActorKinds.HostOnboarding, 'disableHost');
    return requireClientMethod(this.client, 'disableHost')(hostCtx, input, pollOptions);
  }

  /**
   * Purges the already-disabled host registration once no hosted tenants
   * remain in the registry.
   */
  public purgeHost(
    hostCtx: HostRouteContext,
    input: HostLifecycleInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.HostingPurgeHost, ActorKinds.HostOnboarding, 'purgeHost');
    return requireClientMethod(this.client, 'purgeHost')(hostCtx, input, pollOptions);
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

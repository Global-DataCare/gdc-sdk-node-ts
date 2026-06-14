// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import { ActorCapabilities, ActorKinds } from 'gdc-common-utils-ts/constants/actor-session';
import {
  requireClientMethod,
  submitAndPollWithClient,
  type NodeRuntimeClient,
  type PollOptions,
  type SubmitAndPollResult,
  type SubmitPayload,
} from './client-port.js';
import { assertFacadeCapability } from './capability-guard.js';
import type { RouteContext } from '../individual-onboarding.js';
import type { HostRouteContext, HostedTenantLifecycleInput } from '../host-onboarding.js';
import type { EmployeeDeviceActivationResult, EmployeeDeviceActivationRequestInput } from '../device-activation.js';
import type { SmartTokenExchangeResult, SmartTokenRequestInput } from '../smart-token.js';
import type { OrganizationLicenseOrderConfirmInput } from '../organization-license-order.js';
import type { NodeCapability } from '../session.js';
import type {
  LicenseListRuntimeSearchInput,
  LicenseOfferRuntimeSearchInput,
  LicenseOrderRuntimeSearchInput,
  OrganizationEmployeeCreationInput,
  OrganizationEmployeeLifecycleInput,
  OrganizationEmployeeSearchInput,
} from '../resource-operations.js';

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
  constructor(
    private readonly client: NodeRuntimeClient,
    private readonly capabilities?: readonly NodeCapability[],
  ) {}

  /**
   * Creates an employee/professional under the current organization tenant.
   */
  public createOrganizationEmployee(
    ctx: RouteContext,
    input: OrganizationEmployeeCreationInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.OrganizationCreateEmployee, ActorKinds.OrganizationController, 'createOrganizationEmployee');
    return requireClientMethod(this.client, 'createOrganizationEmployee')(ctx, input, pollOptions);
  }

  /**
   * Disables an employee using the current GW CORE lifecycle contract.
   */
  public disableOrganizationEmployee(
    ctx: RouteContext,
    input: OrganizationEmployeeLifecycleInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.OrganizationDisableEmployee, ActorKinds.OrganizationController, 'disableOrganizationEmployee');
    return requireClientMethod(this.client, 'disableOrganizationEmployee')(ctx, input, pollOptions);
  }

  /**
   * Preferred public alias for employee disable.
   */
  public disableEmployee(
    ctx: RouteContext,
    input: OrganizationEmployeeLifecycleInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.OrganizationDisableEmployee, ActorKinds.OrganizationController, 'disableEmployee');
    return requireClientMethod(this.client, 'disableEmployee')(ctx, input, pollOptions);
  }

  /**
   * Searches employees/professionals under the current organization tenant.
   */
  public searchOrganizationEmployees(
    ctx: RouteContext,
    input: OrganizationEmployeeSearchInput,
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'searchOrganizationEmployees')(ctx, input);
  }

  /**
   * Searches organization-owned license seats using semantic license filters.
   */
  public searchLicenses(
    ctx: RouteContext,
    input: LicenseListRuntimeSearchInput,
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'searchOrganizationLicenses')(ctx, input);
  }

  /**
   * Lists organization-owned license seats with optional filters.
   */
  public listLicenses(
    ctx: RouteContext,
    input: LicenseListRuntimeSearchInput = {},
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'listOrganizationLicenses')(ctx, input);
  }

  /**
   * Searches commercial license offers known for the current organization.
   */
  public searchLicenseOffers(
    ctx: RouteContext,
    input: LicenseOfferRuntimeSearchInput,
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'searchOrganizationLicenseOffers')(ctx, input);
  }

  /**
   * Lists commercial license offers known for the current organization.
   */
  public listLicenseOffers(
    ctx: RouteContext,
    input: LicenseOfferRuntimeSearchInput = {},
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'listOrganizationLicenseOffers')(ctx, input);
  }

  /**
   * Searches commercial license orders/payment records known for the current
   * organization.
   */
  public searchLicenseOrders(
    ctx: RouteContext,
    input: LicenseOrderRuntimeSearchInput,
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'searchOrganizationLicenseOrders')(ctx, input);
  }

  /**
   * Lists commercial license orders/payment records known for the current
   * organization.
   */
  public listLicenseOrders(
    ctx: RouteContext,
    input: LicenseOrderRuntimeSearchInput = {},
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'listOrganizationLicenseOrders')(ctx, input);
  }

  /**
   * Confirms an already paid organization-side license order so GW CORE can
   * activate additional tenant seats once the public route exists.
   *
   * The commercial/payment step happens outside GW CORE. This method models
   * the follow-up confirmation that should materialize new seats from the
   * accepted order.
   *
   * Current runtime note:
   * - search/list of organization license offers and orders already exists
   * - the public/write post-payment seat-activation route is not converged yet
   * - current runtime clients therefore throw an explicit unsupported-flow
   *   error instead of fabricating an unstable payload contract
   */
  public confirmOrganizationLicenseOrder(
    ctx: RouteContext,
    input: OrganizationLicenseOrderConfirmInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'confirmOrganizationLicenseOrder')(ctx, input, pollOptions);
  }

  /**
   * Purges an already inactive employee and frees the associated license seat.
   */
  public purgeOrganizationEmployee(
    ctx: RouteContext,
    input: OrganizationEmployeeLifecycleInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.OrganizationPurgeEmployee, ActorKinds.OrganizationController, 'purgeOrganizationEmployee');
    return requireClientMethod(this.client, 'purgeOrganizationEmployee')(ctx, input, pollOptions);
  }

  /**
   * Preferred public alias for employee purge.
   */
  public purgeEmployee(
    ctx: RouteContext,
    input: OrganizationEmployeeLifecycleInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.OrganizationPurgeEmployee, ActorKinds.OrganizationController, 'purgeEmployee');
    return requireClientMethod(this.client, 'purgeEmployee')(ctx, input, pollOptions);
  }

  /**
   * Disables the hosted tenant itself through the host registry once no active
   * employees or individual/member descendants remain.
   */
  public disableTenant(
    hostCtx: HostRouteContext,
    input: HostedTenantLifecycleInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.OrganizationDisableTenant, ActorKinds.OrganizationController, 'disableTenant');
    return requireClientMethod(this.client, 'disableTenant')(hostCtx, input, pollOptions);
  }

  /**
   * Purges the hosted tenant through the host registry after tenant disable and
   * descendant purges have both completed.
   */
  public purgeTenant(
    hostCtx: HostRouteContext,
    input: HostedTenantLifecycleInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.OrganizationPurgeTenant, ActorKinds.OrganizationController, 'purgeTenant');
    return requireClientMethod(this.client, 'purgeTenant')(hostCtx, input, pollOptions);
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
    assertFacadeCapability(this.capabilities, ActorCapabilities.OrganizationRequestSmartToken, ActorKinds.OrganizationController, 'requestSmartToken');
    return requireClientMethod(this.client, 'requestSmartToken')(input);
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

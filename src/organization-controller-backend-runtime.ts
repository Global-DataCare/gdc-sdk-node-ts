// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import type { SubmitAndPollResult } from 'gdc-sdk-core-ts';
import type { ProfileLoadRequest } from 'gdc-sdk-core-ts';
import type {
  LicenseListRuntimeSearchInput,
  LicenseOfferRuntimeSearchInput,
  LicenseOrderRuntimeSearchInput,
  OrganizationEmployeeCreationInput,
  OrganizationEmployeeLifecycleInput,
  OrganizationEmployeeSearchInput,
} from './resource-operations.js';
import type { HostRouteContext, HostedTenantLifecycleInput } from './host-onboarding.js';
import type { OrganizationLicenseOrderConfirmInput } from './organization-license-order.js';
import type { RouteContext } from './individual-onboarding.js';
import {
  loadBackendOrganizationControllerProfile,
  type BackendOrganizationControllerProfile,
  type BackendProfileRuntimeClient,
} from './backend-profile-runtime.js';

/**
 * Backend use-case facade for the organization-controller happy path.
 *
 * This wrapper keeps the step-by-step tutorial surface high-level for:
 * - license seat discovery
 * - employee provisioning and lifecycle
 * - tenant disable/purge cleanup
 */
export class OrganizationControllerBackendRuntime {
  constructor(
    private readonly profileRuntime: BackendProfileRuntimeClient,
  ) {}

  /**
   * Loads one organization-controller backend profile and materializes its
   * actor facade in one step.
   */
  public loadProfile(
    input: ProfileLoadRequest,
  ): Promise<BackendOrganizationControllerProfile> {
    return loadBackendOrganizationControllerProfile(this.profileRuntime, input);
  }

  /**
   * Lists organization-owned license seats.
   */
  public listLicenses(
    profile: BackendOrganizationControllerProfile,
    ctx: RouteContext,
    input: LicenseListRuntimeSearchInput = {},
  ): Promise<SubmitAndPollResult> {
    return profile.sdk.listLicenses(ctx, input);
  }

  /**
   * Lists commercial offers available to contract more seats.
   */
  public listLicenseOffers(
    profile: BackendOrganizationControllerProfile,
    ctx: RouteContext,
    input: LicenseOfferRuntimeSearchInput = {},
  ): Promise<SubmitAndPollResult> {
    return profile.sdk.listLicenseOffers(ctx, input);
  }

  /**
   * Lists already-created commercial orders.
   */
  public listLicenseOrders(
    profile: BackendOrganizationControllerProfile,
    ctx: RouteContext,
    input: LicenseOrderRuntimeSearchInput = {},
  ): Promise<SubmitAndPollResult> {
    return profile.sdk.listLicenseOrders(ctx, input);
  }

  /**
   * Confirms one already-paid organization order so additional seats become
   * usable by employees.
   */
  public confirmOrganizationLicenseOrder(
    profile: BackendOrganizationControllerProfile,
    ctx: RouteContext,
    input: OrganizationLicenseOrderConfirmInput,
  ): Promise<SubmitAndPollResult> {
    return profile.sdk.confirmOrganizationLicenseOrder(ctx, input);
  }

  /**
   * Creates one employee under the current tenant.
   */
  public createEmployee(
    profile: BackendOrganizationControllerProfile,
    ctx: RouteContext,
    input: OrganizationEmployeeCreationInput,
  ): Promise<SubmitAndPollResult> {
    return profile.sdk.createOrganizationEmployee(ctx, input);
  }

  /**
   * Lists/searches employees under the current tenant.
   */
  public searchEmployees(
    profile: BackendOrganizationControllerProfile,
    ctx: RouteContext,
    input: OrganizationEmployeeSearchInput,
  ): Promise<SubmitAndPollResult> {
    return profile.sdk.searchOrganizationEmployees(ctx, input);
  }

  /**
   * Disables one employee without purging it yet.
   */
  public disableEmployee(
    profile: BackendOrganizationControllerProfile,
    ctx: RouteContext,
    input: OrganizationEmployeeLifecycleInput,
  ): Promise<SubmitAndPollResult> {
    return profile.sdk.disableEmployee(ctx, input);
  }

  /**
   * Purges one already-disabled employee.
   */
  public purgeEmployee(
    profile: BackendOrganizationControllerProfile,
    ctx: RouteContext,
    input: OrganizationEmployeeLifecycleInput,
  ): Promise<SubmitAndPollResult> {
    return profile.sdk.purgeEmployee(ctx, input);
  }

  /**
   * Disables the tenant after dependent actors have been disabled.
   */
  public disableTenant(
    profile: BackendOrganizationControllerProfile,
    hostCtx: HostRouteContext,
    input: HostedTenantLifecycleInput,
  ): Promise<SubmitAndPollResult> {
    return profile.sdk.disableTenant(hostCtx, input);
  }

  /**
   * Purges the tenant after employee and individual cleanup.
   */
  public purgeTenant(
    profile: BackendOrganizationControllerProfile,
    hostCtx: HostRouteContext,
    input: HostedTenantLifecycleInput,
  ): Promise<SubmitAndPollResult> {
    return profile.sdk.purgeTenant(hostCtx, input);
  }
}

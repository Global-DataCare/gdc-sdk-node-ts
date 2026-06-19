// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import type { SubmitAndPollResult } from 'gdc-sdk-core-ts';
import type { FamilyOrganizationSummary } from 'gdc-common-utils-ts/utils/family-organization-summary';
import type { IndividualOrganizationConfirmOrderInput, RouteContext } from './individual-onboarding.js';
import type { IndividualOrganizationBootstrapInput, IndividualOrganizationStartResult } from './individual-start.js';
import type { EnsureFamilyOrganizationRegistrationInput, EnsureFamilyOrganizationRegistrationResult } from './family-organization-registration.js';
import type { FamilyOrganizationSearchInput } from './family-organization-search.js';
import type { ClinicalBundleSearchInput } from './resource-operations.js';
import {
  loadBackendIndividualControllerProfile,
  type BackendIndividualControllerProfile,
  type BackendProfileRuntimeClient,
} from './backend-profile-runtime.js';
import type { ProfileLoadRequest } from 'gdc-sdk-core-ts';

/**
 * Backend use-case facade for the current individual-controller baseline.
 *
 * This class does not redefine the generic backend profile runtime. It wraps
 * that runtime with the current stable CORE-facing actions that backend
 * consumers need first:
 *
 * - load an individual-controller profile
 * - start individual registration/bootstrap
 * - confirm the returned order/offer
 * - search the subject clinical index
 * - request the latest IPS-oriented bundle
 */
export class IndividualControllerBackendRuntime {
  constructor(
    private readonly profileRuntime: BackendProfileRuntimeClient,
  ) {}

  /**
   * Loads one individual-controller backend profile and materializes its actor
   * facade in one step.
   */
  public loadProfile(
    input: ProfileLoadRequest,
  ): Promise<BackendIndividualControllerProfile> {
    return loadBackendIndividualControllerProfile(this.profileRuntime, input);
  }

  /**
   * Starts the current CORE individual/family bootstrap flow.
   */
  public startIndividualOrganization(
    profile: BackendIndividualControllerProfile,
    input: IndividualOrganizationBootstrapInput,
  ): Promise<IndividualOrganizationStartResult> {
    return profile.sdk.startIndividualOrganization(input);
  }

  /**
   * Searches one existing family/individual registration before deciding
   * whether the backend should create or resume it.
   */
  public searchFamilyOrganization(
    profile: BackendIndividualControllerProfile,
    ctx: RouteContext,
    input: FamilyOrganizationSearchInput,
  ): Promise<FamilyOrganizationSummary | null> {
    return profile.sdk.searchFamilyOrganization(ctx, input);
  }

  /**
   * High-level onboarding gate for channel apps:
   * search the registration first and only bootstrap when still missing.
   */
  public ensureFamilyOrganizationRegistration(
    profile: BackendIndividualControllerProfile,
    ctx: RouteContext,
    input: EnsureFamilyOrganizationRegistrationInput,
  ): Promise<EnsureFamilyOrganizationRegistrationResult> {
    return profile.sdk.ensureFamilyOrganizationRegistration(ctx, input);
  }

  /**
   * Confirms the order returned by the individual bootstrap flow.
   */
  public confirmIndividualOrganizationOrder(
    profile: BackendIndividualControllerProfile,
    input: IndividualOrganizationConfirmOrderInput,
  ): Promise<SubmitAndPollResult> {
    return profile.sdk.confirmIndividualOrganizationOrder(input);
  }

  /**
   * Searches the current subject clinical bundle index through the loaded
   * individual-controller facade.
   */
  public searchClinicalBundle(
    profile: BackendIndividualControllerProfile,
    ctx: RouteContext,
    input: ClinicalBundleSearchInput,
  ): Promise<SubmitAndPollResult> {
    return profile.sdk.searchClinicalBundle(ctx, input);
  }

  /**
   * Reads the latest IPS-oriented bundle through the loaded
   * individual-controller facade.
   */
  public getLatestIps(
    profile: BackendIndividualControllerProfile,
    ctx: RouteContext,
    input: Omit<ClinicalBundleSearchInput, 'includedTypes'>,
  ): Promise<SubmitAndPollResult> {
    return profile.sdk.getLatestIps(ctx, input);
  }
}

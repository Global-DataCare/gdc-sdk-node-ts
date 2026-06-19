// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import type { SubmitAndPollResult } from 'gdc-sdk-core-ts';
import type { ProfileLoadRequest } from 'gdc-sdk-core-ts';
import type { RouteContext } from './individual-onboarding.js';
import type { SmartTokenExchangeResult, SmartTokenRequestInput } from './smart-token.js';
import type { ClinicalBundleSearchInput } from './resource-operations.js';
import {
  loadBackendProfessionalProfile,
  type BackendProfessionalProfile,
  type BackendProfileRuntimeClient,
} from './backend-profile-runtime.js';

/**
 * Backend use-case facade for the current professional happy path.
 *
 * This mirrors the individual-controller runtime wrapper, but for the actor
 * that:
 * - loads one protected professional profile,
 * - requests one SMART token,
 * - reads one authorized clinical bundle or latest IPS bundle.
 */
export class ProfessionalBackendRuntime {
  constructor(
    private readonly profileRuntime: BackendProfileRuntimeClient,
  ) {}

  /**
   * Loads one professional backend profile and materializes its actor facade in
   * one step.
   */
  public loadProfile(
    input: ProfileLoadRequest,
  ): Promise<BackendProfessionalProfile> {
    return loadBackendProfessionalProfile(this.profileRuntime, input);
  }

  /**
   * Requests one SMART/OpenID token from the professional actor facade.
   */
  public requestSmartToken(
    profile: BackendProfessionalProfile,
    input: SmartTokenRequestInput,
  ): Promise<SmartTokenExchangeResult> {
    return profile.sdk.requestSmartToken(input);
  }

  /**
   * Searches one authorized clinical bundle through the professional facade.
   */
  public searchClinicalBundle(
    profile: BackendProfessionalProfile,
    ctx: RouteContext,
    input: ClinicalBundleSearchInput,
  ): Promise<SubmitAndPollResult> {
    return profile.sdk.searchClinicalBundle(ctx, input);
  }

  /**
   * Reads the latest IPS-oriented bundle through the professional facade.
   */
  public getLatestIps(
    profile: BackendProfessionalProfile,
    ctx: RouteContext,
    input: Omit<ClinicalBundleSearchInput, 'includedTypes'>,
  ): Promise<SubmitAndPollResult> {
    return profile.sdk.getLatestIps(ctx, input);
  }
}

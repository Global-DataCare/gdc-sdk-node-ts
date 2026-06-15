// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import {
  requireClientMethod,
  submitAndPollWithClient,
  type NodeRuntimeClient,
  type PollOptions,
  type SubmitAndPollResult,
  type SubmitPayload,
} from './client-port.js';
import type { IndividualOrganizationBootstrapInput, IndividualOrganizationStartResult } from '../individual-start.js';
import type { RouteContext } from '../individual-onboarding.js';
import type {
  ClinicalBundleSearchInput,
  CommunicationIngestionInput,
  CommunicationParticipantRuntimeSearchInput,
  DigitalTwinGenerationInput,
  GrantProfessionalAccessInput,
  GrantProfessionalAccessResult,
  IpsOrFhirImportInput,
  LicenseListRuntimeSearchInput,
  LicenseOfferRuntimeSearchInput,
  LicenseOrderRuntimeSearchInput,
} from '../resource-operations.js';
import type { SmartTokenExchangeResult, SmartTokenRequestInput } from '../smart-token.js';

export class PersonalSdk {
  constructor(private readonly client: NodeRuntimeClient) {}

  /** Starts individual subject onboarding (organization profile) and returns offer preview. */
  public startIndividualOrganization(input: IndividualOrganizationBootstrapInput): Promise<IndividualOrganizationStartResult> {
    return requireClientMethod(this.client, 'startIndividualOrganization')(input);
  }

  /** Grants professional access via Consent for a subject. */
  public grantProfessionalAccess(ctx: RouteContext, input: GrantProfessionalAccessInput): Promise<GrantProfessionalAccessResult> {
    return requireClientMethod(this.client, 'grantProfessionalAccess')(ctx, input);
  }

  /** Imports IPS/FHIR payload and updates document index projections. */
  public importIpsOrFhirAndUpdateIndex(ctx: RouteContext, input: IpsOrFhirImportInput): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'importIpsOrFhirAndUpdateIndex')(ctx, input);
  }

  /** Ingests canonical Communication and waits for projection completion. */
  public ingestCommunicationAndUpdateIndex(ctx: RouteContext, input: CommunicationIngestionInput): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'ingestCommunicationAndUpdateIndex')(ctx, input);
  }

  /** Searches indexed communication channel records by subject and participant identifiers. */
  public searchCommunicationParticipants(
    ctx: RouteContext,
    input: CommunicationParticipantRuntimeSearchInput,
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'searchCommunicationParticipants')(ctx, input);
  }

  /** Triggers digital twin generation from subject data. */
  public generateDigitalTwinFromSubjectData(ctx: RouteContext, input: DigitalTwinGenerationInput): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'generateDigitalTwinFromSubjectData')(ctx, input);
  }

  /** Searches indexed clinical bundles for the current subject/controller context. */
  public searchClinicalBundle(
    ctx: RouteContext,
    input: ClinicalBundleSearchInput,
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'searchClinicalBundle')(ctx, input);
  }

  /** Returns the latest IPS-oriented bundle for one subject. */
  public getLatestIps(
    ctx: RouteContext,
    input: Omit<ClinicalBundleSearchInput, 'includedTypes'>,
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'getLatestIps')(ctx, input);
  }

  /** Searches subject-side license seats using semantic filters. */
  public searchLicenses(
    ctx: RouteContext,
    input: LicenseListRuntimeSearchInput,
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'searchIndividualLicenses')(ctx, input);
  }

  /** Lists subject-side license seats with optional filters. */
  public listLicenses(
    ctx: RouteContext,
    input: LicenseListRuntimeSearchInput = {},
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'listIndividualLicenses')(ctx, input);
  }

  /** Searches subject-side commercial license offers. */
  public searchLicenseOffers(
    ctx: RouteContext,
    input: LicenseOfferRuntimeSearchInput,
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'searchIndividualLicenseOffers')(ctx, input);
  }

  /** Lists subject-side commercial license offers. */
  public listLicenseOffers(
    ctx: RouteContext,
    input: LicenseOfferRuntimeSearchInput = {},
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'listIndividualLicenseOffers')(ctx, input);
  }

  /** Searches subject-side commercial license orders/payment projections. */
  public searchLicenseOrders(
    ctx: RouteContext,
    input: LicenseOrderRuntimeSearchInput,
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'searchIndividualLicenseOrders')(ctx, input);
  }

  /** Lists subject-side commercial license orders/payment projections. */
  public listLicenseOrders(
    ctx: RouteContext,
    input: LicenseOrderRuntimeSearchInput = {},
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'listIndividualLicenseOrders')(ctx, input);
  }

  /** Requests SMART/OpenID token with simplified exchange flow. */
  public requestSmartToken(input: SmartTokenRequestInput): Promise<SmartTokenExchangeResult> {
    return requireClientMethod(this.client, 'requestSmartToken')(input);
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

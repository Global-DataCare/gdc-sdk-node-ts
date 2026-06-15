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
import type { IndividualOrganizationConfirmOrderInput, RouteContext } from '../individual-onboarding.js';
import type { IndividualOrganizationBootstrapInput, IndividualOrganizationStartResult } from '../individual-start.js';
import type { NodeCapability } from '../session.js';
import type {
  ClinicalBundleSearchInput,
  CommunicationIngestionInput,
  CommunicationParticipantRuntimeSearchInput,
  DigitalTwinGenerationInput,
  GrantProfessionalAccessInput,
  GrantProfessionalAccessResult,
  IndividualMemberLifecycleInput,
  IndividualOrganizationLifecycleInput,
  IpsOrFhirImportInput,
  LicenseListRuntimeSearchInput,
  LicenseOfferRuntimeSearchInput,
  LicenseOrderRuntimeSearchInput,
  RelatedPersonUpsertInput,
} from '../resource-operations.js';
import type { SmartTokenExchangeResult, SmartTokenRequestInput } from '../smart-token.js';

/**
 * Individual-controller oriented facade over a `NodeRuntimeClient`.
 *
 * It groups the most common individual subject flows: organization/index
 * bootstrap, consent, IPS/FHIR ingestion, digital twin generation, and token requests.
 */
export class IndividualControllerSdk {
  /**
   * @param client Runtime client implementation used to submit and poll GW flows.
   */
  constructor(
    private readonly client: NodeRuntimeClient,
    private readonly capabilities?: readonly NodeCapability[],
  ) {}

  /**
   * Starts the individual onboarding/bootstrap flow.
   */
  public startIndividualOrganization(input: IndividualOrganizationBootstrapInput): Promise<IndividualOrganizationStartResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.IndividualBootstrap, ActorKinds.IndividualController, 'startIndividualOrganization');
    return requireClientMethod(this.client, 'startIndividualOrganization')(input);
  }

  /**
   * Confirms the order returned by `startIndividualOrganization(...)`.
   */
  public confirmIndividualOrganizationOrder(input: IndividualOrganizationConfirmOrderInput): Promise<SubmitAndPollResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.IndividualBootstrap, ActorKinds.IndividualController, 'confirmIndividualOrganizationOrder');
    return requireClientMethod(this.client, 'confirmIndividualOrganizationOrder')(input);
  }

  /**
   * Disables the hosted individual/family organization without freeing licenses.
   */
  public disableIndividualOrganization(
    ctx: RouteContext,
    input: IndividualOrganizationLifecycleInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.IndividualDisable, ActorKinds.IndividualController, 'disableIndividualOrganization');
    return requireClientMethod(this.client, 'disableIndividualOrganization')(ctx, input, pollOptions);
  }

  /**
   * Preferred public alias for hosted individual/family disable.
   */
  public disableIndividual(
    ctx: RouteContext,
    input: IndividualOrganizationLifecycleInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.IndividualDisable, ActorKinds.IndividualController, 'disableIndividual');
    return requireClientMethod(this.client, 'disableIndividual')(ctx, input, pollOptions);
  }

  /**
   * Purges an already inactive hosted individual/family organization.
   */
  public purgeIndividualOrganization(
    ctx: RouteContext,
    input: IndividualOrganizationLifecycleInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.IndividualPurge, ActorKinds.IndividualController, 'purgeIndividualOrganization');
    return requireClientMethod(this.client, 'purgeIndividualOrganization')(ctx, input, pollOptions);
  }

  /**
   * Preferred public alias for hosted individual/family purge.
   */
  public purgeIndividual(
    ctx: RouteContext,
    input: IndividualOrganizationLifecycleInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.IndividualPurge, ActorKinds.IndividualController, 'purgeIndividual');
    return requireClientMethod(this.client, 'purgeIndividual')(ctx, input, pollOptions);
  }

  /**
   * Controller-only placeholder for a future individual-member lifecycle flow.
   *
   * Current GW CORE still lacks the stable member disable route. The runtime
   * client currently throws a not-supported error by design.
   */
  public disableIndividualMember(
    ctx: RouteContext,
    input: IndividualMemberLifecycleInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.IndividualMemberDisable, ActorKinds.IndividualController, 'disableIndividualMember');
    return requireClientMethod(this.client, 'disableIndividualMember')(ctx, input, pollOptions);
  }

  /**
   * Controller-only placeholder for a future individual-member lifecycle flow.
   *
   * Current GW CORE still lacks the stable member purge route. The runtime
   * client currently throws a not-supported error by design.
   */
  public purgeIndividualMember(
    ctx: RouteContext,
    input: IndividualMemberLifecycleInput,
    pollOptions?: PollOptions,
  ): Promise<SubmitAndPollResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.IndividualMemberPurge, ActorKinds.IndividualController, 'purgeIndividualMember');
    return requireClientMethod(this.client, 'purgeIndividualMember')(ctx, input, pollOptions);
  }

  /**
   * Grants access to a professional through a consent flow.
   */
  public grantProfessionalAccess(ctx: RouteContext, input: GrantProfessionalAccessInput): Promise<GrantProfessionalAccessResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.ConsentGrantProfessionalAccess, ActorKinds.IndividualController, 'grantProfessionalAccess');
    return requireClientMethod(this.client, 'grantProfessionalAccess')(ctx, input);
  }

  /**
   * Imports a FHIR/IPS payload and waits until it is indexed.
   */
  public importIpsOrFhirAndUpdateIndex(ctx: RouteContext, input: IpsOrFhirImportInput): Promise<SubmitAndPollResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.IndividualImportIps, ActorKinds.IndividualController, 'importIpsOrFhirAndUpdateIndex');
    return requireClientMethod(this.client, 'importIpsOrFhirAndUpdateIndex')(ctx, input);
  }

  /**
   * Creates or updates a `RelatedPerson` for non-employee caregivers or family members.
   */
  public upsertRelatedPersonAndPoll(ctx: RouteContext, input: RelatedPersonUpsertInput): Promise<SubmitAndPollResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.IndividualUpsertRelatedPerson, ActorKinds.IndividualController, 'upsertRelatedPersonAndPoll');
    return requireClientMethod(this.client, 'upsertRelatedPersonAndPoll')(ctx, input);
  }

  /**
   * Ingests a FHIR `Communication` and waits for indexing.
   */
  public ingestCommunicationAndUpdateIndex(ctx: RouteContext, input: CommunicationIngestionInput): Promise<SubmitAndPollResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.IndividualIngestCommunication, ActorKinds.IndividualController, 'ingestCommunicationAndUpdateIndex');
    return requireClientMethod(this.client, 'ingestCommunicationAndUpdateIndex')(ctx, input);
  }

  /**
   * Searches indexed communication channel records by subject and participant
   * identifiers.
   */
  public searchCommunicationParticipants(
    ctx: RouteContext,
    input: CommunicationParticipantRuntimeSearchInput,
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'searchCommunicationParticipants')(ctx, input);
  }

  /**
   * Generates a digital twin projection from subject data.
   */
  public generateDigitalTwinFromSubjectData(ctx: RouteContext, input: DigitalTwinGenerationInput): Promise<SubmitAndPollResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.IndividualGenerateDigitalTwin, ActorKinds.IndividualController, 'generateDigitalTwinFromSubjectData');
    return requireClientMethod(this.client, 'generateDigitalTwinFromSubjectData')(ctx, input);
  }

  /**
   * Searches indexed clinical bundles for the current subject/controller context.
   */
  public searchClinicalBundle(
    ctx: RouteContext,
    input: ClinicalBundleSearchInput,
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'searchClinicalBundle')(ctx, input);
  }

  /**
   * Returns the latest IPS-oriented bundle for one subject.
   */
  public getLatestIps(
    ctx: RouteContext,
    input: Omit<ClinicalBundleSearchInput, 'includedTypes'>,
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'getLatestIps')(ctx, input);
  }

  /**
   * Searches subject/individual-side license seats using semantic filters.
   */
  public searchLicenses(
    ctx: RouteContext,
    input: LicenseListRuntimeSearchInput,
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'searchIndividualLicenses')(ctx, input);
  }

  /**
   * Lists subject/individual-side license seats with optional filters.
   */
  public listLicenses(
    ctx: RouteContext,
    input: LicenseListRuntimeSearchInput = {},
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'listIndividualLicenses')(ctx, input);
  }

  /**
   * Searches commercial license offers known for the individual/family
   * context.
   */
  public searchLicenseOffers(
    ctx: RouteContext,
    input: LicenseOfferRuntimeSearchInput,
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'searchIndividualLicenseOffers')(ctx, input);
  }

  /**
   * Lists commercial license offers known for the individual/family context.
   */
  public listLicenseOffers(
    ctx: RouteContext,
    input: LicenseOfferRuntimeSearchInput = {},
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'listIndividualLicenseOffers')(ctx, input);
  }

  /**
   * Searches commercial license orders/payment projections for the
   * individual/family context.
   */
  public searchLicenseOrders(
    ctx: RouteContext,
    input: LicenseOrderRuntimeSearchInput,
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'searchIndividualLicenseOrders')(ctx, input);
  }

  /**
   * Lists commercial license orders/payment projections for the
   * individual/family context.
   */
  public listLicenseOrders(
    ctx: RouteContext,
    input: LicenseOrderRuntimeSearchInput = {},
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'listIndividualLicenseOrders')(ctx, input);
  }

  /**
   * Requests a SMART/OpenID token for subsequent data access flows.
   */
  public requestSmartToken(input: SmartTokenRequestInput): Promise<SmartTokenExchangeResult> {
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

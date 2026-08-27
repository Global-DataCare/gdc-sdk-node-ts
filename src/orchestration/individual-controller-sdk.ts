// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import { ActorCapabilities, ActorKinds } from 'gdc-common-utils-ts/constants/actor-session';
import { HealthcareConsentPurposes, ServiceCapability } from 'gdc-common-utils-ts/constants';
import { ClaimConsent } from 'gdc-common-utils-ts/models/consent-rule';
import {
  buildIndividualControllerIdentityVpPayload,
  buildUnsignedIndividualControllerIdentityVpJwt,
  getIndividualControllerIdentitySameAs,
  getIndividualControllerIdentityVC,
  getIndividualSubjectVC,
  type IndividualControllerCredentialInput,
  type IndividualControllerVpPayloadInput,
  type IndividualSubjectCredentialInput,
} from 'gdc-common-utils-ts';
import {
  requireClientMethod,
  submitAndPollWithClient,
  type NodeRuntimeClient,
  type PollOptions,
  type SubmitAndPollResult,
  type SubmitPayload,
} from './client-port.js';
import type { FamilyOrganizationSummary } from 'gdc-common-utils-ts/utils/family-organization-summary';
import { assertFacadeCapability } from './capability-guard.js';
import type { EnsureFamilyOrganizationRegistrationInput, EnsureFamilyOrganizationRegistrationResult } from '../family-organization-registration.js';
import type { FamilyOrganizationSearchInput } from '../family-organization-search.js';
import type { IndividualOrganizationConfirmOrderInput, IndividualOrganizationOrderResult, RouteContext } from '../individual-onboarding.js';
import type { IndividualOrganizationBootstrapInput, IndividualOrganizationStartResult } from '../individual-start.js';
import type { NodeCapability } from '../session.js';
import { GatewayActiveConsentProvider } from '../gateway-active-consent-provider.js';
import type { IndividualOrganizationLifecycleInput } from 'gdc-sdk-core-ts';
import { buildProfessionalAccessRequestDecisionGrant } from '../resource-operations.js';
import { buildProfessionalAccessRequestSearchInput } from '../resource-operations.js';
import type {
  BlockchainArtifactRegistrationInput,
  ClinicalBundleSearchInput,
  ClinicalSectionUpdateInput,
  ClinicalSummaryReadResult,
  ClinicalSummaryRequestInput,
  ClinicalSummaryUpdateInput,
  CommunicationIngestionInput,
  CommunicationParticipantRuntimeSearchInput,
  DigitalTwinGenerationInput,
  DigitalTwinSecondaryUseConsentInput,
  DigitalTwinSecondaryUseConsentResult,
  DigitalTwinSubjectLinkPurgeInput,
  DigitalTwinSubjectLinkPurgeResult,
  GrantProfessionalAccessInput,
  GrantProfessionalAccessResult,
  IndividualMemberLifecycleInput,
  IndividualMemberLicenseAddInput,
  IndividualMemberLicenseInvitationInput,
  IndividualMemberLicenseTransitionInput,
  IpsOrFhirImportInput,
  LicenseListRuntimeSearchInput,
  LicenseOfferRuntimeSearchInput,
  LicenseOrderRuntimeSearchInput,
  RevokeProfessionalAccessInput,
  RevokeProfessionalAccessResult,
  ProfessionalAccessRequestDecisionInput,
  ProfessionalAccessRequestSearchInput,
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
   * Searches one existing family/individual registration by the phone-first
   * business key used by channel apps.
   */
  public searchFamilyOrganization(
    ctx: RouteContext,
    input: FamilyOrganizationSearchInput,
  ): Promise<FamilyOrganizationSummary | null> {
    return requireClientMethod(this.client, 'searchFamilyOrganization')(ctx, input);
  }

  /**
   * Searches one existing family/individual registration and starts the
   * bootstrap flow only when the registration is still missing.
   */
  public ensureFamilyOrganizationRegistration(
    ctx: RouteContext,
    input: EnsureFamilyOrganizationRegistrationInput,
  ): Promise<EnsureFamilyOrganizationRegistrationResult> {
    return requireClientMethod(this.client, 'ensureFamilyOrganizationRegistration')(ctx, input);
  }

  /**
   * Confirms the order returned by `startIndividualOrganization(...)`.
   */
  public confirmIndividualOrganizationOrder(input: IndividualOrganizationConfirmOrderInput): Promise<IndividualOrganizationOrderResult> {
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
   * Soft-disables one individual-member / caregiver relationship through the
   * current `RelatedPerson/_batch` lifecycle contract.
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
   * Purges one previously disabled individual-member / caregiver relationship
   * through the explicit `RelatedPerson/_purge` lifecycle contract.
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

  /** Approves or denies a permission request while retaining its correlation. */
  public respondToProfessionalAccessRequest(
    ctx: RouteContext,
    input: ProfessionalAccessRequestDecisionInput,
  ): Promise<GrantProfessionalAccessResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.ConsentGrantProfessionalAccess, ActorKinds.IndividualController, 'respondToProfessionalAccessRequest');
    return requireClientMethod(this.client, 'grantProfessionalAccess')(
      ctx,
      buildProfessionalAccessRequestDecisionGrant(input),
    );
  }

  /** Lists canonical permission requests addressed to this subject. */
  public listProfessionalAccessRequests(
    ctx: RouteContext,
    input: ProfessionalAccessRequestSearchInput,
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'searchCommunicationParticipants')(
      ctx,
      buildProfessionalAccessRequestSearchInput(input),
    );
  }

  /**
   * Closes an existing professional consent by setting its period end.
   */
  public revokeProfessionalAccess(
    ctx: RouteContext,
    input: RevokeProfessionalAccessInput,
  ): Promise<RevokeProfessionalAccessResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.ConsentGrantProfessionalAccess, ActorKinds.IndividualController, 'revokeProfessionalAccess');
    return requireClientMethod(this.client, 'revokeProfessionalAccess')(ctx, input);
  }

  /**
   * Imports a FHIR/IPS payload and waits until it is indexed.
   */
  public importIpsOrFhirAndUpdateIndex(ctx: RouteContext, input: IpsOrFhirImportInput): Promise<SubmitAndPollResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.IndividualImportIps, ActorKinds.IndividualController, 'importIpsOrFhirAndUpdateIndex');
    return requireClientMethod(this.client, 'importIpsOrFhirAndUpdateIndex')(ctx, input);
  }

  /**
   * Compatibility adapter for the older direct `RelatedPerson` route.
   *
   * @deprecated Author one or more typed RelatedPerson entries in a Bundle,
   * attach that completed Bundle to a Communication outbox job, and call
   * `ingestCommunicationAndUpdateIndex(...)`.
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

  /** Updates one exact clinical section through a section-scoped batch/collection. */
  public updateClinicalSection(ctx: RouteContext, input: ClinicalSectionUpdateInput): Promise<SubmitAndPollResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.IndividualIngestCommunication, ActorKinds.IndividualController, 'updateClinicalSection');
    return requireClientMethod(this.client, 'updateClinicalSection')(ctx, input);
  }

  /** Updates the multi-section summary through a Composition-first document. */
  public updateClinicalSummary(ctx: RouteContext, input: ClinicalSummaryUpdateInput): Promise<SubmitAndPollResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.IndividualIngestCommunication, ActorKinds.IndividualController, 'updateClinicalSummary');
    return requireClientMethod(this.client, 'updateClinicalSummary')(ctx, input);
  }

  /**
   * Reads the subject's available clinical document through
   * `Communication -> Subject/$summary -> FHIR Parameters`.
   *
   * The returned `BundleReader` navigates the authoritative GW document by
   * section. This method never ingests resources or updates the index.
   */
  public requestClinicalSummary(
    ctx: RouteContext,
    input: ClinicalSummaryRequestInput,
  ): Promise<ClinicalSummaryReadResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.IndividualReadClinicalSummary, ActorKinds.IndividualController, 'requestClinicalSummary');
    return requireClientMethod(this.client, 'requestClinicalSummary')(ctx, input);
  }

  /**
   * Registers one FHIR resource or raw artifact on blockchain before it is
   * attached to a subject communication.
   */
  public registerBlockchainArtifactAndUpdateIndex(
    ctx: RouteContext,
    input: BlockchainArtifactRegistrationInput,
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'registerBlockchainArtifactAndUpdateIndex')(ctx, input);
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
   * Legacy direct Composition transfer hook.
   *
   * @deprecated Canonical twins are created only by GW from current subject
   * data after `setDigitalTwinSecondaryUseConsent(..., { decision: 'permit' })`.
   * The Node runtime intentionally does not publish canonical Compositions.
   */
  public generateDigitalTwinFromSubjectData(ctx: RouteContext, input: DigitalTwinGenerationInput): Promise<SubmitAndPollResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.IndividualGenerateDigitalTwin, ActorKinds.IndividualController, 'generateDigitalTwinFromSubjectData');
    return requireClientMethod(this.client, 'generateDigitalTwinFromSubjectData')(ctx, input);
  }

  /**
   * Enables or disables the subject's secondary-use digital-twin projection.
   * This is the canonical patient-side operation; application code must not
   * publish a canonical Composition directly into the research index. The
   * caller supplies only the portal/software/study reference. GW owns and
   * reuses the underlying FHIR Consent identifier.
   */
  public setDigitalTwinSecondaryUseConsent(
    ctx: RouteContext,
    input: DigitalTwinSecondaryUseConsentInput,
  ): Promise<DigitalTwinSecondaryUseConsentResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.IndividualGenerateDigitalTwin, ActorKinds.IndividualController, 'setDigitalTwinSecondaryUseConsent');
    return requireClientMethod(this.client, 'setDigitalTwinSecondaryUseConsent')(ctx, input);
  }

  /**
   * Offboards the subject from the current index provider. This removes only
   * the private subject/twin correspondence; it never deletes anonymous twin
   * data already shared for research.
   */
  public purgeDigitalTwinSubjectLink(
    ctx: RouteContext,
    input: DigitalTwinSubjectLinkPurgeInput,
  ): Promise<DigitalTwinSubjectLinkPurgeResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.IndividualGenerateDigitalTwin, ActorKinds.IndividualController, 'purgeDigitalTwinSubjectLink');
    return requireClientMethod(this.client, 'purgeDigitalTwinSubjectLink')(ctx, input);
  }

  /**
   * Returns the current decision for one portal, software or research study.
   * Consent is read through Communication -> individual `Subject/_search`;
   * this does not query a clinical Bundle or the twin ResearchSubject index.
   */
  public async getDigitalTwinSecondaryUseConsentStatus(
    ctx: RouteContext,
    input: Readonly<{
      subjectDid: string;
      indexProviderOrganizationDid: string;
      researchUseReference: string;
    }>,
  ): Promise<Readonly<{ exists: boolean; enabled: boolean }>> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.IndividualGenerateDigitalTwin, ActorKinds.IndividualController, 'getDigitalTwinSecondaryUseConsentStatus');
    const consents = await new GatewayActiveConsentProvider(this.client, ctx)
      .getActiveConsentsForSubject(input.subjectDid);
    const researchUseReference = String(input.researchUseReference || '').trim();
    if (!researchUseReference) throw new Error('researchUseReference is required to identify the portal, software or study consent.');
    const indexProviderOrganizationDid = String(input.indexProviderOrganizationDid || '').trim();
    if (!indexProviderOrganizationDid) throw new Error('indexProviderOrganizationDid is required.');
    const consent = consents.find((rule) => {
      const claims = rule as unknown as Record<string, unknown>;
      const actions = String(rule[ClaimConsent.action] || '').split(',').map((value) => value.trim());
      return String(claims[ClaimConsent.sourceReference] || '').trim() === researchUseReference
        && String(rule[ClaimConsent.actorIdentifier] || '').trim() === indexProviderOrganizationDid
        && String(rule[ClaimConsent.purpose] || '').trim().toUpperCase() === String(HealthcareConsentPurposes.Research).toUpperCase()
        && actions.includes(ServiceCapability.DigitalTwinReader);
    });
    return consent
      ? { exists: true, enabled: String(consent[ClaimConsent.decision] || '').trim().toLowerCase() === 'permit' }
      : { exists: false, enabled: false };
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

  /** Adds zero-cost member seats to the selected individual organization. */
  public addFreeMemberLicenses(
    ctx: RouteContext,
    input: IndividualMemberLicenseAddInput,
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'addFreeIndividualMemberLicenses')(ctx, input);
  }

  /**
   * Reserves one member seat for an existing FHIR v3 RoleCode contact.
   * ISCO professionals must use Consent without this operation.
   */
  public issueMemberInvitationLicense(
    ctx: RouteContext,
    input: IndividualMemberLicenseInvitationInput,
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'issueIndividualMemberLicense')(ctx, input);
  }

  /** Accepts, deactivates or releases one member invitation seat. */
  public transitionMemberLicense(
    ctx: RouteContext,
    action: '_accept' | '_deactivate' | '_release',
    input: IndividualMemberLicenseTransitionInput,
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'transitionIndividualMemberLicense')(ctx, action, input);
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
   * Returns the normalized public continuity aliases that would be embedded in
   * the individual-controller identity VC for SMART/OpenID4VP flows.
   */
  public getIdentitySameAs(input: IndividualControllerCredentialInput): string[] {
    return getIndividualControllerIdentitySameAs(input);
  }

  /**
   * Builds the canonical individual-controller identity VC used by shared
   * SMART VP helpers.
   */
  public getIdentityVC(input: IndividualControllerCredentialInput): Record<string, unknown> {
    return getIndividualControllerIdentityVC(input);
  }

  /**
   * Builds one canonical subject VC for the dependent subject managed by the
   * current controller, for example a child, pet, or another represented
   * individual.
   */
  public getSubjectVC(input: IndividualSubjectCredentialInput): Record<string, unknown> {
    return getIndividualSubjectVC(input);
  }

  /**
   * Builds the canonical individual-controller identity VP payload used by
   * shared SMART/OpenID4VP helpers.
   */
  public buildIdentityVpPayload(input: IndividualControllerVpPayloadInput): Record<string, unknown> {
    return buildIndividualControllerIdentityVpPayload(input);
  }

  /**
   * Builds one unsigned compact VP JWT for the canonical
   * individual-controller identity payload.
   */
  public buildUnsignedIdentityVpJwt(
    input: IndividualControllerVpPayloadInput,
    options: Readonly<{ nowSeconds?: number; ttlSeconds?: number; nonce?: string }> = {},
  ): string {
    return buildUnsignedIndividualControllerIdentityVpJwt(input, options);
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

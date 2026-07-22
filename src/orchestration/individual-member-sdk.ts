// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import {
  buildIndividualMemberIdentityVpPayload,
  buildUnsignedIndividualMemberIdentityVpJwt,
  getIndividualMemberIdentitySameAs,
  getIndividualMemberIdentityVC,
  type IndividualMemberCredentialInput,
  type IndividualMemberVpPayloadInput,
} from 'gdc-common-utils-ts';
import { requireClientMethod, type NodeRuntimeClient } from './client-port.js';
import type { SmartTokenExchangeResult, SmartTokenRequestInput } from '../smart-token.js';
import type { RouteContext } from '../individual-onboarding.js';
import type {
  ClinicalBundleSearchInput,
  CommunicationIngestionInput,
  RelatedPersonUpsertInput,
} from '../resource-operations.js';

export class IndividualMemberSdk {
  constructor(private readonly client: NodeRuntimeClient) {}

  /**
   * Compatibility adapter for the older direct `RelatedPerson` route.
   *
   * @deprecated Author a typed RelatedPerson Bundle, attach it to a
   * Communication outbox job, and call `ingestCommunicationAndUpdateIndex(...)`.
   */
  public upsertRelatedPersonAndPoll(ctx: RouteContext, input: RelatedPersonUpsertInput) {
    return requireClientMethod(this.client, 'upsertRelatedPersonAndPoll')(ctx, input);
  }

  /**
   * Requests a SMART token for a non-employee actor such as a `RelatedPerson`
   * caregiver, guardian, or family member.
   */
  public requestSmartToken(input: SmartTokenRequestInput): Promise<SmartTokenExchangeResult> {
    return requireClientMethod(this.client, 'requestSmartToken')(input);
  }

  /**
   * Writes clinical content for a subject only after GW authorizes this member's
   * SMART token and accepted RelatedPerson/Consent relationship.
   */
  public ingestCommunicationAndUpdateIndex(
    ctx: RouteContext,
    input: CommunicationIngestionInput,
  ) {
    return requireClientMethod(this.client, 'ingestCommunicationAndUpdateIndex')(ctx, input);
  }

  /** Reads subject-scoped clinical documents permitted to this member. */
  public searchClinicalBundle(ctx: RouteContext, input: ClinicalBundleSearchInput) {
    return requireClientMethod(this.client, 'searchClinicalBundle')(ctx, input);
  }

  /** Reads the latest permitted IPS document for the selected subject. */
  public getLatestIps(
    ctx: RouteContext,
    input: Omit<ClinicalBundleSearchInput, 'includedTypes'>,
  ) {
    return requireClientMethod(this.client, 'getLatestIps')(ctx, input);
  }

  /**
   * Returns the normalized public continuity aliases that would be embedded in
   * the individual-member identity VC for SMART/OpenID4VP flows.
   */
  public getIdentitySameAs(input: IndividualMemberCredentialInput): string[] {
    return getIndividualMemberIdentitySameAs(input);
  }

  /**
   * Builds the canonical individual-member identity VC used by shared SMART VP
   * helpers.
   */
  public getIdentityVC(input: IndividualMemberCredentialInput): Record<string, unknown> {
    return getIndividualMemberIdentityVC(input);
  }

  /**
   * Builds the canonical individual-member identity VP payload used by shared
   * SMART/OpenID4VP helpers.
   */
  public buildIdentityVpPayload(input: IndividualMemberVpPayloadInput): Record<string, unknown> {
    return buildIndividualMemberIdentityVpPayload(input);
  }

  /**
   * Builds one unsigned compact VP JWT for the canonical individual-member
   * identity payload.
   */
  public buildUnsignedIdentityVpJwt(
    input: IndividualMemberVpPayloadInput,
    options: Readonly<{ nowSeconds?: number; ttlSeconds?: number; nonce?: string }> = {},
  ): string {
    return buildUnsignedIndividualMemberIdentityVpJwt(input, options);
  }
}

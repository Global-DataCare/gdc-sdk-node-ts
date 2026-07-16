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
import type { RelatedPersonUpsertInput } from '../resource-operations.js';

export class IndividualMemberSdk {
  constructor(private readonly client: NodeRuntimeClient) {}

  /**
   * Creates or updates the member/caregiver `RelatedPerson` relationship to the subject.
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

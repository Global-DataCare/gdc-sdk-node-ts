// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.
// Always create JSDoc, do not use strings inline in keys nor values, use types instead, and reuse the data test examples.
import {
  buildProfessionalIdentityVpPayload,
  buildUnsignedProfessionalIdentityVpJwt,
  getProfessionalIdentitySameAs,
  getProfessionalIdentityVC,
  type ProfessionalEmployeeCredentialInput,
  type ProfessionalSmartVpPayloadInput,
} from 'gdc-common-utils-ts';
import {
  requireClientMethod,
  submitAndPollWithClient,
  type NodeRuntimeClient,
  type PollOptions,
  type SubmitAndPollResult,
  type SubmitPayload,
} from './client-port.js';
import type { RouteContext } from '../individual-onboarding.js';
import type { SmartTokenExchangeResult, SmartTokenRequestInput } from '../smart-token.js';
import type {
  CommunicationIngestionInput,
  CommunicationParticipantRuntimeSearchInput,
  ClinicalBundleSearchInput,
  GrantProfessionalAccessInput,
  GrantProfessionalAccessResult,
} from '../resource-operations.js';

/**
 * Professional-oriented facade for runtime actions that belong to the
 * professional actor itself after tenant and employee provisioning have already
 * happened through the organization-scoped facades.
 *
 * Keep this boundary strict:
 * - professional runtime actions belong here
 * - organization activation and employee provisioning do not
 */
export class ProfessionalSdk {
  /**
   * @param client Runtime client implementation used to submit and poll GW flows.
   */
  constructor(private readonly client: NodeRuntimeClient) {}

  /**
   * Requests a SMART token suitable for subsequent clinical/document calls.
   *
   * In the canonical flow the caller normally provides:
   * - `actorDid`
   * - `subjectDid`
   * - requested `scopes`
   *
   * Tenant route context can be inherited from the configured
   * `NodeHttpClient({ ctx })` instead of being repeated on every call.
   */
  public requestSmartToken(input: SmartTokenRequestInput): Promise<SmartTokenExchangeResult> {
    return requireClientMethod(this.client, 'requestSmartToken')(input);
  }

  /**
   * Returns the normalized public continuity aliases that would be embedded in
   * the professional identity VC for SMART/OpenID4VP flows.
   */
  public getIdentitySameAs(input: ProfessionalEmployeeCredentialInput): string[] {
    return getProfessionalIdentitySameAs(input);
  }

  /**
   * Builds the canonical professional identity VC used by the shared SMART VP
   * helpers.
   */
  public getIdentityVC(input: ProfessionalEmployeeCredentialInput): Record<string, unknown> {
    return getProfessionalIdentityVC(input);
  }

  /**
   * Builds the canonical professional identity VP payload used by the shared
   * SMART/OpenID4VP helpers.
   */
  public buildIdentityVpPayload(input: ProfessionalSmartVpPayloadInput): Record<string, unknown> {
    return buildProfessionalIdentityVpPayload(input);
  }

  /**
   * Builds one unsigned compact VP JWT for the canonical professional
   * identity payload.
   */
  public buildUnsignedIdentityVpJwt(
    input: ProfessionalSmartVpPayloadInput,
    options: Readonly<{ nowSeconds?: number; ttlSeconds?: number; nonce?: string }> = {},
  ): string {
    return buildUnsignedProfessionalIdentityVpJwt(input, options);
  }

  /**
   * Executes one clinical `Bundle/_search` using the professional actor
   * session and tenant route context.
   */
  public searchClinicalBundle(
    ctx: RouteContext,
    input: ClinicalBundleSearchInput,
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'searchClinicalBundle')(ctx, input);
  }

  /**
   * Reads the latest IPS-oriented document projection available to the
   * professional actor for one subject.
   */
  public getLatestIps(
    ctx: RouteContext,
    input: Omit<ClinicalBundleSearchInput, 'includedTypes'>,
  ): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'getLatestIps')(ctx, input);
  }

  /**
   * Ingests a FHIR `Communication` and waits for indexing.
   */
  public ingestCommunicationAndUpdateIndex(ctx: RouteContext, input: CommunicationIngestionInput): Promise<SubmitAndPollResult> {
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
   * Grants access to a professional through a consent flow.
   */
  public grantProfessionalAccess(ctx: RouteContext, input: GrantProfessionalAccessInput): Promise<GrantProfessionalAccessResult> {
    return requireClientMethod(this.client, 'grantProfessionalAccess')(ctx, input);
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

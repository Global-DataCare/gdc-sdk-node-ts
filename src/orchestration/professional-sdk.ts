// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.
// Always create JSDoc, do not use strings inline in keys nor values, use types instead, and reuse the data test examples.
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

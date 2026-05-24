// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

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
}

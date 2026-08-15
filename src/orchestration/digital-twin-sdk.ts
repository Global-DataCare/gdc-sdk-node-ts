// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import type { RouteContext } from '../individual-onboarding.js';
import type { SmartTokenExchangeResult, SmartTokenRequestInput } from '../smart-token.js';
import type {
  DigitalTwinMaterializationInput,
  DigitalTwinSearchInput,
} from '../digital-twin.js';
import { requireClientMethod, type NodeRuntimeClient, type SubmitAndPollResult } from './client-port.js';

/** Public research facade for licensed digital-twin access. */
export class DigitalTwinSdk {
  private smartAccessToken?: string;

  constructor(private readonly client: NodeRuntimeClient) {}

  /** Requests the SMART token used by subsequent digital-twin operations. */
  public async requestSmartToken(input: SmartTokenRequestInput): Promise<SmartTokenExchangeResult> {
    const result = await requireClientMethod(this.client, 'requestSmartToken')(input);
    if (result.accessToken) this.smartAccessToken = result.accessToken;
    return result;
  }

  /** Searches pseudonymous research records through `digitaltwin/.../_search`. */
  public search(ctx: RouteContext, input: DigitalTwinSearchInput): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'searchDigitalTwins')(ctx, {
      ...input,
      accessToken: input.accessToken || this.smartAccessToken,
    });
  }

  /** Materializes one selected research subject through `ResearchSubject/$summary`. */
  public materialize(ctx: RouteContext, input: DigitalTwinMaterializationInput): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'materializeDigitalTwin')(ctx, {
      ...input,
      accessToken: input.accessToken || this.smartAccessToken,
    });
  }
}

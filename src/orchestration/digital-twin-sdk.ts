// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import type { RouteContext } from '../individual-onboarding.js';
import type { SmartTokenExchangeResult, SmartTokenRequestInput } from '../smart-token.js';
import type {
  DigitalTwinMaterializationInput,
  DigitalTwinSelectionInput,
  DigitalTwinSearchInput,
} from '../digital-twin.js';
import { requireClientMethod, type NodeRuntimeClient, type SubmitAndPollResult } from './client-port.js';

/** Public research facade for licensed digital-twin access. */
export class DigitalTwinSdk {
  private smartAccessToken?: string;
  private researcherDid?: string;

  constructor(private readonly client: NodeRuntimeClient, actorDid?: string) {
    this.researcherDid = String(actorDid || '').trim() || undefined;
  }

  /** Requests the SMART token used by subsequent digital-twin operations. */
  public async requestSmartToken(input: SmartTokenRequestInput): Promise<SmartTokenExchangeResult> {
    const requestedActorDid = String(input.actorDid || '').trim() || undefined;
    if (this.researcherDid && requestedActorDid && requestedActorDid !== this.researcherDid) {
      throw new Error('DigitalTwinSdk actorDid must match the actor session.');
    }
    const actorDid = this.researcherDid || requestedActorDid;
    const result = await requireClientMethod(this.client, 'requestSmartToken')({
      ...input,
      actorDid,
    });
    if (result.accessToken) this.smartAccessToken = result.accessToken;
    if (actorDid) this.researcherDid = actorDid;
    return result;
  }

  /** Searches pseudonymous research records through `digitaltwin/.../_search`. */
  public search(ctx: RouteContext, input: DigitalTwinSearchInput): Promise<SubmitAndPollResult> {
    return requireClientMethod(this.client, 'searchDigitalTwins')(ctx, {
      ...input,
      accessToken: input.accessToken || this.smartAccessToken,
    });
  }

  /**
   * Saves a tagged researcher-owned selection/branch for one matching twin.
   * The canonical clinical twin is never modified.
   */
  public saveSelection(ctx: RouteContext, input: DigitalTwinSelectionInput): Promise<SubmitAndPollResult> {
    const requestedAuthorDid = String(input.authorDid || '').trim() || undefined;
    if (this.researcherDid && requestedAuthorDid && requestedAuthorDid !== this.researcherDid) {
      throw new Error('Digital twin selection authorDid must match the actor session.');
    }
    return requireClientMethod(this.client, 'saveDigitalTwinSelection')(ctx, {
      ...input,
      authorDid: this.researcherDid || requestedAuthorDid,
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

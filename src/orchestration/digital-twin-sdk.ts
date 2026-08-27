// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import { HealthcareConsentPurposes, ServiceCapability } from 'gdc-common-utils-ts/constants';
import { CompositionClaim } from 'gdc-common-utils-ts/models';

import type { RouteContext } from '../individual-onboarding.js';
import type { SmartTokenExchangeResult, SmartTokenRequestInput } from '../smart-token.js';
import type {
  DigitalTwinMaterializationInput,
  DigitalTwinSelectionInput,
  DigitalTwinSearchInput,
  DigitalTwinSearchResult,
} from '../digital-twin.js';
import {
  assertDigitalTwinSubjectId,
  DigitalTwinSearchParameter,
  readDigitalTwinSearchResult,
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
      purpose: input.purpose || HealthcareConsentPurposes.Research,
      scopes: input.scopes?.length ? input.scopes : [ServiceCapability.DigitalTwinReader],
    });
    if (result.accessToken) this.smartAccessToken = result.accessToken;
    if (actorDid) this.researcherDid = actorDid;
    return result;
  }

  /**
   * Searches pseudonymous records and exposes matched Compositions directly.
   *
   * MVP basic search supplies `sections`, `dateFrom`, optional `dateTo`, and
   * `text`. GW resolves an omitted `dateTo` to its current time, applies OR
   * across sections and requires text/date to match the same clinical record.
   * Organization/tenant scope comes from the authenticated SMART token.
   */
  public async search(ctx: RouteContext, input: DigitalTwinSearchInput): Promise<DigitalTwinSearchResult> {
    const filters = { ...(input.filters || {}) };
    const isPrivateSelectionSearch = Object.keys(filters).some((name) => {
      const normalized = String(name || '').trim().toLowerCase();
      return normalized === 'composition.meta-tag' || normalized === 'composition.meta.tag';
    });
    if (isPrivateSelectionSearch) {
      if (!this.researcherDid) {
        throw new Error('Digital twin working-selection search requires an operational actor DID.');
      }
      const requestedAuthor = filters[CompositionClaim.Author];
      const requestedAuthors = Array.isArray(requestedAuthor)
        ? requestedAuthor.map(String)
        : requestedAuthor === undefined
          ? []
          : [String(requestedAuthor)];
      if (requestedAuthors.some((author) => author !== this.researcherDid)) {
        throw new Error('Digital twin selection author filter must match the actor session.');
      }
      filters[CompositionClaim.Author] = this.researcherDid;
    }
    const operation = await requireClientMethod(this.client, 'searchDigitalTwins')(ctx, {
      ...input,
      filters,
      accessToken: input.accessToken || this.smartAccessToken,
    });
    return readDigitalTwinSearchResult(operation);
  }

  /**
   * Saves a tagged researcher-owned working selection for one matching twin.
   * The canonical clinical twin is never modified.
   */
  public saveSelection(ctx: RouteContext, input: DigitalTwinSelectionInput): Promise<SubmitAndPollResult> {
    assertDigitalTwinSubjectId(input.twinSubjectId);
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

  /** Reopens only this employee's saved selections for one exact custom tag. */
  public searchSelections(
    ctx: RouteContext,
    input: Omit<DigitalTwinSearchInput, 'filters'> & {
      section: string;
      tag: Readonly<{ system: string; code: string }>;
    },
  ): Promise<DigitalTwinSearchResult> {
    const section = String(input.section || '').trim();
    const system = String(input.tag?.system || '').trim();
    const code = String(input.tag?.code || '').trim();
    if (!section) throw new Error('Digital twin selection section is required.');
    if (!system || !code) throw new Error('Digital twin selection tag requires system and code.');
    const { section: _section, tag: _tag, ...searchInput } = input;
    return this.search(ctx, {
      ...searchInput,
      filters: {
        [DigitalTwinSearchParameter.Section]: section,
        [DigitalTwinSearchParameter.MetaTag]: `${system}|${code}`,
      },
    });
  }

  /** Materializes one selected research subject through `ResearchSubject/$summary`. */
  public materialize(ctx: RouteContext, input: DigitalTwinMaterializationInput): Promise<SubmitAndPollResult> {
    assertDigitalTwinSubjectId(input.twinSubjectId);
    return requireClientMethod(this.client, 'materializeDigitalTwin')(ctx, {
      ...input,
      accessToken: input.accessToken || this.smartAccessToken,
    });
  }
}

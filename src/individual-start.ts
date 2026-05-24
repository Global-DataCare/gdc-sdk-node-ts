// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import {
  ClaimsOrganizationSchemaorg,
  ClaimsPersonSchemaorg,
  ClaimsServiceSchemaorg,
} from 'gdc-common-utils-ts/constants';
import { resolvePollOptionsFromSeconds } from './poll-options.js';
import type { PollOptions, SubmitAndPollResult } from './orchestration/client-port.js';
import type { RouteContext } from './individual-onboarding.js';

export type IndividualOrganizationBootstrapInput = {
  /**
   * Preferred route identifier for the selected personal indexing service provider.
   *
   * This is not the tax ID of a professional organization. In the individual
   * indexing journey it should identify the selected service provider that will
   * host or activate the individual's index.
   */
  serviceProviderDid?: string;
  /**
   * @deprecated Use `serviceProviderDid`.
   */
  tenantId?: string;
  jurisdiction?: string;
  sector?: string;
  /**
   * Friendly alias/nickname shown in the frontend for the individual profile.
   *
   * This is not the technical subject identifier. It is the nearby name the
   * controller uses to refer to the person in the UI, for example `Charly`.
   */
  alternateName: string;
  /**
   * CORE-canonical controller contact channel for individual bootstrap.
   *
   * In the individual/family bootstrap flow the contact channel is published
   * as `org.schema.Organization.owner.email`, because the person is acting as
   * owner/controller of a subject index organization.
   *
   * This differs from legal-organization activation, where the human
   * representative is modeled as a `Person` member/representative of the legal
   * organization and the VC/policy contract uses `credentialSubject.memberOf`
   * plus `credentialSubject.hasOccupation`.
   *
   * Prefer email in shared examples and docs. It is stable as a general CORE
   * GW identifier and does not assume a phone-notification extension.
   */
  controllerEmail?: string;
  /**
   * Compatibility/extension field.
   *
   * In the individual/family bootstrap flow this maps to
   * `org.schema.Organization.owner.telephone`.
   *
   * Telephone-driven onboarding is not required by CORE GW. Keep this only for
   * deployments that add phone-first notification or consent extensions such as
   * UNID GW.
   */
  controllerTelephone?: string;
  controllerRole?: string;
  additionalClaims?: Record<string, unknown>;
  timeoutSeconds?: number;
  intervalSeconds?: number;
};

export type OfferPreview = {
  offerId?: string;
  amount?: string;
  currency?: string;
  seats?: number | undefined;
  planName?: string;
  sku?: string;
  paymentMethod?: string;
  checkoutUrl?: string;
};

export type IndividualOrganizationStartResult = {
  registration: SubmitAndPollResult;
  offerId: string;
  offerPreview: OfferPreview;
};

type StartIndividualOrganizationDeps = {
  input: IndividualOrganizationBootstrapInput;
  routeCtx: RouteContext;
  defaultTimeoutMs?: number;
  defaultIntervalMs?: number;
  individualFamilyOrganizationBatchPath: (ctx: RouteContext) => string;
  individualFamilyOrganizationPollPath: (ctx: RouteContext) => string;
  submitAndPoll: (
    submitPath: string,
    pollPath: string,
    payload: { thid?: string } & Record<string, unknown>,
    options?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
  assertFirstDidcommEntrySuccess?: (
    result: SubmitAndPollResult,
    contextLabel: string,
  ) => void;
  getOfferIdFromResponse: (result: SubmitAndPollResult) => string | undefined;
  getOfferPreviewFromResponse: (result: SubmitAndPollResult) => OfferPreview;
};

export async function startIndividualOrganizationWithDeps(
  deps: StartIndividualOrganizationDeps,
): Promise<IndividualOrganizationStartResult> {
  /**
   * Important semantic split:
   *
   * - individual/family bootstrap uses `Organization.owner.*` claims because the
   *   human controller owns the subject-index organization
   * - legal organization activation uses `Person.*` plus VC membership/role
   *   semantics for the legal representative of an existing organization
   *
   * The node SDK keeps both `Organization.owner.*` and `Person.*` contact claims
   * in the payload for compatibility, but the owner claims are the live GW
   * routing/indexing contract for this flow.
   */
  const alternateName = String(deps.input.alternateName || '').trim();
  if (!alternateName) {
    throw new Error('bootstrapIndividualOrganization requires alternateName.');
  }
  const controllerEmail = String(deps.input.controllerEmail || '').trim();
  const controllerTelephone = String(deps.input.controllerTelephone || '').trim();
  if (!controllerEmail && !controllerTelephone) {
    throw new Error('bootstrapIndividualOrganization requires controllerEmail, or controllerTelephone only for compatibility/extension flows.');
  }
  const controllerRole = String(deps.input.controllerRole || 'RESPRSN').trim();

  const claims: Record<string, unknown> = {
    '@context': 'org.schema',
    [ClaimsOrganizationSchemaorg.alternateName]: alternateName,
    [ClaimsServiceSchemaorg.category]: deps.routeCtx.sector,
    [ClaimsPersonSchemaorg.hasOccupationalRoleValue]: controllerRole,
    ...(controllerEmail
      ? {
          [ClaimsOrganizationSchemaorg.ownerEmail]: controllerEmail,
          [ClaimsPersonSchemaorg.email]: controllerEmail,
        }
      : {}),
    ...(controllerTelephone
      ? {
          [ClaimsOrganizationSchemaorg.ownerTelephone]: controllerTelephone,
          [ClaimsPersonSchemaorg.telephone]: controllerTelephone,
        }
      : {}),
    ...(deps.input.additionalClaims || {}),
  };

  const registrationPayload = {
    jti: `jti-${createRuntimeUuid()}`,
    iss: deps.routeCtx.tenantId,
    aud: deps.routeCtx.tenantId,
    type: 'application/didcomm-plain+json',
    thid: `family-org-${createRuntimeUuid()}`,
    body: {
      data: [{
        type: 'SubjectOrg-registration-form-v1.0',
        meta: { claims },
        resource: { meta: { claims } },
      }],
    },
  };

  const pollOptions = resolvePollOptionsFromSeconds(
    deps.input.timeoutSeconds,
    deps.input.intervalSeconds,
    {
      timeoutMs: deps.defaultTimeoutMs,
      intervalMs: deps.defaultIntervalMs,
    },
  );

  const registration = await deps.submitAndPoll(
    deps.individualFamilyOrganizationBatchPath(deps.routeCtx),
    deps.individualFamilyOrganizationPollPath(deps.routeCtx),
    registrationPayload,
    pollOptions,
  );

  deps.assertFirstDidcommEntrySuccess?.(registration, 'startIndividualOrganization.registration');

  const offerId = deps.getOfferIdFromResponse(registration);
  if (!offerId) {
    throw new Error('startIndividualOrganization failed: missing offerId in registration response.');
  }

  return {
    registration,
    offerId,
    offerPreview: deps.getOfferPreviewFromResponse(registration),
  };
}

function createRuntimeUuid(): string {
  const fromCrypto = globalThis.crypto?.randomUUID?.();
  if (fromCrypto) {
    return fromCrypto;
  }
  return `fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

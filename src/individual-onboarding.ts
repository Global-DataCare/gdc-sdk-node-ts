// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import {
  HealthcareActorRoleCodes,
  HL7_CODING_SYSTEM_V3_ROLE_CODE,
  extractPrimaryClaims,
  readRelatedPersonListRecords,
} from 'gdc-common-utils-ts';
import type { DataspaceSector } from 'gdc-common-utils-ts/constants';
import type { PollOptions, SubmitAndPollResult } from './orchestration/client-port.js';
import { resolvePollOptionsFromSeconds } from './poll-options.js';

export type RouteContext = {
  tenantId: string;
  jurisdiction: string;
  sector: DataspaceSector | string;
};

export type IndividualOrganizationConfirmOrderInput = {
  /**
   * Preferred route identifier for the selected personal indexing service provider.
   */
  serviceProviderDid?: string;
  /**
   * @deprecated Use `serviceProviderDid`.
   */
  tenantId?: string;
  jurisdiction?: string;
  sector?: string;
  offerId: string;
  additionalClaims?: Record<string, unknown>;
  timeoutSeconds?: number;
  intervalSeconds?: number;
};

/**
 * Terminal individual Order result with the opaque code required by the
 * subsequent managed-wallet activation and DCR flow.
 */
export type IndividualOrganizationOrderResult = SubmitAndPollResult & Readonly<{
  activationCode: string;
  /**
   * Governed `RelatedPerson.identifier` automatically materialized by GW for
   * the principal Organization owner/controller. Current GW values use the
   * `urn:uuid:<UUID>` form.
   */
  controllerRelatedPersonIdentifier: string;
  /**
   * @deprecated Use `controllerRelatedPersonIdentifier`, which states the
   * resource represented by this identifier.
   */
  controllerAssignmentIdentifier: string;
}>;

type ConfirmIndividualOrganizationOrderDeps = {
  input: IndividualOrganizationConfirmOrderInput;
  routeCtx: RouteContext;
  defaultTimeoutMs?: number;
  defaultIntervalMs?: number;
  individualFamilyOrderBatchPath: (ctx: RouteContext) => string;
  individualFamilyOrderPollPath: (ctx: RouteContext) => string;
  submitAndPoll: (
    submitPath: string,
    pollPath: string,
    payload: { thid?: string } & Record<string, unknown>,
    options?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
};

export async function confirmIndividualOrganizationOrderWithDeps(
  deps: ConfirmIndividualOrganizationOrderDeps,
): Promise<IndividualOrganizationOrderResult> {
  /**
   * Programming rule:
   * - `offerId` here must come from the commercial individual/family bootstrap
   *   response
   * - this helper must not be used for embedded legacy individual registration
   *   responses that do not mint an Offer
   */
  const offerId = String(deps.input.offerId || '').trim();
  if (!offerId) {
    throw new Error('confirmIndividualOrganizationOrder requires offerId.');
  }

  const orderClaims: Record<string, unknown> = {
    '@context': 'org.schema',
    'Order.acceptedOffer.identifier': offerId,
    ...(deps.input.additionalClaims || {}),
  };

  const payload = {
    jti: `jti-${createRuntimeUuid()}`,
    iss: deps.routeCtx.tenantId,
    aud: deps.routeCtx.tenantId,
    type: 'application/didcomm-plain+json',
    thid: `family-order-${createRuntimeUuid()}`,
    body: {
      data: [{
        type: 'Family-order-request-v1.0',
        resource: { meta: { claims: orderClaims } },
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

  const order = await deps.submitAndPoll(
    deps.individualFamilyOrderBatchPath(deps.routeCtx),
    deps.individualFamilyOrderPollPath(deps.routeCtx),
    payload,
    pollOptions,
  );
  const activationCode = readIndividualOrganizationActivationCode(order.poll.body);
  if (!activationCode) {
    throw new Error('confirmIndividualOrganizationOrder failed: missing controller activation code in GW Order response.');
  }
  const controllerAssignmentIdentifier = readIndividualOrganizationControllerAssignmentIdentifier(
    order.poll.body,
  );
  if (!controllerAssignmentIdentifier) {
    throw new Error('confirmIndividualOrganizationOrder failed: missing automatic controller RESPRSN assignment in GW Order response.');
  }
  return {
    ...order,
    activationCode,
    controllerRelatedPersonIdentifier: controllerAssignmentIdentifier,
    controllerAssignmentIdentifier,
  };
}

/**
 * Reads the opaque controller activation code from a completed individual
 * Order. Integrators should consume `result.activationCode` instead of calling
 * this reader directly; it remains public for response-adapter compatibility.
 */
export function readIndividualOrganizationActivationCode(responseBody: unknown): string | undefined {
  const claims = extractPrimaryClaims(responseBody);
  return String(claims['org.schema.IndividualProduct.serialNumber'] || '').trim() || undefined;
}

/**
 * Reads the principal owner/controller assignment that GW creates during the
 * same Order transition as the individual controller licence. This is a
 * projection from the returned RelatedPerson `resource.meta.claims`; it is not
 * an Order claim and callers must not pre-create or search for it.
 */
export function readIndividualOrganizationControllerAssignmentIdentifier(
  responseBody: unknown,
): string | undefined {
  const expectedRelationship = `${HL7_CODING_SYSTEM_V3_ROLE_CODE}|${HealthcareActorRoleCodes.Controller}`;
  return readRelatedPersonListRecords(responseBody)
    .find((record) => record.identifier
      && record.relationship === expectedRelationship
      && record.active !== 'false')
    ?.identifier;
}

function createRuntimeUuid(): string {
  const fromCrypto = globalThis.crypto?.randomUUID?.();
  if (fromCrypto) {
    return fromCrypto;
  }
  return `fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

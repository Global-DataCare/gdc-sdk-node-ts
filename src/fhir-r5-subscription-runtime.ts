// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import {
  FhirR5SubscriptionScopes,
  buildFhirR5SubscriptionBatch,
  type FhirR5Subscription,
  type FhirR5SubscriptionScope,
  type FhirR5SubscriptionTopic,
} from 'gdc-common-utils-ts/models/fhir-r5-subscription';
import type { RouteContext } from './individual-onboarding.js';
import type { PollOptions, SubmitAndPollResult, SubmitPayload } from './orchestration/client-port.js';

export interface FhirR5SubscriptionBatchInput {
  subscription: FhirR5Subscription;
  scope: FhirR5SubscriptionScope;
}

type SubmitAndPoll = (
  submitPath: string,
  pollPath: string,
  payload: SubmitPayload,
  pollOptions?: PollOptions,
) => Promise<SubmitAndPollResult>;

type SubscriptionRuntimeDeps = {
  createRuntimeUuid: () => string;
  submitPath: (ctx: RouteContext, section: 'entity' | 'individual') => string;
  pollPath: (ctx: RouteContext, section: 'entity' | 'individual') => string;
  submitAndPoll: SubmitAndPoll;
};

function gatewayPayload(createRuntimeUuid: () => string, body: Record<string, unknown>): SubmitPayload {
  return {
    jti: `fhir-r5-subscription-jti-${createRuntimeUuid()}`,
    thid: `fhir-r5-subscription-${createRuntimeUuid()}`,
    type: 'application/fhir+json',
    body,
  };
}

/** Registers one active topic definition in GW CORE's neutral tenant catalog. */
export function submitFhirR5SubscriptionTopicBatchWithDeps(
  ctx: RouteContext,
  topic: FhirR5SubscriptionTopic,
  pollOptions: PollOptions | undefined,
  deps: Omit<SubscriptionRuntimeDeps, 'submitPath' | 'pollPath'> & {
    submitPath: (ctx: RouteContext) => string;
    pollPath: (ctx: RouteContext) => string;
  },
): Promise<SubmitAndPollResult> {
  const body = {
    resourceType: 'Bundle', type: 'batch',
    entry: [{ request: { method: 'POST', url: 'SubscriptionTopic' }, resource: topic }],
  };
  return deps.submitAndPoll(
    deps.submitPath(ctx), deps.pollPath(ctx), gatewayPayload(deps.createRuntimeUuid, body), pollOptions,
  );
}

/**
 * Registers one neutral rest-hook Subscription. Individual scope maps to the
 * individual section and retains the exact patient/subject validation owned by
 * Common Utils and GW CORE; tenant scope maps to entity.
 */
export function submitFhirR5SubscriptionBatchWithDeps(
  ctx: RouteContext,
  input: FhirR5SubscriptionBatchInput,
  pollOptions: PollOptions | undefined,
  deps: SubscriptionRuntimeDeps,
): Promise<SubmitAndPollResult> {
  const section = input.scope === FhirR5SubscriptionScopes.Individual ? 'individual' : 'entity';
  const batch = buildFhirR5SubscriptionBatch(input.subscription, input.scope);
  return deps.submitAndPoll(
    deps.submitPath(ctx, section), deps.pollPath(ctx, section),
    gatewayPayload(deps.createRuntimeUuid, batch.body), pollOptions,
  );
}


// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.
import type { OrganizationDidBindingInput } from 'gdc-sdk-core-ts';
import type { OrganizationActivationDraft } from 'gdc-sdk-core-ts';
import {
  buildLegalOrganizationVerificationGatewayRequestBundle,
  buildOrganizationDidBindingBundle,
} from 'gdc-sdk-core-ts';
import { buildDidcommPlaintextTransportMetadata } from 'gdc-common-utils-ts/utils/activation-request';
import type { HostRouteContext } from './host-onboarding.js';
import type {
  NodeLegalOrganizationVerificationTransactionInput,
  NodeOrganizationActivationInput,
  NodeOrganizationDidBindingInput,
  PollOptions,
  SubmitAndPollResult,
  SubmitPayload,
} from './orchestration/client-port.js';
import type { RouteContext } from './individual-onboarding.js';

type SubmitAndPollMethod = (
  submitPath: string,
  pollPath: string,
  payload: SubmitPayload,
  pollOptions?: PollOptions,
) => Promise<SubmitAndPollResult>;

export async function submitLegalOrganizationVerificationTransactionWithDeps(input: {
  hostCtx: HostRouteContext;
  verificationInput: NodeLegalOrganizationVerificationTransactionInput;
  pollOptions?: PollOptions;
  createRuntimeUuid: () => string;
  wrapBundleAsGatewayTransactionMessage: (input: {
    thid: string;
    jti: string;
    hostCtx: HostRouteContext;
    bundle: ReturnType<typeof buildLegalOrganizationVerificationGatewayRequestBundle>;
  }) => SubmitPayload;
  submitPath: (ctx: HostRouteContext) => string;
  pollPath: (ctx: HostRouteContext) => string;
  submitAndPoll: SubmitAndPollMethod;
}): Promise<SubmitAndPollResult> {
  const thid = `organization-verification-transaction-${input.createRuntimeUuid()}`;
  const jti = `organization-verification-transaction-jti-${input.createRuntimeUuid()}`;
  const verificationBundle = buildLegalOrganizationVerificationGatewayRequestBundle(input.verificationInput);
  const payload = input.wrapBundleAsGatewayTransactionMessage({
    thid,
    jti,
    hostCtx: input.hostCtx,
    bundle: verificationBundle,
  });
  return input.submitAndPoll(
    input.submitPath(input.hostCtx),
    input.pollPath(input.hostCtx),
    payload,
    input.pollOptions,
  );
}

export async function submitLegalOrganizationIssueWithDeps(input: {
  hostCtx: HostRouteContext;
  verificationInput: NodeLegalOrganizationVerificationTransactionInput;
  pollOptions?: PollOptions;
  createRuntimeUuid: () => string;
  wrapBundleAsGatewayTransactionMessage: (input: {
    thid: string;
    jti: string;
    hostCtx: HostRouteContext;
    bundle: ReturnType<typeof buildLegalOrganizationVerificationGatewayRequestBundle>;
  }) => SubmitPayload;
  submitPath: (ctx: HostRouteContext) => string;
  pollPath: (ctx: HostRouteContext) => string;
  submitAndPoll: SubmitAndPollMethod;
}): Promise<SubmitAndPollResult> {
  const thid = `organization-issue-${input.createRuntimeUuid()}`;
  const jti = `organization-issue-jti-${input.createRuntimeUuid()}`;
  const verificationBundle = buildLegalOrganizationVerificationGatewayRequestBundle(input.verificationInput);
  const payload = input.wrapBundleAsGatewayTransactionMessage({
    thid,
    jti,
    hostCtx: input.hostCtx,
    bundle: verificationBundle,
  });
  return input.submitAndPoll(
    input.submitPath(input.hostCtx),
    input.pollPath(input.hostCtx),
    payload,
    input.pollOptions,
  );
}

export async function submitOrganizationDidBindingWithDeps(input: {
  routeCtx: RouteContext;
  bindingInput: NodeOrganizationDidBindingInput | OrganizationDidBindingInput;
  pollOptions?: PollOptions;
  createRuntimeUuid: () => string;
  organizationDidBindingPath: (ctx: RouteContext) => string;
  organizationDidBindingPollPath: (ctx: RouteContext) => string;
  submitAndPoll: SubmitAndPollMethod;
}): Promise<SubmitAndPollResult> {
  const thid = `organization-did-binding-${input.createRuntimeUuid()}`;
  const jti = `organization-did-binding-jti-${input.createRuntimeUuid()}`;
  const payload: SubmitPayload = {
    jti,
    thid,
    type: 'application/api+json',
    body: buildOrganizationDidBindingBundle(input.bindingInput),
  };
  return input.submitAndPoll(
    input.organizationDidBindingPath(input.routeCtx),
    input.organizationDidBindingPollPath(input.routeCtx),
    payload,
    input.pollOptions,
  );
}

export async function activateOrganizationInGatewayFromIcaProofWithDeps(input: {
  hostCtx: HostRouteContext;
  activationInput: NodeOrganizationActivationInput;
  pollOptions?: PollOptions;
  createRuntimeUuid: () => string;
  activationDraftFactory: (input: {
    vpToken: string;
    controller?: NodeOrganizationActivationInput['controller'];
    service?: NodeOrganizationActivationInput['service'];
    additionalClaims?: NodeOrganizationActivationInput['additionalClaims'];
  }) => OrganizationActivationDraft;
  submitPath: (ctx: HostRouteContext) => string;
  pollPath: (ctx: HostRouteContext) => string;
  submitAndPoll: SubmitAndPollMethod;
}): Promise<SubmitAndPollResult> {
  const thid = `activate-org-${input.createRuntimeUuid()}`;
  const activationDraft = input.activationDraftFactory({
    vpToken: input.activationInput.vpToken,
    controller: input.activationInput.controller,
    service: input.activationInput.service,
    additionalClaims: input.activationInput.additionalClaims,
  });
  const serviceClaims = activationDraft.buildServiceClaims();
  const transportMeta = buildDidcommPlaintextTransportMetadata({
    controller: input.activationInput.controller,
    contentType: 'application/didcomm-plain+json',
  });
  const payload: SubmitPayload = {
    thid,
    iss: String(input.hostCtx.controllerDid || '').trim() || undefined,
    aud: String(input.hostCtx.hostDid || '').trim() || undefined,
    type: 'application/api+json',
    ...(transportMeta ? { meta: transportMeta } : {}),
    body: {
      vp_token: input.activationInput.vpToken,
      ...(input.activationInput.controller ? { controller: input.activationInput.controller } : {}),
      data: [{
        type: 'Organization-activation-request-v1.0',
        meta: {
          claims: {
            '@context': 'org.schema',
            ...serviceClaims,
            ...(input.activationInput.additionalClaims || {}),
          },
        },
        resource: {
          meta: {
            claims: {
              '@context': 'org.schema',
              ...serviceClaims,
              ...(input.activationInput.additionalClaims || {}),
            },
          },
        },
      }],
    },
  };
  return input.submitAndPoll(
    input.submitPath(input.hostCtx),
    input.pollPath(input.hostCtx),
    payload,
    input.pollOptions,
  );
}

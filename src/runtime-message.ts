// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import type { BundleJsonApi } from 'gdc-common-utils-ts/models/bundle';
import { runtimeUuid as buildRuntimeUuid } from 'gdc-common-utils-ts/utils/communication-attached-bundle-session-helpers';
import type { HostRouteContext } from './host-onboarding.js';
import type { SubmitPayload } from './orchestration/client-port.js';

export function wrapBundleAsGatewayTransactionMessage(input: Readonly<{
  thid: string;
  jti: string;
  hostCtx: HostRouteContext;
  bundle: BundleJsonApi;
}>): SubmitPayload {
  const rawBundle = ((input.bundle || {}) as unknown) as Record<string, unknown>;
  const attachments = Array.isArray(rawBundle.attachments) ? rawBundle.attachments : undefined;
  const { attachments: _ignoredAttachments, ...body } = rawBundle;
  return {
    jti: input.jti,
    thid: input.thid,
    iss: String(input.hostCtx.controllerDid || '').trim() || undefined,
    aud: String(input.hostCtx.hostDid || '').trim() || undefined,
    type: 'application/api+json',
    body,
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
  };
}

export function runtimeUuid(): string {
  return buildRuntimeUuid('runtime');
}

// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import { HealthcareConsentPurposes } from 'gdc-common-utils-ts/constants';
import { buildClientAssertionJwt, type BuildClientAssertionJwtInput } from 'gdc-common-utils-ts/utils/client-assertion';
import type { SmartTokenRequestContract } from 'gdc-sdk-core-ts';
import { resolvePollOptionsFromSeconds } from './poll-options.js';
import type { PollOptions, SubmitAndPollResult } from './orchestration/client-port.js';
import type { RouteContext } from './individual-onboarding.js';

/**
 * Public SDK input for GW SMART/OpenID token requests.
 *
 * Separation of concerns:
 * - actor identity is carried by `actorDid`
 * - subject access is carried by `subjectDid` plus requested `scopes`
 * - tenant/jurisdiction/sector are only route hints
 *   for the current GW transport contract when the client does not already
 *   have a default route context configured
 *
 * Why this route context still exists:
 * the current CORE GW token endpoint is tenant-scoped in the URL itself, for
 * example:
 * `/{tenantId}/cds-{jurisdiction}/v1/{sector}/identity/openid/smart/token`
 *
 * So the route context selects which gateway tenant, consent store, and token
 * issuer is answering the request. It is not the same thing as the actor DID
 * carried inside the request body as `sub`.
 *
 * Current implementation status:
 * - actor DID, subject DID, and client/device identity are separated at input level
 * - the runtime still depends on tenant-scoped GW URLs
 *
 * Pending convergence work:
 * - resolve token endpoints from provider DID documents / discovery metadata
 * - avoid route-context fallback when resolved provider metadata is already available
 *
 * Canonical payload examples for both token-exchange and OpenID4VP SMART flows
 * live in `gdc-common-utils-ts/examples`.
 */
export type SmartTokenRequestInput = SmartTokenRequestContract & {
  /**
   * @deprecated Prefer configuring `NodeHttpClient({ ctx })`.
   */
  tenantId?: string;
  /**
   * @deprecated Prefer configuring `NodeHttpClient({ ctx })`.
   */
  jurisdiction?: string;
  /**
   * @deprecated Prefer configuring `NodeHttpClient({ ctx })`.
   */
  sector?: string;
  /**
   * OpenID token or subject token already obtained by the caller.
   */
  /**
   * Optional helper input used by the Node SDK to auto-generate one
   * `client_assertion` when the caller does not provide one explicitly.
   *
   * `clientId` and `audience` are resolved from the surrounding SMART request
   * input and therefore omitted here.
   */
  clientAssertionBuilder?: Omit<BuildClientAssertionJwtInput, 'clientId' | 'audience'>;
  redirectUri?: string;
  acrValues?: string;
  codeChallenge?: string;
  codeChallengeMethod?: 'S256';
  presentationSubmission?: Record<string, unknown>;
  purpose?: string;
  requestBodyClaims?: Record<string, unknown>;
  smartTokenKind?: 'token-exchange' | 'openid-smart';
  tokenCacheKey?: string;
  endpointId?: string;
  timeoutSeconds?: number;
  intervalSeconds?: number;
};

export type SmartTokenExchangeResult = {
  status: 'fetched' | 'cached' | 'failed';
  accessToken?: string;
  tokenType?: string;
  scopes?: string[];
  statusCode?: number;
  response?: unknown;
};

type CachedTokenWrite = {
  accessToken: string;
  tokenType: string;
  scopes: string[];
  expiresAt: number;
};

type RequestSmartTokenDeps = {
  input: SmartTokenRequestInput;
  routeCtx: RouteContext;
  baseUrl: string;
  defaultTimeoutMs?: number;
  defaultIntervalMs?: number;
  identityTokenExchangePath: (ctx: RouteContext) => string;
  identityTokenExchangePollPath: (ctx: RouteContext) => string;
  identityOpenIdSmartTokenPath: (ctx: RouteContext) => string;
  identityOpenIdSmartTokenPollPath: (ctx: RouteContext) => string;
  submitAndPoll: (
    submitPath: string,
    pollPath: string,
    payload: { thid?: string } & Record<string, unknown>,
    options?: PollOptions,
  ) => Promise<SubmitAndPollResult>;
  setTokenCache: (tokenCacheKey: string, token: CachedTokenWrite) => void;
};

/**
 * Executes the current GW token flow using injected transport dependencies.
 *
 * Implemented today:
 * - token-exchange flow
 * - OpenID4VP/SMART flow with `vp_token`
 * - normalized polling and token-cache writeback
 *
 * Still pending:
 * - endpoint resolution from provider DID metadata instead of route concatenation
 * - first-class runtime use of `DiscoveryFacade`/`IdentityStore`
 */
export async function requestSmartTokenWithDeps(
  deps: RequestSmartTokenDeps,
): Promise<SmartTokenExchangeResult> {
  const normalizedScopes = Array.from(new Set((deps.input.scopes || []).filter(Boolean))).sort();
  const tokenCacheKey = String(
    deps.input.tokenCacheKey || deps.input.endpointId || `smart:${deps.routeCtx.tenantId}:${normalizedScopes.join(',')}`,
  ).trim();
  if (!tokenCacheKey) {
    throw new Error('requestSmartToken requires tokenCacheKey (or non-empty scopes).');
  }

  const pollOptions = resolvePollOptionsFromSeconds(
    deps.input.timeoutSeconds,
    deps.input.intervalSeconds,
    {
      timeoutMs: deps.defaultTimeoutMs,
      intervalMs: deps.defaultIntervalMs,
    },
  );

  if (deps.input.smartTokenKind === 'openid-smart') {
    const actorDid = String(deps.input.actorDid || '').trim() || undefined;
    const resolvedClientId = deps.input.clientId || actorDid || deps.input.subjectDid || deps.routeCtx.tenantId;
    const resolvedAudience = deps.input.audience || deps.routeCtx.tenantId;
    const clientAssertion = await resolveClientAssertion({
      clientAssertion: deps.input.clientAssertion,
      clientAssertionBuilder: deps.input.clientAssertionBuilder,
      clientId: resolvedClientId,
      audience: resolvedAudience,
    });
    const smartPayload: Record<string, unknown> = {
      thid: `smart-${createRuntimeUuid()}`,
      iss: deps.input.issuer || resolvedClientId || deps.routeCtx.tenantId,
      aud: resolvedAudience,
      body: {
        client_id: resolvedClientId,
        ...(clientAssertion ? {
          client_assertion: clientAssertion,
          client_assertion_type: deps.input.clientAssertionType || 'private_key_jwt',
        } : {}),
        redirect_uri: deps.input.redirectUri || `${deps.baseUrl}/callback`,
        code_challenge: deps.input.codeChallenge || 'demo-code-challenge',
        code_challenge_method: deps.input.codeChallengeMethod || 'S256',
        acr_values: deps.input.acrValues || 'urn:antifraud:acr:openid4vp:employee',
        vp_token: deps.input.vpToken || deps.input.idToken,
        presentation_submission: deps.input.presentationSubmission,
        expires_in: 300,
        token_type: 'Bearer',
        sub: actorDid || deps.input.issuer || deps.input.clientId || deps.routeCtx.tenantId,
        purpose: deps.input.purpose || HealthcareConsentPurposes.Treatment,
        scope: normalizedScopes.join(' '),
        ...(deps.input.requestBodyClaims || {}),
      },
      ...(deps.input.additionalClaims || {}),
    };

    const exchange = await deps.submitAndPoll(
      deps.identityOpenIdSmartTokenPath(deps.routeCtx),
      deps.identityOpenIdSmartTokenPollPath(deps.routeCtx),
      smartPayload,
      pollOptions,
    );

    return resolveTokenExchangeResult(exchange, normalizedScopes, tokenCacheKey, deps.setTokenCache);
  }

  const payload: Record<string, unknown> = {
    thid: `exchange-${createRuntimeUuid()}`,
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
    subject_token: deps.input.idToken,
    scope: normalizedScopes.join(' '),
    organization: deps.routeCtx.tenantId,
    ...(deps.input.actorDid ? { sub: deps.input.actorDid } : {}),
    ...(deps.input.additionalClaims || {}),
  };

  const exchange = await deps.submitAndPoll(
    deps.identityTokenExchangePath(deps.routeCtx),
    deps.identityTokenExchangePollPath(deps.routeCtx),
    payload,
    pollOptions,
  );

  return resolveTokenExchangeResult(exchange, normalizedScopes, tokenCacheKey, deps.setTokenCache);
}

async function resolveClientAssertion(input: {
  clientAssertion?: string;
  clientAssertionBuilder?: Omit<BuildClientAssertionJwtInput, 'clientId' | 'audience'>;
  clientId: string;
  audience: string;
}): Promise<string | undefined> {
  const explicit = String(input.clientAssertion || '').trim();
  if (explicit) return explicit;
  if (!input.clientAssertionBuilder) return undefined;
  return buildClientAssertionJwt({
    ...input.clientAssertionBuilder,
    clientId: input.clientId,
    audience: input.audience,
  });
}

function resolveTokenExchangeResult(
  exchange: SubmitAndPollResult,
  normalizedScopes: string[],
  tokenCacheKey: string,
  setTokenCache: (tokenCacheKey: string, token: CachedTokenWrite) => void,
): SmartTokenExchangeResult {
  const exchangeBody = (exchange.poll.body as Record<string, unknown>) ?? {};
  const accessToken = String(exchangeBody.access_token || '').trim();
  if (exchange.poll.status >= 400 || !accessToken) {
    return {
      status: 'failed',
      statusCode: exchange.poll.status,
      response: exchange.poll.body,
    };
  }

  const tokenType = String(exchangeBody.token_type || 'Bearer');
  const grantedScopes = String(exchangeBody.scope || '').trim().split(' ').filter(Boolean);
  const resolvedScopes = grantedScopes.length ? grantedScopes : normalizedScopes;
  const expiresIn = Number(exchangeBody.expires_in ?? 0);
  setTokenCache(tokenCacheKey, {
    accessToken,
    tokenType,
    scopes: resolvedScopes,
    expiresAt: Date.now() + expiresIn * 1000,
  });

  return {
    status: 'fetched',
    accessToken,
    tokenType,
    scopes: resolvedScopes,
    statusCode: exchange.poll.status,
    response: exchange.poll.body,
  };
}

function createRuntimeUuid(): string {
  const fromCrypto = globalThis.crypto?.randomUUID?.();
  if (fromCrypto) {
    return fromCrypto;
  }
  return `fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

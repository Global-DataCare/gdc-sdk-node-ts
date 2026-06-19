/**
 * Live actor-profile E2E for the current professional runtime slice.
 *
 * This suite is intentionally different from the GW CORE platform lifecycle
 * suite:
 *
 * - it assumes one tenant/runtime context is already operational
 * - it begins with `loadProfile(...)`
 * - it validates one actor-oriented flow
 * - it cleans up only runtime-owned profile state from this scenario
 *
 * Run this suite from the user's real terminal/TTY.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXAMPLE_DEVICE_CLIENT_ID,
  EXAMPLE_EMAIL_PROFESSIONAL,
  EXAMPLE_HEALTHCARE_ACTOR_ROLE_PHYSICIAN,
  EXAMPLE_LIVE_CONSENT_GRANT_INPUT,
  EXAMPLE_JURISDICTION,
  EXAMPLE_LIVE_GW_BASE_URL_LOCAL,
  EXAMPLE_PROFILE_APP_TYPE_FAMILY,
  EXAMPLE_PROFILE_KEY_ACCESS_MODE_SERVER,
  EXAMPLE_PROFILE_LOCAL_PIN_PASSWORD_BACKEND,
  EXAMPLE_PROFILE_PROVIDER_DID,
  EXAMPLE_PROFESSIONAL_DID,
  EXAMPLE_PROFILE_RUNTIME_CLASS_SERVER,
  EXAMPLE_SECTOR,
  EXAMPLE_SMART_PRESENTATION_SUBMISSION,
  EXAMPLE_SUBJECT_DID,
  EXAMPLE_TENANT_IDENTIFIER,
  cloneExample,
} from 'gdc-common-utils-ts/examples';
import { HealthcareBasicSections } from 'gdc-common-utils-ts/constants';
import { buildSmartCompositionReadScope } from 'gdc-common-utils-ts/utils/smart-scope';
import {
  ActorKinds,
  closeBackendProfile,
  DirectBackendProfileRuntime,
  loadBackendProfile,
  prepareLoadProfile,
  requireBackendActorSession,
} from '../dist/index.js';
import {
  buildUnsignedJwt,
  buildUnsignedProfessionalSmartVpJwt,
} from './helpers/vp-token-fixture.mjs';
import {
  createRuntimeClient,
  ensureLiveGwTraceFiles,
} from './helpers/live-gw-runtime-helpers.mjs';

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim();
}

function isEnabledByDefault(name, fallback = '1') {
  const normalized = env(name, fallback).toLowerCase();
  return normalized !== '0' && normalized !== 'false' && normalized !== 'no';
}

const RUN = isEnabledByDefault('RUN_LIVE_PROFILE_RUNTIME_PROFESSIONAL_E2E', '1');
const DEBUG = env('LIVE_PROFILE_RUNTIME_PROFESSIONAL_E2E_DEBUG', '0') === '1';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const suiteTenantId = env('TENANT_ID', EXAMPLE_TENANT_IDENTIFIER);
const suiteTenantRouteId = env('TENANT_ROUTE_ID', suiteTenantId);
const suiteJurisdiction = env('JURISDICTION', EXAMPLE_JURISDICTION);
const suiteSector = env('SECTOR', EXAMPLE_SECTOR);
const suiteConsentSection = env(
  'SMART_SCOPE_SECTION',
  String(
    EXAMPLE_LIVE_CONSENT_GRANT_INPUT.actions?.[0]
    || HealthcareBasicSections.PatientSummaryDocument.attributeValue,
  ),
);

function createDebugLogger() {
  return ensureLiveGwTraceFiles({
    debugEnabled: DEBUG,
    debugFilePath: env(
      'LIVE_PROFILE_RUNTIME_PROFESSIONAL_E2E_DEBUG_FILE',
      path.join(__dirname, '..', 'test-results', `live-profile-runtime-professional-${runId}.jsonl`),
    ),
    httpTraceFilePath: env(
      'SDK_HTTP_TRACE_FILE',
      path.join(__dirname, '..', 'test-results', `live-profile-runtime-professional-http-${runId}.jsonl`),
    ),
  });
}

function createStepProfiler(debug, scope) {
  const steps = [];
  return {
    async run(label, work) {
      const startedAt = Date.now();
      try {
        const result = await work();
        const durationMs = Date.now() - startedAt;
        const entry = { label, durationMs, status: 'ok' };
        steps.push(entry);
        debug.record(`${scope}-step-timing`, entry);
        return result;
      } catch (error) {
        const durationMs = Date.now() - startedAt;
        const entry = {
          label,
          durationMs,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        };
        steps.push(entry);
        debug.record(`${scope}-step-timing`, entry);
        throw error;
      }
    },
    flush() {
      debug.record(`${scope}-step-timing-summary`, {
        totalDurationMs: steps.reduce((sum, step) => sum + step.durationMs, 0),
        steps,
      });
    },
  };
}

test('LIVE professional profile runtime flow on existing tenant', {
  skip: !RUN,
}, async () => {
  const debug = createDebugLogger();
  const profiler = createStepProfiler(debug, 'profile-runtime-professional');
  const baseUrl = env('BASE_URL', EXAMPLE_LIVE_GW_BASE_URL_LOCAL);
  const professionalEmail = env('PROFESSIONAL_EMAIL', EXAMPLE_EMAIL_PROFESSIONAL);
  const professionalRole = env('PROFESSIONAL_ROLE', EXAMPLE_HEALTHCARE_ACTOR_ROLE_PHYSICIAN);
  const professionalActorDid = env(
    'PROFESSIONAL_ACTOR_DID',
    EXAMPLE_PROFESSIONAL_DID,
  );
  const subjectDid = env('PROFESSIONAL_SMART_SUBJECT_DID', EXAMPLE_SUBJECT_DID);
  const professionalClientId = env(
    'PROFESSIONAL_CLIENT_ID',
    EXAMPLE_DEVICE_CLIENT_ID,
  );
  const professionalIdToken = env(
    'PROFESSIONAL_ID_TOKEN',
    buildUnsignedJwt({
      sub: env('PROFESSIONAL_SUB', 'professional'),
      tenant_id: suiteTenantId,
      email: professionalEmail,
    }),
  );
  const professionalVpToken = env(
    'PROFESSIONAL_VP_TOKEN',
    buildUnsignedProfessionalSmartVpJwt({
      clientId: professionalClientId,
      actorDid: professionalActorDid,
      role: env('PROFESSIONAL_SUBJECT_OCCUPATION', professionalRole),
    }),
  );
  const bearerToken = env('AUTH_BEARER', professionalIdToken);
  const ctx = {
    tenantId: suiteTenantRouteId,
    jurisdiction: suiteJurisdiction,
    sector: suiteSector,
  };
  const requestedScope = env(
    'PROFESSIONAL_SMART_SCOPE',
    buildSmartCompositionReadScope({
      subjectDid,
      sections: suiteConsentSection,
    }),
  );
  const runtimeClient = createRuntimeClient({ baseUrl, ctx, bearerToken, requestTimeoutMs: 10_000 });
  const profileRuntime = new DirectBackendProfileRuntime({
    facadeClient: runtimeClient,
  });
  const loadRequest = prepareLoadProfile({
    actorKind: ActorKinds.Professional,
    providerDid: env('PROFESSIONAL_PROFILE_PROVIDER_DID', EXAMPLE_PROFILE_PROVIDER_DID),
    runtimeClass: EXAMPLE_PROFILE_RUNTIME_CLASS_SERVER,
    keyAccessMode: EXAMPLE_PROFILE_KEY_ACCESS_MODE_SERVER,
    actorRole: professionalRole,
    profileId: env('PROFESSIONAL_PROFILE_ID', professionalEmail),
    profileDid: env('PROFESSIONAL_PROFILE_DID', professionalActorDid),
    email: professionalEmail,
    appType: EXAMPLE_PROFILE_APP_TYPE_FAMILY,
    localPinPassword: EXAMPLE_PROFILE_LOCAL_PIN_PASSWORD_BACKEND,
  });

  let profileLoaded = false;

  try {
    const profile = await profiler.run('load-profile', () => loadBackendProfile(profileRuntime, loadRequest));
    profileLoaded = true;
    debug.record('load-profile', { descriptor: profile.descriptor, session: profile.session });
    assert.equal(profile.session.actorKind, ActorKinds.Professional);

    const professionalSession = requireBackendActorSession(profile, ActorKinds.Professional);
    const smart = await profiler.run('request-smart-token', () => professionalSession.asProfessional().requestSmartToken({
      tenantId: suiteTenantRouteId,
      jurisdiction: suiteJurisdiction,
      sector: suiteSector,
      idToken: professionalIdToken,
      actorDid: professionalActorDid,
      subjectDid,
      clientId: professionalClientId,
      issuer: env('PROFESSIONAL_SMART_ISSUER', professionalClientId),
      audience: env('PROFESSIONAL_SMART_AUDIENCE', 'did:web:api.acme.org'),
      redirectUri: env('PROFESSIONAL_SMART_REDIRECT_URI', 'https://app.acme.org/callback'),
      acrValues: env('PROFESSIONAL_SMART_ACR_VALUES', 'urn:antifraud:acr:openid4vp:employee'),
      codeChallenge: env('PROFESSIONAL_SMART_CODE_CHALLENGE', 'b2MtY2hhbGxlbmdlLWJhc2U2NA'),
      codeChallengeMethod: 'S256',
      vpToken: professionalVpToken,
      presentationSubmission: cloneExample(EXAMPLE_SMART_PRESENTATION_SUBMISSION),
      scopes: [requestedScope],
      smartTokenKind: 'openid-smart',
      timeoutSeconds: Math.max(1, Number(env('PROFESSIONAL_SMART_TIMEOUT_SECONDS', '60'))),
      intervalSeconds: Math.max(1, Number(env('PROFESSIONAL_SMART_INTERVAL_SECONDS', '2'))),
    }));
    debug.record('request-smart-token', { response: smart });
    assert.ok(smart.accessToken, 'Professional actor-profile suite must return one SMART access token.');
    assert.ok(
      Array.isArray(smart.scopes) && smart.scopes.includes(requestedScope),
      'Professional actor-profile suite must return the requested SMART composition-read scope.',
    );
  } finally {
    if (profileLoaded) {
      await profiler.run('close-profile', () => closeBackendProfile(profileRuntime, loadRequest.profileDid));
    }
    profiler.flush();
  }
});

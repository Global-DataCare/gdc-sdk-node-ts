/**
 * Live actor-profile E2E for the current individual-controller runtime slice.
 *
 * This suite is intentionally different from the GW CORE platform lifecycle
 * suite:
 *
 * - it assumes one tenant/runtime context is already operational
 * - it begins with `loadProfile(...)`
 * - it validates one actor-oriented flow
 * - it cleans up only the lifecycle-owned state created by this scenario
 *
 * Run this suite from the user's real terminal/TTY.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IndividualOrganizationLifecycleEditor } from 'gdc-common-utils-ts';
import {
  EXAMPLE_LIVE_GW_BASE_URL_LOCAL,
  EXAMPLE_JURISDICTION,
  EXAMPLE_PROFILE_APP_TYPE_FAMILY,
  EXAMPLE_PROFILE_CONNECTION_PIN_PASSWORD,
  EXAMPLE_PROFILE_CONNECTION_SECRET_KIND_PIN_PASSWORD,
  EXAMPLE_PROFILE_KEY_ACCESS_MODE_SERVER,
  EXAMPLE_PROFILE_LOCAL_PIN_PASSWORD_BACKEND,
  EXAMPLE_PROFILE_PROVIDER_DID,
  EXAMPLE_PROFILE_RUNTIME_CLASS_SERVER,
  EXAMPLE_REGISTERED_SUBJECT_ALTERNATE_NAME,
  EXAMPLE_SECTOR,
  EXAMPLE_SUBJECT_DID,
  EXAMPLE_TENANT_IDENTIFIER,
  buildExampleCommunicationIngestionPayload,
  buildExampleLiveMedicationCases,
  buildExampleMedicationIpsDocumentBundle,
} from 'gdc-common-utils-ts/examples';
import {
  ActorKinds,
  BackendSubjectIndexReadModes,
  DirectBackendProfileRuntime,
  IndividualControllerBackendRuntime,
  closeBackendProfile,
  connectBackendToSubjectIndex,
  getBackendSubjectIndexComposition,
  prepareConnectToSubjectIndex,
  prepareGetSubjectIndexComposition,
  prepareLoadProfile,
} from '../dist/index.js';
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

const RUN = isEnabledByDefault('RUN_LIVE_PROFILE_RUNTIME_E2E', '0');
const DEBUG = env('LIVE_PROFILE_RUNTIME_E2E_DEBUG', '0') === '1';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const runSlug = runId.toLowerCase();
const suiteTenantId = env('TENANT_ID', EXAMPLE_TENANT_IDENTIFIER);
const suiteTenantRouteId = env('TENANT_ROUTE_ID', suiteTenantId);
const suiteJurisdiction = env('JURISDICTION', EXAMPLE_JURISDICTION);
const suiteSector = env('SECTOR', EXAMPLE_SECTOR);
const suiteSubjectDid = env('SUBJECT_DID', EXAMPLE_SUBJECT_DID);
const LOCAL_LIVE_POLL_INTERVAL_MS = Math.max(1, Number(env('LIVE_GW_POLL_INTERVAL_MS', '200')));
const LOCAL_LIVE_POLL_TIMEOUT_MS = Math.max(1000, Number(env('LIVE_GW_POLL_TIMEOUT_MS', '60000')));

function createDebugLogger() {
  return ensureLiveGwTraceFiles({
    debugEnabled: DEBUG,
    debugFilePath: env(
      'LIVE_PROFILE_RUNTIME_E2E_DEBUG_FILE',
      path.join(__dirname, '..', 'test-results', `live-profile-runtime-individual-${runId}.jsonl`),
    ),
    httpTraceFilePath: env(
      'SDK_HTTP_TRACE_FILE',
      path.join(__dirname, '..', 'test-results', `live-profile-runtime-individual-http-${runId}.jsonl`),
    ),
  });
}

function createLivePollOptions(overrides = {}) {
  return {
    timeoutMs: Math.max(1000, Number(overrides.timeoutMs ?? LOCAL_LIVE_POLL_TIMEOUT_MS)),
    intervalMs: Math.max(1, Number(overrides.intervalMs ?? LOCAL_LIVE_POLL_INTERVAL_MS)),
  };
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

test('LIVE individual-controller profile runtime flow on existing tenant', {
  skip: !RUN,
}, async () => {
  const debug = createDebugLogger();
  const profiler = createStepProfiler(debug, 'profile-runtime-individual');
  const baseUrl = env('BASE_URL', EXAMPLE_LIVE_GW_BASE_URL_LOCAL);
  const bearerToken = env('AUTH_BEARER');
  const ctx = {
    tenantId: suiteTenantRouteId,
    jurisdiction: suiteJurisdiction,
    sector: suiteSector,
  };
  const pollOptions = createLivePollOptions();
  const runtimeClient = createRuntimeClient({ baseUrl, ctx, bearerToken, requestTimeoutMs: 10_000 });
  const profileDid = env('INDIVIDUAL_CONTROLLER_PROFILE_DID', EXAMPLE_PROFILE_PROVIDER_DID);
  const individualControllerEmail = env('INDIVIDUAL_CONTROLLER_EMAIL', `controller+${runSlug}@example.com`);
  const individualControllerRole = env('INDIVIDUAL_CONTROLLER_ROLE', 'RESPRSN');
  const individualAltName = env(
    'INDIVIDUAL_ALTERNATE_NAME',
    `${runSlug}-${EXAMPLE_REGISTERED_SUBJECT_ALTERNATE_NAME}`,
  );

  const profileRuntime = new DirectBackendProfileRuntime({
    facadeClient: runtimeClient,
    defaultRouteContext: ctx,
    subjectIndexReadMode: BackendSubjectIndexReadModes.LatestIps,
  });
  const individualRuntime = new IndividualControllerBackendRuntime(profileRuntime);

  const loadRequest = prepareLoadProfile({
    actorKind: ActorKinds.IndividualController,
    providerDid: EXAMPLE_PROFILE_PROVIDER_DID,
    runtimeClass: EXAMPLE_PROFILE_RUNTIME_CLASS_SERVER,
    keyAccessMode: EXAMPLE_PROFILE_KEY_ACCESS_MODE_SERVER,
    actorRole: individualControllerRole,
    profileId: individualControllerEmail,
    profileDid,
    subjectDid: suiteSubjectDid,
    email: individualControllerEmail,
    appType: EXAMPLE_PROFILE_APP_TYPE_FAMILY,
    localPinPassword: EXAMPLE_PROFILE_LOCAL_PIN_PASSWORD_BACKEND,
  });

  const profile = await profiler.run('load-profile', () => individualRuntime.loadProfile(loadRequest));
  debug.record('load-profile', { descriptor: profile.profile.descriptor });
  assert.equal(profile.session.actorKind, ActorKinds.IndividualController);

  const individualStart = await profiler.run('individual-start', () => individualRuntime.startIndividualOrganization(
    profile,
    {
      tenantId: suiteTenantRouteId,
      jurisdiction: suiteJurisdiction,
      sector: suiteSector,
      alternateName: individualAltName,
      controllerEmail: individualControllerEmail,
      controllerRole: individualControllerRole,
      additionalClaims: {
        'org.schema.Person.email': individualControllerEmail,
        'org.schema.Person.hasOccupation.identifier.value': individualControllerRole,
        'org.schema.Service.category': suiteSector,
      },
      timeoutSeconds: Math.round(pollOptions.timeoutMs / 1000),
      intervalSeconds: pollOptions.intervalMs / 1000,
    },
  ));
  debug.record('individual-start', { response: individualStart });
  assert.equal(individualStart.registration.poll.status, 200);

  const individualOrder = await profiler.run('individual-order', () => individualRuntime.confirmIndividualOrganizationOrder(
    profile,
    {
      tenantId: suiteTenantRouteId,
      jurisdiction: suiteJurisdiction,
      sector: suiteSector,
      offerId: individualStart.offerId,
      timeoutSeconds: Math.round(pollOptions.timeoutMs / 1000),
      intervalSeconds: pollOptions.intervalMs / 1000,
    },
  ));
  debug.record('individual-order', { response: individualOrder });
  assert.equal(individualOrder.poll.status, 200);

  const medication = buildExampleLiveMedicationCases(Date.now())[0];
  const medicationIpsBundle = buildExampleMedicationIpsDocumentBundle({
    subjectDid: suiteSubjectDid,
    medication,
  });
  const ingestionPayload = buildExampleCommunicationIngestionPayload({
    subjectDid: suiteSubjectDid,
    sent: medication.effectiveDateTime,
    ipsBundleBase64: Buffer.from(JSON.stringify(medicationIpsBundle), 'utf8').toString('base64'),
  });
  const ingestion = await profiler.run('medication-ingest', () => profile.sdk.ingestCommunicationAndUpdateIndex(
    ctx,
    {
      communicationPayload: ingestionPayload,
      pathFormatSegment: 'api',
      pollOptions,
    },
  ));
  debug.record('medication-ingest', { response: ingestion });
  assert.equal(ingestion.poll.status, 200);

  const connection = await profiler.run('connect-subject-index', () => connectBackendToSubjectIndex(
    profileRuntime,
    prepareConnectToSubjectIndex({
      subjectId: suiteSubjectDid,
      userId: profileDid,
      userRoleCode: individualControllerRole,
      secretKind: EXAMPLE_PROFILE_CONNECTION_SECRET_KIND_PIN_PASSWORD,
      connectionPinPassword: EXAMPLE_PROFILE_CONNECTION_PIN_PASSWORD,
    }),
  ));
  debug.record('connect-subject-index', { response: connection });
  assert.ok(connection.status === 'connected' || connection.status === 'already-connected');

  const composition = await profiler.run('read-subject-index', () => getBackendSubjectIndexComposition(
    profileRuntime,
    prepareGetSubjectIndexComposition({
      subjectId: suiteSubjectDid,
      userId: profileDid,
      userRoleCode: individualControllerRole,
    }),
  ));
  debug.record('read-subject-index', { response: composition });
  assert.ok(composition.composition);

  const lifecycleEditor = new IndividualOrganizationLifecycleEditor()
    .setIdentifier(suiteSubjectDid)
    .setAlternateName(individualAltName)
    .setOwnerEmail(individualControllerEmail);

  const disableIndividual = await profiler.run('individual-disable', () => profile.sdk.disableIndividualOrganization(
    ctx,
    {
      individualEditor: lifecycleEditor,
    },
    pollOptions,
  ));
  debug.record('individual-disable', { response: disableIndividual });
  assert.equal(disableIndividual.poll.status, 200);

  const purgeIndividual = await profiler.run('individual-purge', () => profile.sdk.purgeIndividualOrganization(
    ctx,
    {
      individualEditor: lifecycleEditor,
    },
    pollOptions,
  ));
  debug.record('individual-purge', { response: purgeIndividual });
  assert.equal(purgeIndividual.poll.status, 200);

  await profiler.run('close-profile', () => closeBackendProfile(profileRuntime, profileDid));
  await assert.rejects(
    () => getBackendSubjectIndexComposition(
      profileRuntime,
      prepareGetSubjectIndexComposition({
        subjectId: suiteSubjectDid,
        userId: profileDid,
        userRoleCode: individualControllerRole,
      }),
    ),
    /has not loaded one backend profile/i,
  );

  profiler.flush();
});

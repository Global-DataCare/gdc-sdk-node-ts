// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
/**
 * Journey:
 * 1. Load one authenticated individual-controller profile on an existing tenant.
 * 2. Register and confirm one individual organization.
 * 3. Enroll the returned member DID by activation-code exchange and DCR.
 * 4. Ingest one FHIR document and read the exact registered subject index.
 * 5. Disable and purge only the individual created by this scenario.
 * 6. Close the bootstrap profile and prove runtime state is no longer readable.
 * Authorization invariant: protected work uses the registered member DID, never the subject DID or bootstrap provider profile.
 * Persistence invariant: cleanup targets only this journey's individual and profile state.
 *
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
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IndividualOrganizationLifecycleEditor } from 'gdc-common-utils-ts';
import {
  EXAMPLE_LIVE_GW_BASE_URL_LOCAL,
  EXAMPLE_DCR_REDIRECT_URI,
  EXAMPLE_EMPLOYEE_DCR_CLIENT_NAME,
  EXAMPLE_JURISDICTION,
  EXAMPLE_PROFILE_APP_TYPE_FAMILY,
  EXAMPLE_PROFILE_KEY_ACCESS_MODE_SERVER,
  EXAMPLE_PROFILE_LOCAL_PIN_PASSWORD_BACKEND,
  EXAMPLE_PROFILE_PROVIDER_DID,
  EXAMPLE_PROFILE_RUNTIME_CLASS_SERVER,
  EXAMPLE_REGISTERED_SUBJECT_ALTERNATE_NAME,
  EXAMPLE_SECTOR,
  EXAMPLE_SUBJECT_DID,
  EXAMPLE_TENANT_IDENTIFIER,
} from 'gdc-common-utils-ts/examples';
import {
  ActorKinds,
  ActorCapabilities,
  addFhirResourceToDraft,
  DirectBackendProfileRuntime,
  IndividualControllerBackendRuntime,
  NodeActorSession,
  ServerProfileSessionManager,
  closeBackendProfile,
  createCommunicationDraft,
  createHeartRateObservation,
  createOutboxJobFromDraft,
  prepareLoadProfile,
  resolveDidWebKeyAgreementJwk,
} from '../dist/index.js';
import {
  createLiveServerProfileState,
  createRuntimeClient,
  ensureLiveGwTraceFiles,
} from './helpers/live-gw-runtime-helpers.mjs';
import { assertSuccessfulTerminalBundle } from './helpers/terminal-bundle-assertions.mjs';
import { buildUnsignedJwt } from './helpers/vp-token-fixture.mjs';

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
  const profileDid = env('INDIVIDUAL_CONTROLLER_PROFILE_DID', EXAMPLE_PROFILE_PROVIDER_DID);
  const bearerToken = env('AUTH_BEARER', buildUnsignedJwt({ sub: profileDid }));
  const ctx = {
    tenantId: suiteTenantRouteId,
    jurisdiction: suiteJurisdiction,
    sector: suiteSector,
  };
  const pollOptions = createLivePollOptions();
  const runtimeClient = createRuntimeClient({ baseUrl, ctx, bearerToken, requestTimeoutMs: 10_000 });
  const individualControllerEmail = env('INDIVIDUAL_CONTROLLER_EMAIL', `controller+${runSlug}@example.com`);
  const individualControllerRole = env('INDIVIDUAL_CONTROLLER_ROLE', 'RESPRSN');
  const individualAltName = env(
    'INDIVIDUAL_ALTERNATE_NAME',
    `${runSlug}-${EXAMPLE_REGISTERED_SUBJECT_ALTERNATE_NAME}`,
  );

  const profileRuntime = new DirectBackendProfileRuntime({
    facadeClient: runtimeClient,
    defaultRouteContext: ctx,
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

  const individualStart = await profiler.run('individual-start', () => individualRuntime.registerIndividualOrganization(
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
  assertSuccessfulTerminalBundle(individualStart.registration, 'Individual registration');

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
  assertSuccessfulTerminalBundle(individualOrder, 'Individual Order confirmation');

  const registeredIdentity = individualStart.identity;
  assert.ok(registeredIdentity?.controllerActorDid, 'Registration must expose the licensed controller member DID.');
  const individualControllerIdToken = buildUnsignedJwt({
    iss: registeredIdentity.controllerActorDid,
    sub: registeredIdentity.controllerActorDid,
    tenant_id: suiteTenantId,
    email: individualControllerEmail,
    email_verified: true,
  });
  const profileSessions = new ServerProfileSessionManager({
    ...createLiveServerProfileState(),
    gatewayBaseUrl: baseUrl,
    resolveRecipientJwk: (recipientDid) => resolveDidWebKeyAgreementJwk(recipientDid, {
      didDocumentUrl: `${baseUrl}/${suiteTenantRouteId}/cds-${suiteJurisdiction}/v1/${suiteSector}/.well-known/did.json`,
    }),
    profileProtection: { cost: 1_024 },
  });
  const enrolledProfile = await profiler.run('individual-controller-enroll-dcr', () => (
    profileSessions.enrollSelfIndividualController({
      ownerId: individualControllerEmail,
      profileId: individualControllerEmail,
      registration: individualStart,
      order: individualOrder,
      routeContext: ctx,
      pin: EXAMPLE_PROFILE_LOCAL_PIN_PASSWORD_BACKEND,
      idToken: individualControllerIdToken,
      redirectUris: [EXAMPLE_DCR_REDIRECT_URI],
      clientName: EXAMPLE_EMPLOYEE_DCR_CLIENT_NAME,
    })
  ));
  assert.equal(enrolledProfile.actorDid, registeredIdentity.controllerActorDid);
  assert.deepEqual(enrolledProfile.allowedSubjectDids, [registeredIdentity.subjectDid]);
  const enrolledControllerClient = createRuntimeClient({
    baseUrl,
    ctx,
    bearerToken: individualControllerIdToken,
    requestTimeoutMs: 10_000,
  });
  const enrolledControllerSdk = new NodeActorSession({
    actorKind: ActorKinds.IndividualController,
    actorDid: registeredIdentity.controllerActorDid,
    capabilities: [
      ActorCapabilities.IndividualIngestCommunication,
      ActorCapabilities.IndividualDisable,
      ActorCapabilities.IndividualPurge,
    ],
  }, enrolledControllerClient).asIndividualController();

  const observedAt = new Date().toISOString();
  const observation = createHeartRateObservation({
    subject: registeredIdentity.subjectDid,
    effectiveDateTime: observedAt,
    value: 72,
  });
  observation.id = `observation-${randomUUID()}`;
  const documentBundle = {
    resourceType: 'Bundle',
    type: 'document',
    entry: [
      {
        resource: {
          resourceType: 'Composition',
          id: `composition-${randomUUID()}`,
          status: 'final',
          subject: { reference: registeredIdentity.subjectDid },
          date: observedAt,
          type: { coding: [{ system: 'http://loinc.org', code: '60591-5' }] },
          section: [{
            code: { coding: [{ system: 'http://loinc.org', code: '8716-3' }] },
            entry: [{ reference: `Observation/${observation.id}` }],
          }],
        },
      },
      { resource: observation },
    ],
  };
  const draft = addFhirResourceToDraft(createCommunicationDraft({
    subject: registeredIdentity.subjectDid,
    sender: registeredIdentity.controllerActorDid,
    sent: observedAt,
  }), documentBundle, {
    attachmentTitle: 'ips-document.json',
  });
  const job = createOutboxJobFromDraft(draft);
  const ingestion = await profiler.run('medication-ingest', () => enrolledControllerSdk.ingestCommunicationAndUpdateIndex(
    ctx,
    {
      communicationJob: job,
      pathFormatSegment: 'r4',
      pollOptions,
    },
  ));
  debug.record('medication-ingest', { response: ingestion });
  assertSuccessfulTerminalBundle(ingestion, 'Individual clinical ingestion');

  const composition = await profiler.run('read-subject-index', () => enrolledControllerClient.getLatestIps(ctx, {
    subject: registeredIdentity.subjectDid,
    pollOptions,
  }));
  debug.record('read-subject-index', { response: composition });
  assertSuccessfulTerminalBundle(composition, 'Registered individual subject-index read');

  const lifecycleEditor = new IndividualOrganizationLifecycleEditor()
    .setIdentifier(registeredIdentity.subjectDid)
    .setAlternateName(individualAltName)
    .setOwnerEmail(individualControllerEmail);

  const disableIndividual = await profiler.run('individual-disable', () => enrolledControllerSdk.disableIndividualOrganization(
    ctx,
    {
      individualEditor: lifecycleEditor,
    },
    pollOptions,
  ));
  debug.record('individual-disable', { response: disableIndividual });
  assertSuccessfulTerminalBundle(disableIndividual, 'Individual organization disable');

  const purgeIndividual = await profiler.run('individual-purge', () => enrolledControllerSdk.purgeIndividualOrganization(
    ctx,
    {
      individualEditor: lifecycleEditor,
    },
    pollOptions,
  ));
  debug.record('individual-purge', { response: purgeIndividual });
  assertSuccessfulTerminalBundle(purgeIndividual, 'Individual organization purge');

  await profiler.run('close-profile', () => closeBackendProfile(profileRuntime, profileDid));
  await assert.rejects(
    () => profileRuntime.getSubjectIndexComposition({
      subjectId: registeredIdentity.subjectDid,
      userId: profileDid,
      userRoleCode: individualControllerRole,
    }),
    /has not loaded one backend profile/i,
  );

  profiler.flush();
});

/**
 * Live actor-dialogue E2E for controller-to-professional consent access.
 *
 * This suite is intentionally different from both:
 *
 * - the GW CORE platform lifecycle suite
 * - the standalone actor-profile suites
 *
 * The business focus here is the dialogue:
 *
 * 1. controller creates the minimum subject state
 * 2. controller grants consent to the professional
 * 3. professional requests access
 * 4. professional consumes the allowed clinical read
 * 5. the scenario cleans up only the consent and individual state it created
 *
 * Run this suite from the user's real terminal/TTY.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IndividualOrganizationLifecycleEditor } from 'gdc-common-utils-ts';
import { HealthcareBasicSections } from 'gdc-common-utils-ts/constants';
import { ClaimConsent } from 'gdc-common-utils-ts/models/consent-rule';
import {
  EXAMPLE_DEVICE_CLIENT_ID,
  EXAMPLE_EMAIL_CONTROLLER_INDIVIDUAL,
  EXAMPLE_EMAIL_PROFESSIONAL,
  EXAMPLE_HEALTHCARE_ACTOR_ROLE_PHYSICIAN,
  EXAMPLE_JURISDICTION,
  EXAMPLE_LIVE_CONSENT_GRANT_INPUT,
  EXAMPLE_LIVE_GW_BASE_URL_LOCAL,
  EXAMPLE_PROFILE_APP_TYPE_FAMILY,
  EXAMPLE_PROFILE_KEY_ACCESS_MODE_SERVER,
  EXAMPLE_PROFILE_LOCAL_PIN_PASSWORD_BACKEND,
  EXAMPLE_PROFILE_PROVIDER_DID,
  EXAMPLE_PROFILE_RUNTIME_CLASS_SERVER,
  EXAMPLE_PROFESSIONAL_DID,
  EXAMPLE_REGISTERED_SUBJECT_ALTERNATE_NAME,
  EXAMPLE_SECTOR,
  EXAMPLE_SMART_PRESENTATION_SUBMISSION,
  EXAMPLE_SUBJECT_DID,
  EXAMPLE_TENANT_IDENTIFIER,
  buildExampleCommunicationIngestionPayload,
  buildExampleLiveMedicationCases,
  buildExampleMedicationIpsDocumentBundle,
  cloneExample,
} from 'gdc-common-utils-ts/examples';
import { buildSmartCompositionReadScope } from 'gdc-common-utils-ts/utils/smart-scope';
import {
  ActorKinds,
  closeBackendProfile,
  DirectBackendProfileRuntime,
  IndividualControllerBackendRuntime,
  loadBackendProfile,
  prepareLoadProfile,
  requireBackendActorSession,
} from '../dist/index.js';
import {
  buildUnsignedJwt,
  buildUnsignedVpJwt,
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

const RUN = isEnabledByDefault('RUN_LIVE_DIALOGUE_CONSENT_PROFESSIONAL_E2E', '1');
const DEBUG = env('LIVE_DIALOGUE_CONSENT_PROFESSIONAL_E2E_DEBUG', '0') === '1';
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
      'LIVE_DIALOGUE_CONSENT_PROFESSIONAL_E2E_DEBUG_FILE',
      path.join(__dirname, '..', 'test-results', `live-dialogue-consent-professional-access-${runId}.jsonl`),
    ),
    httpTraceFilePath: env(
      'SDK_HTTP_TRACE_FILE',
      path.join(__dirname, '..', 'test-results', `live-dialogue-consent-professional-access-http-${runId}.jsonl`),
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

function getBatchEntries(pollBody, label) {
  const entries = pollBody?.body?.data || pollBody?.data || [];
  assert.ok(Array.isArray(entries), `${label} must return a batch-style data array.`);
  assert.ok(entries.length > 0, `${label} must return at least one batch entry.`);
  return entries;
}

function runtimeUuid() {
  const fromCrypto = globalThis.crypto?.randomUUID?.();
  if (fromCrypto) return fromCrypto;
  return `fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildConsentLifecyclePayload({ consentClaims }) {
  return {
    thid: `consent-${runtimeUuid()}`,
    body: {
      data: [{
        type: 'Consent-grant-request-v1.0',
        meta: { claims: consentClaims },
        resource: { resourceType: 'Consent', meta: { claims: consentClaims } },
      }],
    },
  };
}

function buildRevokedConsentClaims(activeConsentClaims, periodEnd) {
  return {
    ...cloneExample(activeConsentClaims),
    [ClaimConsent.periodEnd]: periodEnd,
  };
}

test('LIVE controller-to-professional consent dialogue on existing tenant', {
  skip: !RUN,
}, async () => {
  const debug = createDebugLogger();
  const profiler = createStepProfiler(debug, 'dialogue-consent-professional-access');
  const baseUrl = env('BASE_URL', EXAMPLE_LIVE_GW_BASE_URL_LOCAL);
  const bearerToken = env('AUTH_BEARER');
  const ctx = {
    tenantId: suiteTenantRouteId,
    jurisdiction: suiteJurisdiction,
    sector: suiteSector,
  };
  const pollOptions = createLivePollOptions();

  const individualControllerEmail = env(
    'INDIVIDUAL_CONTROLLER_EMAIL',
    `controller+${runSlug}@example.com`,
  ) || EXAMPLE_EMAIL_CONTROLLER_INDIVIDUAL;
  const individualControllerRole = env('INDIVIDUAL_CONTROLLER_ROLE', 'RESPRSN');
  const individualAltName = env(
    'INDIVIDUAL_ALTERNATE_NAME',
    `${runSlug}-${EXAMPLE_REGISTERED_SUBJECT_ALTERNATE_NAME}`,
  );

  const professionalEmail = env('PROFESSIONAL_EMAIL', EXAMPLE_EMAIL_PROFESSIONAL);
  const professionalRole = env('PROFESSIONAL_ROLE', EXAMPLE_HEALTHCARE_ACTOR_ROLE_PHYSICIAN);
  const professionalActorDid = env('PROFESSIONAL_ACTOR_DID', EXAMPLE_PROFESSIONAL_DID);
  const professionalClientId = env('PROFESSIONAL_CLIENT_ID', EXAMPLE_DEVICE_CLIENT_ID);
  const consentSection = env(
    'SMART_SCOPE_SECTION',
    HealthcareBasicSections.PatientSummaryDocument.attributeValue,
  );
  const requestedScope = env(
    'PROFESSIONAL_SMART_SCOPE',
    buildSmartCompositionReadScope({
      subjectDid: suiteSubjectDid,
      sections: consentSection,
    }),
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
    buildUnsignedVpJwt({
      vp: {
        holder: professionalClientId,
        verifiableCredential: [
          {
            type: ['VerifiableCredential', 'EmployeeCredential'],
            credentialSubject: {
              id: professionalActorDid,
              hasOccupation: env('PROFESSIONAL_SUBJECT_OCCUPATION', professionalRole),
            },
          },
        ],
      },
    }),
  );

  const controllerRuntimeClient = createRuntimeClient({ baseUrl, ctx, bearerToken, requestTimeoutMs: 10_000 });
  const controllerProfileRuntime = new DirectBackendProfileRuntime({
    facadeClient: controllerRuntimeClient,
    defaultRouteContext: ctx,
  });
  const individualRuntime = new IndividualControllerBackendRuntime(controllerProfileRuntime);

  const professionalRuntimeClient = createRuntimeClient({
    baseUrl,
    ctx,
    bearerToken: env('PROFESSIONAL_AUTH_BEARER', professionalIdToken),
    requestTimeoutMs: 10_000,
  });
  const professionalProfileRuntime = new DirectBackendProfileRuntime({
    facadeClient: professionalRuntimeClient,
  });

  const controllerLoadRequest = prepareLoadProfile({
    actorKind: ActorKinds.IndividualController,
    providerDid: EXAMPLE_PROFILE_PROVIDER_DID,
    runtimeClass: EXAMPLE_PROFILE_RUNTIME_CLASS_SERVER,
    keyAccessMode: EXAMPLE_PROFILE_KEY_ACCESS_MODE_SERVER,
    actorRole: individualControllerRole,
    profileId: individualControllerEmail,
    profileDid: env('INDIVIDUAL_CONTROLLER_PROFILE_DID', EXAMPLE_PROFILE_PROVIDER_DID),
    subjectDid: suiteSubjectDid,
    email: individualControllerEmail,
    appType: EXAMPLE_PROFILE_APP_TYPE_FAMILY,
    localPinPassword: EXAMPLE_PROFILE_LOCAL_PIN_PASSWORD_BACKEND,
  });
  const professionalLoadRequest = prepareLoadProfile({
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

  let controllerProfileLoaded = false;
  let professionalProfileLoaded = false;
  let individualCreated = false;
  let consentClaims;
  let controllerProfile;
  let professionalProfile;

  try {
    controllerProfile = await profiler.run('controller-load-profile', () => individualRuntime.loadProfile(controllerLoadRequest));
    controllerProfileLoaded = true;
    debug.record('controller-load-profile', { descriptor: controllerProfile.profile.descriptor });
    assert.equal(controllerProfile.session.actorKind, ActorKinds.IndividualController);

    const individualStart = await profiler.run('controller-individual-start', () => individualRuntime.startIndividualOrganization(
      controllerProfile,
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
    debug.record('controller-individual-start', { response: individualStart });
    assert.equal(individualStart.registration.poll.status, 200);

    const individualOrder = await profiler.run('controller-individual-order', () => individualRuntime.confirmIndividualOrganizationOrder(
      controllerProfile,
      {
        tenantId: suiteTenantRouteId,
        jurisdiction: suiteJurisdiction,
        sector: suiteSector,
        offerId: individualStart.offerId,
        timeoutSeconds: Math.round(pollOptions.timeoutMs / 1000),
        intervalSeconds: pollOptions.intervalMs / 1000,
      },
    ));
    debug.record('controller-individual-order', { response: individualOrder });
    assert.equal(individualOrder.poll.status, 200);
    individualCreated = true;

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
    const ingestion = await profiler.run('controller-medication-ingest', () => controllerProfile.sdk.ingestCommunicationAndUpdateIndex(
      ctx,
      {
        communicationPayload: ingestionPayload,
        pathFormatSegment: 'api',
        pollOptions,
      },
    ));
    debug.record('controller-medication-ingest', { response: ingestion });
    assert.equal(ingestion.poll.status, 200);

    const consent = await profiler.run('controller-grant-consent', () => controllerProfile.sdk.grantProfessionalAccess(
      ctx,
      {
        ...cloneExample(EXAMPLE_LIVE_CONSENT_GRANT_INPUT),
        subjectDid: suiteSubjectDid,
        actor: { identifier: professionalActorDid },
        actorRole: professionalRole,
        actions: [consentSection],
        purpose: env('CONSENT_PURPOSE', 'TREAT'),
        pollOptions,
      },
    ));
    debug.record('controller-grant-consent', { response: consent });
    assert.equal(consent.consent.poll.status, 200);
    consentClaims = consent.consentClaims;

    professionalProfile = await profiler.run('professional-load-profile', () => loadBackendProfile(
      professionalProfileRuntime,
      professionalLoadRequest,
    ));
    professionalProfileLoaded = true;
    debug.record('professional-load-profile', { descriptor: professionalProfile.descriptor });
    const professionalSession = requireBackendActorSession(professionalProfile, ActorKinds.Professional);
    assert.equal(professionalSession.actorKind, ActorKinds.Professional);

    const smart = await profiler.run('professional-request-smart-token', () => professionalSession.asProfessional().requestSmartToken({
      tenantId: suiteTenantRouteId,
      jurisdiction: suiteJurisdiction,
      sector: suiteSector,
      idToken: professionalIdToken,
      actorDid: professionalActorDid,
      subjectDid: suiteSubjectDid,
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
    debug.record('professional-request-smart-token', { response: smart });
    assert.ok(smart.accessToken, 'Dialogue suite must return one professional SMART access token.');
    assert.ok(
      Array.isArray(smart.scopes) && smart.scopes.includes(requestedScope),
      'Dialogue suite must return the requested consent-backed SMART scope.',
    );

    const smartAccessClient = createRuntimeClient({
      baseUrl,
      ctx,
      bearerToken: smart.accessToken,
      requestTimeoutMs: 10_000,
    });
    const professionalRead = await profiler.run('professional-read-latest-ips', () => smartAccessClient.getLatestIps(
      ctx,
      {
        subject: suiteSubjectDid,
        pollOptions,
      },
    ));
    debug.record('professional-read-latest-ips', { response: professionalRead });
    assert.equal(professionalRead.poll.status, 200);
    const readEntries = getBatchEntries(professionalRead.poll.body, 'Professional IPS read');
    assert.ok(readEntries[0]?.resource, 'Dialogue suite must return one readable clinical bundle/document resource for the professional actor.');
  } finally {
    if (consentClaims && controllerProfileLoaded) {
      const revokedAt = env('REVOKED_CONSENT_PERIOD_END', '2026-06-01T00:00:00Z');
      const revokedConsent = await profiler.run('controller-revoke-consent', () => controllerProfile.sdk.submitAndPoll(
        controllerRuntimeClient.individualConsentR4BatchPath(ctx),
        controllerRuntimeClient.individualConsentR4PollPath(ctx),
        buildConsentLifecyclePayload({
          consentClaims: buildRevokedConsentClaims(consentClaims, revokedAt),
        }),
        pollOptions,
      ));
      debug.record('controller-revoke-consent', { response: revokedConsent });
      assert.equal(revokedConsent.poll.status, 200);
    }

    if (individualCreated && controllerProfileLoaded) {
      const lifecycleEditor = new IndividualOrganizationLifecycleEditor()
        .setIdentifier(suiteSubjectDid)
        .setAlternateName(individualAltName)
        .setOwnerEmail(individualControllerEmail);

      const disableIndividual = await profiler.run('controller-individual-disable', () => controllerProfile.sdk.disableIndividualOrganization(
        ctx,
        {
          organizationEditor: lifecycleEditor,
        },
        pollOptions,
      ));
      debug.record('controller-individual-disable', { response: disableIndividual });
      assert.equal(disableIndividual.poll.status, 200);

      const purgeIndividual = await profiler.run('controller-individual-purge', () => controllerProfile.sdk.purgeIndividualOrganization(
        ctx,
        {
          organizationEditor: lifecycleEditor,
        },
        pollOptions,
      ));
      debug.record('controller-individual-purge', { response: purgeIndividual });
      assert.equal(purgeIndividual.poll.status, 200);
    }

    if (professionalProfileLoaded) {
      await profiler.run('professional-close-profile', () => closeBackendProfile(
        professionalProfileRuntime,
        professionalLoadRequest.profileDid,
      ));
    }
    if (controllerProfileLoaded) {
      await profiler.run('controller-close-profile', () => closeBackendProfile(
        controllerProfileRuntime,
        controllerLoadRequest.profileDid,
      ));
    }
    profiler.flush();
  }
});

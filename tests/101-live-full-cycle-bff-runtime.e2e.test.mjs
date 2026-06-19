/**
 * Live full-cycle `101` for a backend/BFF consuming `gdc-sdk-node-ts`.
 *
 * Teaching goal:
 * show the real dependency chain an integrator backend must execute with the
 * high-level SDK surface:
 *
 * 1. front-web legal-organization form is collected with shared setters
 * 2. BFF submits the legal-organization verification transaction through the
 *    organization-controller facade
 * 3. BFF later activates the tenant with the ICA proof using the same form
 * 4. organization-controller facade provisions one professional employee
 * 5. individual-controller profile is loaded and boots one individual
 * 6. the individual controller ingests clinical data and grants consent
 * 7. professional profile is loaded and requests a SMART token
 * 8. the professional reads the allowed IPS document
 * 9. cleanup closes consent, individual, employee, tenant, and host state
 *
 * Run this suite from the user's real terminal/TTY.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ServiceCapability } from 'gdc-common-utils-ts/constants/service-capabilities';
import {
  EXAMPLE_CONTROLLER_BINDING,
  EXAMPLE_DEVICE_CLIENT_ID,
  EXAMPLE_EMAIL_PROFESSIONAL,
  EXAMPLE_HEALTHCARE_ACTOR_ROLE_PHYSICIAN,
  EXAMPLE_HOSTED_PROVIDER_DID,
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
  EXAMPLE_SIGNED_TERMS_PDF_URL,
  EXAMPLE_SMART_PRESENTATION_SUBMISSION,
  buildExampleCommunicationIngestionPayload,
  buildExampleLiveMedicationCases,
  buildExampleMedicationIpsDocumentBundle,
  cloneExample,
} from 'gdc-common-utils-ts/examples';
import {
  buildUnsignedJwt,
} from 'gdc-common-utils-ts/utils/jwt';
import {
  buildSmartCompositionReadScope,
} from 'gdc-common-utils-ts/utils/smart-scope';
import {
  findEmployeeSearchResult,
  readEmployeeSearchResults,
} from 'gdc-common-utils-ts/utils/employee';
import {
  buildIndividualDidWeb,
  buildUnsignedProfessionalSmartVpJwt,
  BundleReader,
  createLegalOrganizationOnboardingEditor,
  OrganizationLifecycleEditor,
  readFirstBundleResourceFromResponseBody,
  readInvoiceBundleSummaryFromResponseBody,
} from 'gdc-common-utils-ts';
import {
  ActorKinds,
  closeBackendProfile,
  createIndividualOrganizationLifecycleFacade,
  DirectBackendProfileRuntime,
  EmployeeDraft,
  HostOnboardingSdk,
  loadBackendIndividualControllerProfile,
  loadBackendProfessionalProfile,
  NodeHttpClient,
  OrganizationControllerSdk,
  ProfessionalSdk,
  prepareLoadProfile,
} from '../dist/index.js';
import {
  ensureLiveGwTraceFiles,
} from './helpers/live-gw-runtime-helpers.mjs';

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim();
}

function isEnabledByDefault(name, fallback = '1') {
  const normalized = env(name, fallback).toLowerCase();
  return normalized !== '0' && normalized !== 'false' && normalized !== 'no';
}

const RUN = isEnabledByDefault('RUN_LIVE_101_FULL_CYCLE_E2E', '1');
const DEBUG = env('LIVE_101_FULL_CYCLE_E2E_DEBUG', '0') === '1';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const runSlug = runId.toLowerCase();
const defaultSuiteTenantId = `live101-${runSlug}`;
const defaultSuiteSubjectId = `z${runSlug.replace(/[^a-z0-9]/g, '')}`;
const suiteTenantId = env('TENANT_ID', defaultSuiteTenantId);
const suiteTenantRouteId = env('TENANT_ROUTE_ID', suiteTenantId);
const suiteJurisdiction = env('JURISDICTION', EXAMPLE_JURISDICTION);
const suiteSector = env('SECTOR', EXAMPLE_SECTOR);
const suiteHostSector = env('HOST_REGISTRY_SECTOR', 'test');
const suiteSubjectDid = env('SUBJECT_DID', buildIndividualDidWeb({
  providerDidWeb: EXAMPLE_HOSTED_PROVIDER_DID,
  individualId: defaultSuiteSubjectId,
}));
const suiteHostIdentifierValue = env('HOST_ID_VALUE', `live101-host-${runSlug}`);
const LOCAL_LIVE_POLL_INTERVAL_MS = Math.max(1, Number(env('LIVE_GW_POLL_INTERVAL_MS', '200')));
const LOCAL_LIVE_POLL_TIMEOUT_MS = Math.max(1000, Number(env('LIVE_GW_POLL_TIMEOUT_MS', '60000')));

function createDebugLogger() {
  return ensureLiveGwTraceFiles({
    debugEnabled: DEBUG,
    debugFilePath: env(
      'LIVE_101_FULL_CYCLE_E2E_DEBUG_FILE',
      path.join(__dirname, '..', 'test-results', `live-101-full-cycle-${runId}.jsonl`),
    ),
    httpTraceFilePath: env(
      'SDK_HTTP_TRACE_FILE',
      path.join(__dirname, '..', 'test-results', `live-101-full-cycle-http-${runId}.jsonl`),
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

test('101: LIVE full-cycle backend/BFF runtime flow', {
  skip: !RUN,
}, async () => {
  const debug = createDebugLogger();
  const profiler = createStepProfiler(debug, 'live-101-full-cycle');
  const baseUrl = env('BASE_URL', EXAMPLE_LIVE_GW_BASE_URL_LOCAL);
  const bearerToken = env('AUTH_BEARER');
  const pollOptions = createLivePollOptions();
  const hostCtx = { jurisdiction: suiteJurisdiction, sector: suiteHostSector };
  const ctx = {
    tenantId: suiteTenantRouteId,
    jurisdiction: suiteJurisdiction,
    sector: suiteSector,
  };

  const controllerEmail = env('CONTROLLER_EMAIL', `controller+${runSlug}@example.com`);
  const controllerRole = env('CONTROLLER_ROLE', 'RESPRSN');
  const serviceIdentifierDid = env('SERVICE_IDENTIFIER_DID', 'did:web:provider.example.org');
  const serviceUrl = env('SERVICE_URL', 'https://provider.example.org');
  const signatureFlow = env('LEGAL_ORG_SIGNATURE_FLOW', 'certificate').toLowerCase();
  const employeeEmail = env('EMPLOYEE_EMAIL', EXAMPLE_EMAIL_PROFESSIONAL);
  const employeeRole = env('EMPLOYEE_ROLE', EXAMPLE_HEALTHCARE_ACTOR_ROLE_PHYSICIAN);
  const professionalActorDid = env('PROFESSIONAL_ACTOR_DID', EXAMPLE_PROFESSIONAL_DID);
  const professionalClientId = env('PROFESSIONAL_CLIENT_ID', EXAMPLE_DEVICE_CLIENT_ID);
  const individualControllerEmail = env('INDIVIDUAL_CONTROLLER_EMAIL', `controller+${runSlug}@example.com`);
  const individualControllerRole = env('INDIVIDUAL_CONTROLLER_ROLE', 'RESPRSN');
  const individualAltName = env(
    'INDIVIDUAL_ALTERNATE_NAME',
    `${runSlug}-${EXAMPLE_REGISTERED_SUBJECT_ALTERNATE_NAME}`,
  );
  const consentSection = env('SMART_SCOPE_SECTION', 'patient-summary');

  const runtimeClient = new NodeHttpClient({
    baseUrl,
    ctx,
    bearerToken,
    requestTimeoutMs: 10_000,
  });
  const hostSdk = new HostOnboardingSdk(runtimeClient);
  const organizationControllerSdk = new OrganizationControllerSdk(runtimeClient);

  const controllerBinding = cloneExample(EXAMPLE_CONTROLLER_BINDING);
  const legalOrganizationOnboarding = createLegalOrganizationOnboardingEditor()
    .setLegalName(env('ORG_LEGAL_NAME', 'TEST LEGAL ORGANIZATION SL'))
    .setTaxId(suiteTenantId)
    .setLegalIdentifierValue(suiteTenantId)
    .setLegalIdentifierType(env('ORG_IDENTIFIER_TYPE', 'taxID'))
    .setAddressCountry(suiteJurisdiction)
    .setControllerEmail(controllerEmail)
    .setControllerRole(controllerRole)
    .setServiceCategory(suiteSector)
    .setServiceIdentifier(serviceIdentifierDid)
    .setServiceUrl(serviceUrl);
  const legalOrganizationDraft = legalOrganizationOnboarding.buildDraft();
  assert.equal(legalOrganizationDraft.validation.ok, true, 'Legal-organization onboarding form must stay valid before BFF submission.');
  debug.record('front-web-legal-organization-form', {
    formFields: legalOrganizationOnboarding.getFormFields(),
    normalizedClaims: legalOrganizationDraft.claims,
  });
  const verificationRequest = legalOrganizationOnboarding.buildGatewayVerificationRequest({
    controller: controllerBinding,
    signatureFlow,
    representativeSameAs: env('LEGAL_REPRESENTATIVE_SAME_AS', controllerEmail),
    verificationResourceType: env('LEGAL_ORG_VERIFICATION_RESOURCE_TYPE', 'contract'),
    signedTermsAttachmentId: env('SIGNED_TERMS_ATTACHMENT_ID', 'signed-terms-pdf-001'),
    signedTermsPdfUrl: env('SIGNED_TERMS_PDF_URL', EXAMPLE_SIGNED_TERMS_PDF_URL),
  });
  const activationRequest = legalOrganizationOnboarding.buildGatewayActivationRequest({
    vpToken: env('VP_TOKEN'),
    controller: controllerBinding,
    serviceCapabilities: [
      ServiceCapability.IndexProvider,
      ServiceCapability.DigitalTwinReader,
    ],
  });

  const employeeDraft = new EmployeeDraft()
    .setEmail(employeeEmail)
    .setRole(employeeRole)
    .setMemberOfOrgTaxId(suiteTenantId);
  const employeeIdentifier = env('EMPLOYEE_IDENTIFIER', employeeDraft.ensureEmployeeIdentifier());

  const individualLifecycle = createIndividualOrganizationLifecycleFacade();
  const profileRuntime = new DirectBackendProfileRuntime({
    facadeClient: runtimeClient,
    defaultRouteContext: ctx,
  });

  const individualControllerLoadRequest = prepareLoadProfile({
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

  const professionalIdToken = env(
    'PROFESSIONAL_ID_TOKEN',
    buildUnsignedJwt({
      sub: env('PROFESSIONAL_SUB', 'professional'),
      tenant_id: suiteTenantId,
      email: employeeEmail,
    }),
  );
  const professionalVpToken = env(
    'PROFESSIONAL_VP_TOKEN',
    buildUnsignedProfessionalSmartVpJwt({
      clientId: professionalClientId,
      actorDid: professionalActorDid,
      role: env('PROFESSIONAL_SUBJECT_OCCUPATION', employeeRole),
    }),
  );
  const professionalRuntimeClient = new NodeHttpClient({
    baseUrl,
    ctx,
    bearerToken: env('PROFESSIONAL_AUTH_BEARER', professionalIdToken),
    requestTimeoutMs: 10_000,
  });
  const professionalProfileRuntime = new DirectBackendProfileRuntime({
    facadeClient: professionalRuntimeClient,
    defaultRouteContext: ctx,
  });
  const professionalLoadRequest = prepareLoadProfile({
    actorKind: ActorKinds.Professional,
    providerDid: env('PROFESSIONAL_PROFILE_PROVIDER_DID', EXAMPLE_PROFILE_PROVIDER_DID),
    runtimeClass: EXAMPLE_PROFILE_RUNTIME_CLASS_SERVER,
    keyAccessMode: EXAMPLE_PROFILE_KEY_ACCESS_MODE_SERVER,
    actorRole: employeeRole,
    profileId: env('PROFESSIONAL_PROFILE_ID', employeeEmail),
    profileDid: env('PROFESSIONAL_PROFILE_DID', professionalActorDid),
    email: employeeEmail,
    appType: EXAMPLE_PROFILE_APP_TYPE_FAMILY,
    localPinPassword: EXAMPLE_PROFILE_LOCAL_PIN_PASSWORD_BACKEND,
  });

  let professionalProfileLoaded = false;
  let individualControllerProfileLoaded = false;
  let hostActivated = false;
  let hostVerificationSubmitted = false;
  let employeeCreated = false;
  let individualCreated = false;
  let employeeResourceId = '';
  let individualControllerProfile;
  let individualControllerSdk;
  let grantedConsentClaims = null;

  try {
    // Step 1: the web form is turned into one shared legal-organization draft
    // and the BFF submits the first ICA verification transaction through the
    // organization-controller facade.
    const verification = await profiler.run('organization-controller-submit-legal-organization-verification', () => organizationControllerSdk.submitLegalOrganizationVerificationTransaction(
      hostCtx,
      verificationRequest,
      pollOptions,
    ));
    debug.record('organization-controller-submit-legal-organization-verification', { response: verification });
    assert.equal(verification.poll.status, 200);
    const verificationResponseReader = new BundleReader(verification.poll.body || {});
    const verificationResponseAnalysis = verificationResponseReader.getResponseAnalysis();
    debug.record('organization-controller-submit-legal-organization-verification-analysis', verificationResponseAnalysis);
    assert.equal(verificationResponseReader.getBundleType(), 'collection');
    assert.equal(verificationResponseAnalysis.totalOperations >= 1, true);
    assert.equal(verificationResponseAnalysis.hasErrors, false);
    hostVerificationSubmitted = true;

    // Step 2: once ICA has produced the proof, the host-facing activation
    // reuses the same normalized business claims from the form draft.
    const activation = await profiler.run('host-activate-tenant', () => hostSdk.activateOrganizationInGatewayFromIcaProof(
      hostCtx,
      activationRequest,
      pollOptions,
    ));
    debug.record('host-activate-tenant', { response: activation });
    assert.equal(activation.poll.status, 200);
    hostActivated = true;

    // Step 3: the tenant controller provisions the first professional account.
    const employeeCreate = await profiler.run('organization-controller-create-professional', () => organizationControllerSdk.createOrganizationEmployee(
      ctx,
      {
        employeeClaims: employeeDraft
          .setIdentifier(employeeIdentifier)
          .toClaims(),
      },
      pollOptions,
    ));
    debug.record('organization-controller-create-professional', { response: employeeCreate });
    assert.equal(employeeCreate.poll.status, 200);
    employeeCreated = true;

    const employeeSearch = await profiler.run('organization-controller-search-professional', () => organizationControllerSdk.searchOrganizationEmployees(
      ctx,
      {
        employeeClaims: employeeDraft.toClaims(),
      },
    ));
    debug.record('organization-controller-search-professional', { response: employeeSearch });
    assert.equal(employeeSearch.poll.status, 200);
    const employeeSearchResults = readEmployeeSearchResults(employeeSearch.poll.body);
    const employeeRecord = findEmployeeSearchResult(employeeSearch.poll.body, employeeIdentifier) || employeeSearchResults[0];
    assert.ok(employeeRecord, 'Employee search must return one provisioned professional record.');
    employeeResourceId = String(employeeRecord.resourceId || '').trim();
    assert.ok(employeeResourceId, 'Employee search must expose one resource id for cleanup.');

    // Step 4: the backend loads the individual-controller profile and runs the
    // individual registration and order flow.
    individualControllerProfile = await profiler.run('individual-controller-load-profile', () => loadBackendIndividualControllerProfile(
      profileRuntime,
      individualControllerLoadRequest,
    ));
    individualControllerProfileLoaded = true;
    assert.equal(individualControllerProfile.session.actorKind, ActorKinds.IndividualController);
    individualControllerSdk = individualControllerProfile.sdk;

    const individualStart = await profiler.run('individual-controller-start-individual', () => individualControllerSdk.startIndividualOrganization({
      tenantId: suiteTenantRouteId,
      jurisdiction: suiteJurisdiction,
      sector: suiteSector,
      alternateName: individualAltName,
      controllerEmail: individualControllerEmail,
      controllerRole: individualControllerRole,
      additionalClaims: {
        [ClaimsPersonSchemaorg.email]: individualControllerEmail,
        [ClaimsPersonSchemaorg.hasOccupationalRoleValue]: individualControllerRole,
        [ClaimsServiceSchemaorg.category]: suiteSector,
      },
      timeoutSeconds: Math.round(pollOptions.timeoutMs / 1000),
      intervalSeconds: pollOptions.intervalMs / 1000,
    }));
    debug.record('individual-controller-start-individual', { response: individualStart });
    assert.equal(individualStart.registration.poll.status, 200);

    const individualOrder = await profiler.run('individual-controller-confirm-order', () => individualControllerSdk.confirmIndividualOrganizationOrder({
      tenantId: suiteTenantRouteId,
      jurisdiction: suiteJurisdiction,
      sector: suiteSector,
      offerId: individualStart.offerId,
      timeoutSeconds: Math.round(pollOptions.timeoutMs / 1000),
      intervalSeconds: pollOptions.intervalMs / 1000,
    }));
    debug.record('individual-controller-confirm-order', { response: individualOrder });
    assert.equal(individualOrder.poll.status, 200);
    individualCreated = true;
    {
      const invoiceSummary = readInvoiceBundleSummaryFromResponseBody(individualOrder.poll.body);
      assert.equal(invoiceSummary.invoiceId, individualStart.offerId);
      assert.ok(invoiceSummary.pdfDocumentId);
      assert.ok(invoiceSummary.structuredDocumentId);
    }

    // Step 5: the individual controller ingests clinical data and grants the
    // professional consent required for later SMART/IPS access.
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
    const ingestion = await profiler.run('individual-controller-ingest-clinical-data', () => individualControllerSdk.ingestCommunicationAndUpdateIndex(
      ctx,
      {
        communicationPayload: ingestionPayload,
        pathFormatSegment: 'api',
        pollOptions,
      },
    ));
    debug.record('individual-controller-ingest-clinical-data', { response: ingestion });
    assert.equal(ingestion.poll.status, 200);

    const grantedConsent = await profiler.run('individual-controller-grant-professional-consent', () => individualControllerSdk.grantProfessionalAccess(
      ctx,
      {
        ...cloneExample(EXAMPLE_LIVE_CONSENT_GRANT_INPUT),
        subjectDid: suiteSubjectDid,
        actorId: professionalActorDid,
        actorRole: employeeRole,
        purpose: env('CONSENT_PURPOSE', 'TREAT'),
        actions: [consentSection],
        pollOptions,
      },
    ));
    debug.record('individual-controller-grant-professional-consent', { response: grantedConsent });
    assert.equal(grantedConsent.consent.poll.status, 200);
    grantedConsentClaims = grantedConsent.consentClaims;

    // Step 6: the professional profile requests a SMART token and then reads
    // the latest IPS through the high-level professional facade.
    const professionalProfile = await profiler.run('professional-load-profile', () => loadBackendProfessionalProfile(
      professionalProfileRuntime,
      professionalLoadRequest,
    ));
    professionalProfileLoaded = true;
    assert.equal(professionalProfile.session.actorKind, ActorKinds.Professional);

    const requestedScope = env(
      'PROFESSIONAL_SMART_SCOPE',
      buildSmartCompositionReadScope({
        subjectDid: suiteSubjectDid,
        sections: consentSection,
      }),
    );
    const smart = await profiler.run('professional-request-smart-token', () => professionalProfile.sdk.requestSmartToken({
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
    assert.ok(smart.accessToken);

    const smartProfessionalSdk = new ProfessionalSdk(new NodeHttpClient({
      baseUrl,
      ctx,
      bearerToken: smart.accessToken,
      requestTimeoutMs: 10_000,
    }));
    const professionalRead = await profiler.run('professional-read-latest-ips', () => smartProfessionalSdk.getLatestIps(
      ctx,
      {
        subject: suiteSubjectDid,
        pollOptions,
      },
    ));
    debug.record('professional-read-latest-ips', { response: professionalRead });
    assert.equal(professionalRead.poll.status, 200);
    assert.ok(readFirstBundleResourceFromResponseBody(professionalRead.poll.body), 'The professional actor must receive one readable IPS bundle resource.');
  } finally {
    // Cleanup runs in reverse business order so the suite can be used as a
    // real full-cycle tutorial without leaving live local state behind.
    if (grantedConsentClaims && individualControllerProfileLoaded) {
      const revokedConsent = await profiler.run('individual-controller-revoke-professional-consent', () => individualControllerSdk.revokeProfessionalAccess(
        ctx,
        {
          consentClaims: grantedConsentClaims,
          periodEnd: env('REVOKED_CONSENT_PERIOD_END', '2026-06-18T00:00:00Z'),
          pollOptions,
        },
      ));
      debug.record('individual-controller-revoke-professional-consent', { response: revokedConsent });
      assert.equal(revokedConsent.consent.poll.status, 200);
    }

    if (professionalProfileLoaded) {
      await profiler.run('professional-close-profile', () => closeBackendProfile(
        professionalProfileRuntime,
        professionalLoadRequest.profileDid,
      ));
    }

    if (individualCreated && individualControllerProfileLoaded) {
      const individualDisableEditor = individualLifecycle
        .setIdentifier(
          individualLifecycle.prepareLifecycleIndividualOrganizationDisable(),
          suiteSubjectDid,
        );
      individualLifecycle.setAlternateName(individualDisableEditor, individualAltName);
      individualLifecycle.setOwnerEmail(individualDisableEditor, individualControllerEmail);

      const disableIndividual = await profiler.run('individual-controller-disable-individual', () => individualControllerSdk.disableIndividualOrganization(
        ctx,
        {
          organizationEditor: individualDisableEditor,
        },
        pollOptions,
      ));
      debug.record('individual-controller-disable-individual', { response: disableIndividual });
      assert.equal(disableIndividual.poll.status, 200);

      const individualPurgeEditor = individualLifecycle
        .setIdentifier(
          individualLifecycle.prepareLifecycleIndividualOrganizationPurge(),
          suiteSubjectDid,
        );
      individualLifecycle.setAlternateName(individualPurgeEditor, individualAltName);
      individualLifecycle.setOwnerEmail(individualPurgeEditor, individualControllerEmail);

      const purgeIndividual = await profiler.run('individual-controller-purge-individual', () => individualControllerSdk.purgeIndividualOrganization(
        ctx,
        {
          organizationEditor: individualPurgeEditor,
        },
        pollOptions,
      ));
      debug.record('individual-controller-purge-individual', { response: purgeIndividual });
      assert.equal(purgeIndividual.poll.status, 200);
    }

    if (individualControllerProfileLoaded) {
      await profiler.run('individual-controller-close-profile', () => closeBackendProfile(
        profileRuntime,
        individualControllerLoadRequest.profileDid,
      ));
    }

    if (employeeCreated && employeeResourceId) {
      const disableEmployee = await profiler.run('organization-controller-disable-professional', () => organizationControllerSdk.disableEmployee(
        ctx,
        {
          employeeClaims: employeeDraft.toClaims(),
          resourceId: employeeResourceId,
        },
        pollOptions,
      ));
      debug.record('organization-controller-disable-professional', { response: disableEmployee });
      assert.equal(disableEmployee.poll.status, 200);

      const purgeEmployee = await profiler.run('organization-controller-purge-professional', () => organizationControllerSdk.purgeEmployee(
        ctx,
        {
          employeeClaims: employeeDraft.toClaims(),
          resourceId: employeeResourceId,
        },
        pollOptions,
      ));
      debug.record('organization-controller-purge-professional', { response: purgeEmployee });
      assert.equal(purgeEmployee.poll.status, 200);
    }

    if (hostActivated) {
      const tenantLifecycleEditor = new OrganizationLifecycleEditor()
        .setIdentifierValue(suiteTenantId)
        .setTaxId(suiteTenantId);

      const disableTenant = await profiler.run('organization-controller-disable-tenant', () => organizationControllerSdk.disableTenant(
        hostCtx,
        {
          organizationEditor: tenantLifecycleEditor,
        },
        pollOptions,
      ));
      debug.record('organization-controller-disable-tenant', { response: disableTenant });
      assert.equal(disableTenant.poll.status, 200);

      const purgeTenant = await profiler.run('organization-controller-purge-tenant', () => organizationControllerSdk.purgeTenant(
        hostCtx,
        {
          organizationEditor: tenantLifecycleEditor,
        },
        pollOptions,
      ));
      debug.record('organization-controller-purge-tenant', { response: purgeTenant });
      assert.equal(purgeTenant.poll.status, 200);

      const hostLifecycleEditor = new OrganizationLifecycleEditor()
        .setIdentifierValue(suiteHostIdentifierValue);

      const disableHost = await profiler.run('host-disable', () => hostSdk.disableHost(
        hostCtx,
        {
          organizationEditor: hostLifecycleEditor,
        },
        pollOptions,
      ));
      debug.record('host-disable', { response: disableHost });
      assert.equal(disableHost.poll.status, 200);

      const purgeHost = await profiler.run('host-purge', () => hostSdk.purgeHost(
        hostCtx,
        {
          organizationEditor: hostLifecycleEditor,
        },
        pollOptions,
      ));
      debug.record('host-purge', { response: purgeHost });
      assert.equal(purgeHost.poll.status, 200);
    }

    profiler.flush();
  }
});

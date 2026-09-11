// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
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
 * 3. BFF later confirms the legal-organization order returned by `_transaction`
 * 4. organization-controller facade provisions one professional employee
 * 5. the freshly registered individual controller consumes its activation
 *    code and completes real encrypted DCR enrollment
 * 6. the individual controller ingests clinical data through document
 *    `Bundle` -> `Communication` -> DIDComm/plain
 * 7. the professional requests missing permission as Communication plus draft Consent
 * 8. the controller reads the inbox request and authors the active Consent
 * 9. the professional requests a SMART token and reads the allowed IPS via
 *    `Composition.section`
 * 10. the BFF resolves the protected professional creator assignment and the
 *     same professional SDK instance creates one authored vital sign
 * 11. the controller transports a second fact with that protected provenance
 * 12. the controller is denied when trying to update or delete that fact
 * 13. the exact professional author deletes both facts
 * 14. cleanup closes consent, individual, employee, tenant, and host state
 *
 * Authorization invariant: SMART `sub` is the clinical actor; sender and
 * subject remain independent roles; a submitter is not an author and cannot
 * gain update/delete authority by transporting the authored fact. The legal
 * identifier submitted for tenant creation must equal the identifier verified
 * from the signed test PDF and carried by the representative's memberOf proof.
 * Persistence invariant: successful DELETE removes the current fact without
 * converting consent revocation or profile cleanup into clinical operations.
 *
 * Run this suite from the user's real terminal/TTY.
 */
/**
 * 101 note:
 * - `gdc-common-utils-ts` owns the canonical step-by-step editors/readers and payload examples.
 * - This file starts after that shared authoring step and teaches the highest-level `sdk-node` runtime surface for this topic.
 * - Reuse `sdk-core` and `common-utils` contracts instead of re-teaching raw claims or low-level editors here.
 * - Read `docs/101-README.md` for the ordered path and keep actor role plus submit/poll explicit.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateKey, randomUUID, sign as cryptoSign } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ActorCapabilities } from 'gdc-common-utils-ts/constants/actor-session';
import {
  ClaimsOrganizationSchemaorg,
  ClaimsOrderSchemaorg,
  ClaimsPersonSchemaorg,
  ClaimsServiceSchemaorg,
} from 'gdc-common-utils-ts/constants/schemaorg';
import {
  EXAMPLE_CONTROLLER_BINDING,
  EXAMPLE_DEVICE_CLIENT_ID,
  EXAMPLE_EMAIL_PROFESSIONAL,
  EXAMPLE_HEALTHCARE_ACTOR_ROLE_GENERALIST_MEDICAL_PRACTITIONER,
  EXAMPLE_HOSTED_PROVIDER_DID,
  EXAMPLE_JURISDICTION,
  EXAMPLE_LEGAL_ORGANIZATION_SERVICE_TYPE,
  EXAMPLE_LICENSE_ISSUE_INPUT,
  EXAMPLE_LICENSE_INVOICE_ID,
  EXAMPLE_LICENSE_PAYMENT_METHOD_STRIPE,
  EXAMPLE_LIVE_GW_BASE_URL_LOCAL,
  EXAMPLE_PROFILE_APP_TYPE_FAMILY,
  EXAMPLE_DCR_REDIRECT_URI,
  EXAMPLE_EMPLOYEE_DCR_CLIENT_NAME,
  EXAMPLE_PROFILE_KEY_ACCESS_MODE_SERVER,
  EXAMPLE_PROFILE_LOCAL_PIN_PASSWORD_BACKEND,
  EXAMPLE_PROFILE_PROVIDER_DID,
  EXAMPLE_PROFILE_RUNTIME_CLASS_SERVER,
  EXAMPLE_PROFESSIONAL_DID,
  EXAMPLE_REGISTERED_SUBJECT_ALTERNATE_NAME,
  EXAMPLE_SECTOR,
  EXAMPLE_SIGNED_TERMS_PDF_URL,
  EXAMPLE_SMART_PRESENTATION_SUBMISSION,
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
  addLegalRepresentativeCredential,
  addOrganizationCredential,
  buildIndividualDidWeb,
  buildProfessionalDidWeb,
  buildUnsignedProfessionalSmartVpJwt,
  BundleEditableResourceTypes,
  BundleEditor,
  BundleReader,
  BundleTypes,
  HealthcareBasicSections,
  HealthcareConsentPurposes,
  HealthcareConsentActions,
  ConsentStatuses,
  FhirIpsCreatorKinds,
  buildOrganizationAuthorizationUrnCds,
  normalizeClinicalCreatorBinding,
  createJwtSigner,
  createVP,
  createLegalOrganizationOnboardingEditor,
  OrganizationLifecycleEditor,
  UrnPrefixes,
  readLegalOrganizationVerificationCredentialPairFromResponseBody,
  readLegalOrganizationVerificationTaxIdFromResponseBody,
  readFirstBundleResourceFromResponseBody,
  readInvoiceBundleSummaryFromResponseBody,
} from 'gdc-common-utils-ts';
import {
  ActorKinds,
  addFhirResourceToDraft,
  closeBackendProfile,
  createCommunicationDraft,
  createHeartRateObservation,
  createOutboxJobFromDraft,
  createIndividualOrganizationLifecycleFacade,
  DirectBackendProfileRuntime,
  EmployeeDraft,
  HostOnboardingSdk,
  loadBackendIndividualControllerProfile,
  loadBackendProfessionalProfile,
  NodeHttpClient,
  OrganizationControllerSdk,
  prepareLoadProfile,
  resolveClinicalCreatorIpsExport,
  resolveDidWebKeyAgreementJwk,
  ServerProfileSessionManager,
} from '../dist/index.js';
import { extractOfferIdFromResponseBody } from '../dist/order-offer-summary.js';
import {
  ensureLiveGwTraceFiles,
} from './helpers/live-gw-runtime-helpers.mjs';
import {
  assertSuccessfulTerminalBundle,
  assertTerminalBundleFailure,
} from './helpers/terminal-bundle-assertions.mjs';

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim();
}

function isEnabledByDefault(name, fallback = '1') {
  const normalized = env(name, fallback).toLowerCase();
  return normalized !== '0' && normalized !== 'false' && normalized !== 'no';
}

const RUN = isEnabledByDefault('RUN_LIVE_101_FULL_CYCLE_E2E', '0');
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
const CONTROLLER_SIGNER_SEED = env('CONTROLLER_SIGNER_SEED', 'organization-controller-seed-001');
// The wrapper loads both counterparty and verifier identities from the same
// signed-PDF metadata file so the verifier can never become the tenant.
const DEFAULT_LIVE_CONTROLLER_ORGANIZATION_TAX_ID = env('LIVE_CONTROLLER_ORGANIZATION_TAX_ID');
const LIVE_HOST_VERIFICATION_DEFAULT_PDF_PATH = env(
  'LIVE_GW_HOST_VERIFICATION_PDF_PATH',
  path.join(__dirname, '..', '..', 'examples', 'TEST-A4-Antifraud.pdf'),
);

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

function createLiveServerProfileState() {
  const profiles = new Map();
  const sessions = new Map();
  return {
    store: {
      async listProfiles(ownerId) {
        return [...profiles.values()].filter((profile) => profile.ownerId === ownerId);
      },
      async getProfile(profileId) { return profiles.get(profileId); },
      async putProfile(profile) { profiles.set(profile.profileId, profile); },
      async getSession(sessionId) { return sessions.get(sessionId); },
      async putSession(session) { sessions.set(session.sessionId, session); },
      async deleteSession(sessionId) { sessions.delete(sessionId); },
      async deleteSessionsForProfile(profileId) {
        for (const [sessionId, session] of sessions) {
          if (session.profileId === profileId) sessions.delete(sessionId);
        }
      },
    },
    sealer: {
      async seal(cleartext, aad) {
        return Buffer.from(JSON.stringify({ aad, cleartext }), 'utf8').toString('base64url');
      },
      async unseal(ciphertext, aad) {
        const decoded = JSON.parse(Buffer.from(ciphertext, 'base64url').toString('utf8'));
        assert.equal(decoded.aad, aad);
        return decoded.cleartext;
      },
    },
  };
}

function signPreparedJwt(prepared, privateJwk, alg) {
  const keyObject = createPrivateKey({ key: privateJwk, format: 'jwk' });
  const digest = alg === 'ES256K' ? 'sha256' : 'sha384';
  const signature = cryptoSign(digest, Buffer.from(prepared.signingBytes), {
    key: keyObject,
    dsaEncoding: 'ieee-p1363',
  });
  return signature.toString('base64url');
}

function buildLiveHostVerificationPdfAttachment() {
  const resolvedLocalPath = path.resolve(LIVE_HOST_VERIFICATION_DEFAULT_PDF_PATH);
  return {
    id: 'signed-terms-pdf-001',
    media_type: 'application/pdf',
    data: {
      base64: fs.readFileSync(resolvedLocalPath).toString('base64'),
    },
  };
}

async function buildSignedControllerVpToken({
  signer,
  organizationCredential,
  legalRepresentativeCredential,
  tenantId,
  audience,
}) {
  const vpPayload = createVP({
    iss: signer.getKid(),
    sub: tenantId,
    aud: audience,
    vp: {
      holder: signer.getKid(),
    },
  });
  addOrganizationCredential(vpPayload, organizationCredential);
  addLegalRepresentativeCredential(vpPayload, legalRepresentativeCredential);
  const prepared = signer.prepareJwt({
    payload: vpPayload,
    header: {
      kid: signer.getKid(),
      jwk: signer.getPublicJwk(),
    },
  });
  const privateMaterial = signer.getPrivateMaterial();
  assert.ok(!(privateMaterial instanceof Uint8Array), 'Controller live VP signer must use one classical EC signing key.');
  const signatureBase64Url = signPreparedJwt(prepared, privateMaterial, signer.getAlgorithm());
  return signer.buildCompact(signatureBase64Url, prepared);
}

test('101: LIVE full-cycle backend/BFF runtime flow', {
  skip: !RUN,
}, async () => {
  assert.ok(
    DEFAULT_LIVE_CONTROLLER_ORGANIZATION_TAX_ID,
    'LIVE_CONTROLLER_ORGANIZATION_TAX_ID must come from the signed-PDF fixture metadata.',
  );
  const debug = createDebugLogger();
  const profiler = createStepProfiler(debug, 'live-101-full-cycle');
  const baseUrl = env('BASE_URL', EXAMPLE_LIVE_GW_BASE_URL_LOCAL);
  const pollOptions = createLivePollOptions();
  const hostCtx = { jurisdiction: suiteJurisdiction, hostNetwork: suiteHostSector };
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
  const employeeRole = env(
    'EMPLOYEE_ROLE',
    EXAMPLE_HEALTHCARE_ACTOR_ROLE_GENERALIST_MEDICAL_PRACTITIONER,
  );
  const professionalActorDid = env(
    'PROFESSIONAL_ACTOR_DID',
    buildProfessionalDidWeb({
      organizationDidWeb: env('PROFESSIONAL_ACTOR_ORGANIZATION_DID', 'did:web:api.acme.org'),
      email: employeeEmail,
      role: employeeRole,
    }),
  );
  const professionalClientId = env('PROFESSIONAL_CLIENT_ID', EXAMPLE_DEVICE_CLIENT_ID);
  const individualControllerEmail = env('INDIVIDUAL_CONTROLLER_EMAIL', `controller+${runSlug}@example.com`);
  const individualControllerRole = env('INDIVIDUAL_CONTROLLER_ROLE', 'RESPRSN');
  const individualAltName = env(
    'INDIVIDUAL_ALTERNATE_NAME',
    `${runSlug}-${EXAMPLE_REGISTERED_SUBJECT_ALTERNATE_NAME}`,
  );
  const consentSection = env(
    'SMART_SCOPE_SECTION',
    HealthcareConsentActions.AllergiesAndIntolerances,
  );
  const controllerVpAudience = env('CONTROLLER_VP_AUDIENCE', `host:${suiteHostIdentifierValue}`);
  const controllerSigner = await createJwtSigner({
    alg: env('CONTROLLER_SIGNER_ALG', 'ES384'),
    seed: CONTROLLER_SIGNER_SEED,
    purpose: 'organization-controller',
  });

  const bootstrapClient = new NodeHttpClient({
    baseUrl,
    ctx,
    requestTimeoutMs: 10_000,
  });
  const hostSdk = new HostOnboardingSdk(bootstrapClient, [
    ActorCapabilities.HostingActivateOrganization,
    ActorCapabilities.HostingConfirmOrder,
    ActorCapabilities.HostingDisableHost,
    ActorCapabilities.HostingPurgeHost,
  ]);
  const verificationSdk = new OrganizationControllerSdk(bootstrapClient);

  const controllerBinding = cloneExample(EXAMPLE_CONTROLLER_BINDING);
  controllerBinding.publicKeyJwk = controllerSigner.getPublicJwk();
  controllerBinding.jwks = { keys: [controllerSigner.getPublicJwk()] };
  const legalOrganizationOnboarding = createLegalOrganizationOnboardingEditor()
    .setLegalName(env('ORG_LEGAL_NAME', 'TEST LEGAL ORGANIZATION SL'))
    .setTaxId(DEFAULT_LIVE_CONTROLLER_ORGANIZATION_TAX_ID)
    .setLegalIdentifierValue(DEFAULT_LIVE_CONTROLLER_ORGANIZATION_TAX_ID)
    .setLegalIdentifierType(env('ORG_IDENTIFIER_TYPE', 'taxID'))
    .setTenantAlias(suiteTenantRouteId)
    .setAddressCountry(suiteJurisdiction)
    .setControllerEmail(controllerEmail)
    .setControllerRole(controllerRole)
    .setServiceCategory(suiteSector)
    .setServiceType(EXAMPLE_LEGAL_ORGANIZATION_SERVICE_TYPE)
    .setServiceIdentifier(serviceIdentifierDid)
    .setServiceUrl(serviceUrl);
  const tenantAliasValidation = { allowExplicitAlternateNameForTenantId: true };
  const legalOrganizationDraft = legalOrganizationOnboarding.buildDraft(tenantAliasValidation);
  assert.equal(legalOrganizationDraft.validation.ok, true, 'Legal-organization onboarding form must stay valid before BFF submission.');
  const hostedTenantIdentifierValue = String(
    legalOrganizationDraft.claims[ClaimsOrganizationSchemaorg.identifierValue] || '',
  ).trim();
  assert.ok(
    hostedTenantIdentifierValue,
    'The lifecycle journey requires the exact Organization.identifier.value submitted to the host.',
  );
  debug.record('front-web-legal-organization-form', {
    formFields: legalOrganizationOnboarding.getFormFields(),
    normalizedClaims: legalOrganizationDraft.claims,
  });
  debug.record('controller-live-vp-signer', {
    seed: CONTROLLER_SIGNER_SEED,
    kid: controllerSigner.getKid(),
    publicJwk: controllerSigner.getPublicJwk(),
  });
  const verificationRequest = legalOrganizationOnboarding.buildVerificationTransactionInput({
    controller: controllerBinding,
    organization: serviceIdentifierDid || serviceUrl
      ? {
          ...(serviceIdentifierDid ? { did: serviceIdentifierDid } : {}),
          ...(serviceUrl ? { url: serviceUrl } : {}),
        }
      : undefined,
    legalRepresentativePayload: signatureFlow === 'otp'
      ? {
          email: controllerEmail,
          sameAs: env('LEGAL_REPRESENTATIVE_SAME_AS', controllerEmail),
        }
      : {
          email: controllerEmail,
        },
    verification: {
      resourceType: env('LEGAL_ORG_VERIFICATION_RESOURCE_TYPE', 'contract'),
    },
    attachments: signatureFlow === 'otp'
      ? undefined
      : [buildLiveHostVerificationPdfAttachment()],
    validationOptions: tenantAliasValidation,
  });

  const individualLifecycle = createIndividualOrganizationLifecycleFacade();

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
  const individualControllerIdToken = env(
    'INDIVIDUAL_CONTROLLER_ID_TOKEN',
    buildUnsignedJwt({
      sub: individualControllerLoadRequest.profileDid,
      tenant_id: suiteTenantId,
      email: individualControllerEmail,
      email_verified: true,
    }),
  );

  const professionalIdToken = env(
    'PROFESSIONAL_ID_TOKEN',
    buildUnsignedJwt({
      sub: env('PROFESSIONAL_SUB', 'professional'),
      tenant_id: suiteTenantId,
      email: employeeEmail,
      email_verified: true,
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
  let runtimeClient;
  let organizationControllerSdk;
  let profileRuntime;
  let individualControllerProfileRuntime;
  let controllerOrganizationTaxId = DEFAULT_LIVE_CONTROLLER_ORGANIZATION_TAX_ID;
  let employeeDraft;
  let employeeIdentifier = '';

  try {
    // Step 1: the web form is turned into one shared legal-organization draft
    // and the BFF submits the first ICA verification transaction through the
    // organization-controller facade.
    const verification = await profiler.run('organization-controller-submit-legal-organization-verification', () => verificationSdk.submitLegalOrganizationVerificationTransaction(
      hostCtx,
      verificationRequest,
      pollOptions,
    ));
    debug.record('organization-controller-submit-legal-organization-verification', { response: verification });
    assertSuccessfulTerminalBundle(verification, 'Legal-organization verification transaction');
    const verificationResponseReader = new BundleReader(verification.poll.body || {});
    const verificationResponseAnalysis = verificationResponseReader.getResponseAnalysis();
    debug.record('organization-controller-submit-legal-organization-verification-analysis', verificationResponseAnalysis);
    assert.ok(
      ['transaction-response', 'batch-response'].includes(String(verificationResponseReader.getBundleType() || '')),
      'Host verification transaction must return one terminal bundle response type.',
    );
    assert.equal(verificationResponseAnalysis.totalOperations >= 1, true);
    assert.equal(verificationResponseAnalysis.hasErrors, false);
    hostVerificationSubmitted = true;

    // Step 2: once ICA has produced the proof, the BFF confirms the
    // legal-organization offer returned by `_transaction`. The same ICA
    // credentials are then packaged into one controller proof bearer for the
    // later disable/purge lifecycle calls.
    const verificationPair = readLegalOrganizationVerificationCredentialPairFromResponseBody(verification.poll.body || {});
    const { organizationCredential, legalRepresentativeCredential } = verificationPair;
    controllerOrganizationTaxId = readLegalOrganizationVerificationTaxIdFromResponseBody(verification.poll.body || {});
    const legalOfferId = extractOfferIdFromResponseBody(verification.poll.body);
    assert.ok(legalOfferId, 'Host verification transaction must expose one offer identifier before order confirmation.');
    const controllerVpToken = await buildSignedControllerVpToken({
      signer: controllerSigner,
      organizationCredential,
      legalRepresentativeCredential,
      tenantId: controllerOrganizationTaxId,
      audience: controllerVpAudience,
    });
    debug.record('organization-controller-live-vp-token', {
      audience: controllerVpAudience,
      signerKid: controllerSigner.getKid(),
      compactJwtPreview: `${controllerVpToken.split('.').slice(0, 2).join('.')}.<signature>`,
    });
    const legalOrder = await profiler.run('host-confirm-legal-order', () => hostSdk.confirmLegalOrganizationOrder(
      hostCtx,
      {
        offerId: legalOfferId,
      },
      pollOptions,
    ));
    debug.record('host-confirm-legal-order', { response: legalOrder, offerId: legalOfferId });
    assertSuccessfulTerminalBundle(legalOrder, 'Legal-organization Order confirmation');
    hostActivated = true;

    // Controller lifecycle later reuses the same signed VP as
    // `Authorization: Bearer <vp_token>` for disable/purge.
    runtimeClient = new NodeHttpClient({
      baseUrl,
      ctx,
      bearerToken: controllerVpToken,
      requestTimeoutMs: 10_000,
    });
    organizationControllerSdk = new OrganizationControllerSdk(runtimeClient, [
      ActorCapabilities.OrganizationCreateEmployee,
      ActorCapabilities.OrganizationDisableEmployee,
      ActorCapabilities.OrganizationPurgeEmployee,
      ActorCapabilities.OrganizationDisableTenant,
      ActorCapabilities.OrganizationPurgeTenant,
    ]);
    profileRuntime = new DirectBackendProfileRuntime({
      facadeClient: runtimeClient,
      defaultRouteContext: ctx,
    });
    individualControllerProfileRuntime = new DirectBackendProfileRuntime({
      facadeClient: new NodeHttpClient({
        baseUrl,
        ctx,
        bearerToken: individualControllerIdToken,
        requestTimeoutMs: 10_000,
      }),
      defaultRouteContext: ctx,
    });
    employeeDraft = new EmployeeDraft()
      .setEmail(employeeEmail)
      .setRole(employeeRole)
      .setMemberOfOrgTaxId(controllerOrganizationTaxId);
    employeeIdentifier = env('EMPLOYEE_IDENTIFIER', employeeDraft.ensureEmployeeIdentifier());

    // Step 3: the tenant controller provisions the first professional account.
    const employeeProvisioning = await profiler.run('organization-controller-provision-professional', () => organizationControllerSdk.provisionOrganizationEmployee(
      ctx,
      {
        creation: {
          employeeClaims: employeeDraft
            .setIdentifier(employeeIdentifier)
            .toClaims(),
        },
        invitation: {
          ...cloneExample(EXAMPLE_LICENSE_ISSUE_INPUT),
          email: employeeEmail,
          role: employeeRole,
          subjectDid: employeeIdentifier,
          pollOptions,
        },
        licenseOrder: {
          issuerDid: controllerSigner.getKid(),
          hostNetwork: suiteHostSector,
          additionalClaims: {
            [ClaimsOrderSchemaorg.paymentMethod]: EXAMPLE_LICENSE_PAYMENT_METHOD_STRIPE,
            [ClaimsOrderSchemaorg.partOfInvoice]: EXAMPLE_LICENSE_INVOICE_ID,
          },
          timeoutSeconds: Math.round(pollOptions.timeoutMs / 1000),
          intervalSeconds: pollOptions.intervalMs / 1000,
        },
      },
    ));
    debug.record('organization-controller-provision-professional', { response: employeeProvisioning });
    const employeeCreate = employeeProvisioning.employee;
    assertSuccessfulTerminalBundle(employeeCreate, 'Professional employee provisioning');
    employeeCreated = true;
    const createdEmployeeResource = readFirstBundleResourceFromResponseBody(employeeCreate.poll.body);
    const createdEmployeeResourceId = String(createdEmployeeResource?.id || '').trim();
    const professionalAssignmentId = String(createdEmployeeResource?.contained?.[0]?.id || '').trim();
    assert.match(createdEmployeeResourceId, /^urn:uuid:[0-9a-f-]+$/i);
    assert.match(professionalAssignmentId, /^[0-9a-f-]+$/i);

    // BFF-only boundary: the employee receipt supplies the durable Employee
    // and professional-assignment UUIDs. The authenticated employee channel
    // selects that protected binding; browser input never supplies author or
    // attester references.
    const professionalClinicalCreator = resolveClinicalCreatorIpsExport({
      bindings: [normalizeClinicalCreatorBinding({
        kind: FhirIpsCreatorKinds.Professional,
        actorIdentifier: createdEmployeeResourceId,
        assignmentIdentifier: professionalAssignmentId,
        ownerIdentifier: buildOrganizationAuthorizationUrnCds({
          jurisdiction: suiteJurisdiction,
          identifierType: legalOrganizationDraft.claims[ClaimsOrganizationSchemaorg.identifierType],
          identifierValue: hostedTenantIdentifierValue,
        }),
        role: employeeRole,
        actorDids: [professionalActorDid],
      })],
      evidence: { actorDid: professionalActorDid },
    });

    const employeeSearch = await profiler.run('organization-controller-search-professional', () => organizationControllerSdk.searchOrganizationEmployees(
      ctx,
      {
        employeeClaims: employeeDraft.toClaims(),
      },
    ));
    debug.record('organization-controller-search-professional', { response: employeeSearch });
    assertSuccessfulTerminalBundle(employeeSearch, 'Professional employee search');
    const employeeSearchResults = readEmployeeSearchResults(employeeSearch.poll.body);
    const employeeRecord = findEmployeeSearchResult(employeeSearch.poll.body, employeeIdentifier) || employeeSearchResults[0];
    assert.ok(employeeRecord, 'Employee search must return one provisioned professional record.');
    employeeResourceId = String(employeeRecord.resourceId || createdEmployeeResourceId || '').trim();
    assert.ok(employeeResourceId, 'Employee search must expose one resource id for cleanup.');

    // Step 4: the backend loads the individual-controller profile and runs the
    // individual registration and order flow.
    individualControllerProfile = await profiler.run('individual-controller-load-profile', () => loadBackendIndividualControllerProfile(
      individualControllerProfileRuntime,
      individualControllerLoadRequest,
    ));
    individualControllerProfileLoaded = true;
    assert.equal(individualControllerProfile.session.actorKind, ActorKinds.IndividualController);
    individualControllerSdk = individualControllerProfile.sdk;

    const individualOrganizationRegistration = await profiler.run('individual-controller-start-individual', () => individualControllerSdk.registerIndividualOrganization({
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
    debug.record('individual-controller-start-individual', { response: individualOrganizationRegistration });
    assertSuccessfulTerminalBundle(individualOrganizationRegistration.registration, 'Individual registration');
    assert.ok(
      individualOrganizationRegistration.offerId.startsWith(`urn:cds:${suiteJurisdiction.toUpperCase()}:v1:${suiteSector}:`),
      'Individual Offer URN must identify the jurisdiction/network selected by the route.',
    );
    assert.equal(individualOrganizationRegistration.offerId.includes('undefined'), false);

    const individualOrganizationOrder = await profiler.run('individual-controller-confirm-order', () => individualControllerSdk.confirmIndividualOrganizationOrder({
      tenantId: suiteTenantRouteId,
      jurisdiction: suiteJurisdiction,
      sector: suiteSector,
      offerId: individualOrganizationRegistration.offerId,
      timeoutSeconds: Math.round(pollOptions.timeoutMs / 1000),
      intervalSeconds: pollOptions.intervalMs / 1000,
    }));
    debug.record('individual-controller-confirm-order', { response: individualOrganizationOrder });
    assertSuccessfulTerminalBundle(individualOrganizationOrder, 'Individual Order confirmation');
    assert.ok(
      String(individualOrganizationOrder.activationCode || '').trim(),
      'The high-level Order result must expose the controller activation code.',
    );
    individualCreated = true;
    {
      const invoiceSummary = readInvoiceBundleSummaryFromResponseBody(individualOrganizationOrder.poll.body);
      assert.equal(invoiceSummary.invoiceId, individualOrganizationRegistration.offerId);
      assert.ok(invoiceSummary.pdfDocumentId);
      assert.ok(invoiceSummary.structuredDocumentId);
    }

    const registeredIdentity = individualOrganizationRegistration.identity;
    assert.ok(registeredIdentity?.controllerActorDid, 'Registration must expose the canonical controller member DID required by DCR.');
    const profileState = createLiveServerProfileState();
    const profileSessions = new ServerProfileSessionManager({
      ...profileState,
      gatewayBaseUrl: baseUrl,
      resolveRecipientJwk: (recipientDid) => resolveDidWebKeyAgreementJwk(recipientDid, {
        didDocumentUrl: `${baseUrl}/${suiteTenantRouteId}/cds-${suiteJurisdiction}/v1/${suiteSector}/.well-known/did.json`,
      }),
      profileProtection: { cost: 1_024 },
    });
    const enrolledControllerProfile = await profiler.run(
      'individual-controller-enroll-dcr',
      () => profileSessions.enrollSelfIndividualController({
        ownerId: individualControllerEmail,
        profileId: individualControllerEmail,
        registration: individualOrganizationRegistration,
        order: individualOrganizationOrder,
        routeContext: ctx,
        pin: EXAMPLE_PROFILE_LOCAL_PIN_PASSWORD_BACKEND,
        idToken: individualControllerIdToken,
        redirectUris: [EXAMPLE_DCR_REDIRECT_URI],
        clientName: EXAMPLE_EMPLOYEE_DCR_CLIENT_NAME,
      }),
    );
    assert.equal(enrolledControllerProfile.actorDid, registeredIdentity.controllerActorDid);
    assert.equal(enrolledControllerProfile.profileDid, registeredIdentity.controllerActorDid);
    assert.deepEqual(enrolledControllerProfile.allowedSubjectDids, [registeredIdentity.subjectDid]);
    assert.ok(enrolledControllerProfile.clientId, 'Real GW DCR must return and persist a client id.');
    const enrolledControllerSession = await profiler.run(
      'individual-controller-unlock-new-profile',
      () => profileSessions.unlock({
        ownerId: individualControllerEmail,
        profileId: individualControllerEmail,
        subjectDid: registeredIdentity.subjectDid,
        scopes: [buildSmartCompositionReadScope({
          subjectDid: registeredIdentity.subjectDid,
          sections: consentSection,
        })],
        pin: EXAMPLE_PROFILE_LOCAL_PIN_PASSWORD_BACKEND,
        idToken: individualControllerIdToken,
      }),
    );
    const openedEnrolledController = await profileSessions.openIndividualController({
      ownerId: individualControllerEmail,
      sessionId: enrolledControllerSession.sessionId,
    });
    assert.equal(openedEnrolledController.profile.clientId, enrolledControllerProfile.clientId);
    assert.equal(
      openedEnrolledController.getAttesterUriForDocs(),
      `${UrnPrefixes.Uuid}${individualOrganizationOrder.controllerRelatedPersonIdentifier}`,
    );

    // Step 6: the individual controller ingests clinical data. No professional
    // access exists yet, so the following request must remain independent from
    // SMART and must not be made green by pre-granting Consent.
    const observedAt = new Date().toISOString();
    const heartRate = createHeartRateObservation({
      subject: suiteSubjectDid,
      effectiveDateTime: observedAt,
      value: 72,
    });
    heartRate.id = `observation-${randomUUID()}`;
    const ipsDocument = {
      resourceType: 'Bundle',
      type: 'document',
      entry: [
        {
          resource: {
            resourceType: 'Composition',
            id: `composition-${randomUUID()}`,
            status: 'final',
            subject: { reference: suiteSubjectDid },
            author: [{ reference: individualControllerLoadRequest.profileDid }],
            date: observedAt,
            type: { coding: [{ system: 'http://loinc.org', code: '60591-5' }] },
            section: [{
              code: { coding: [{ system: 'http://loinc.org', code: '8716-3' }] },
              entry: [{ reference: `Observation/${heartRate.id}` }],
            }],
          },
        },
        { resource: heartRate },
      ],
    };
    const clinicalDraft = addFhirResourceToDraft(createCommunicationDraft({
      subject: suiteSubjectDid,
      sender: individualControllerLoadRequest.profileDid,
      recipient: EXAMPLE_PROFILE_PROVIDER_DID,
      sent: observedAt,
      noteText: 'IPS update with vital signs',
    }), ipsDocument, {
      attachmentTitle: 'ips-document.json',
      noteText: 'Imported IPS document',
    });
    const clinicalJob = createOutboxJobFromDraft(clinicalDraft, {
      batchOptions: { requestUrl: 'individual/org.hl7.fhir.r4/Communication' },
    });
    const ingestion = await profiler.run('individual-controller-ingest-clinical-data', () => individualControllerSdk.ingestCommunicationAndUpdateIndex(
      ctx,
      {
        communicationJob: clinicalJob,
        pathFormatSegment: 'r4',
        pollOptions,
      },
    ));
    debug.record('individual-controller-ingest-clinical-data', { response: ingestion });
    assertSuccessfulTerminalBundle(ingestion, 'Clinical ingestion');

    const professionalProfile = await profiler.run('professional-load-profile', () => loadBackendProfessionalProfile(
      professionalProfileRuntime,
      professionalLoadRequest,
    ));
    professionalProfileLoaded = true;
    assert.equal(professionalProfile.session.actorKind, ActorKinds.Professional);

    const accessRequest = await profiler.run('professional-request-subject-permission', () => professionalProfile.sdk.requestProfessionalAccess(
      ctx,
      {
        subject: suiteSubjectDid,
        requester: { actorKind: 'professional', did: professionalActorDid, email: employeeEmail },
        requesterRole: employeeRole,
        purpose: env('CONSENT_PURPOSE', HealthcareConsentPurposes.Treatment),
        missing: {
          sections: [consentSection],
          resourceTypes: [],
          pairs: [{ section: consentSection, reason: 'missing-consent' }],
        },
        sender: professionalActorDid,
        recipient: suiteSubjectDid,
        pollOptions,
      },
    ));
    debug.record('professional-request-subject-permission', { response: accessRequest });
    assertSuccessfulTerminalBundle(accessRequest.delivery, 'Professional permission request');
    assert.equal(accessRequest.communication.payload.data[0].resource.status, ConsentStatuses.Draft);

    // The request write and its participant search index are separate live
    // boundaries. Keep searching through the public facade until the stored
    // request becomes visible, bounded by the same timeout as DIDComm polling.
    const permissionInboxDeadline = Date.now() + pollOptions.timeoutMs;
    let permissionInbox;
    do {
      permissionInbox = await profiler.run('individual-controller-read-permission-inbox', () => individualControllerSdk.listProfessionalAccessRequests(
        ctx,
        {
          subject: suiteSubjectDid,
          recipientActorId: suiteSubjectDid,
          pollOptions,
        },
      ));
      const inboxAnalysis = new BundleReader(permissionInbox.poll.body || {}).getResponseAnalysis();
      if (!inboxAnalysis.hasErrors && inboxAnalysis.successfulOperations >= 1) break;
      await new Promise((resolve) => setTimeout(resolve, pollOptions.intervalMs));
    } while (Date.now() < permissionInboxDeadline);
    debug.record('individual-controller-read-permission-inbox', { response: permissionInbox });
    assertSuccessfulTerminalBundle(permissionInbox, 'Controller permission inbox search');

    const grantedConsent = await profiler.run('individual-controller-answer-permission-request', () => individualControllerSdk.respondToProfessionalAccessRequest(
      ctx,
      {
        requestThid: accessRequest.thid,
        requestCommunicationIdentifier: accessRequest.communicationIdentifier,
        subjectDid: suiteSubjectDid,
        actorId: professionalActorDid,
        actorRole: employeeRole,
        purpose: env('CONSENT_PURPOSE', HealthcareConsentPurposes.Treatment),
        actions: [consentSection],
        decision: 'permit',
        pollOptions,
      },
    ));
    debug.record('individual-controller-answer-permission-request', { response: grantedConsent });
    assertSuccessfulTerminalBundle(grantedConsent.consent, 'Controller permission approval');
    grantedConsentClaims = grantedConsent.consentClaims;

    // Step 9: the same professional profile now requests a SMART token and reads
    // the latest IPS through the high-level professional facade.
    const requestedScope = env(
      'PROFESSIONAL_SMART_SCOPE',
      buildSmartCompositionReadScope({
        subjectDid: suiteSubjectDid,
        sections: consentSection,
      }),
    );
    // The verified professional account performs its first authored write
    // before replacing the account bearer with the narrower SMART read token.
    // This binds the pre-authorized creator assignment to the operational DID;
    // later transport by the controller must not transfer authorship.
    const professionalObservationId = `observation-${randomUUID()}`;
    const authoredVitalSigns = new BundleEditor().setBundleType(BundleTypes.batch);
    const authoredHeartRate = authoredVitalSigns
      .newEntryAs(BundleEditableResourceTypes.observation, professionalObservationId)
      .create()
      .setSubject(suiteSubjectDid)
      .setStatus('final')
      .setDate(new Date().toISOString())
      .setHeartRate(73);
    authoredHeartRate.ensureIdentifier();

    const professionalCreate = await profiler.run('professional-create-authored-vital-sign', () => professionalProfile.sdk.updateClinicalSection(
      ctx,
      {
        subject: suiteSubjectDid,
        sender: professionalActorDid,
        clinicalCreator: professionalClinicalCreator,
        recipient: EXAMPLE_PROFILE_PROVIDER_DID,
        section: HealthcareBasicSections.VitalSigns.attributeValue,
        bundle: authoredVitalSigns.buildJsonApi(),
        clinicalFormat: 'r4',
        pollOptions,
      },
    ));
    debug.record('professional-create-authored-vital-sign', { response: professionalCreate });
    assertSuccessfulTerminalBundle(professionalCreate, 'Professional vital-sign create');

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

    const professionalRead = await profiler.run('professional-read-latest-ips', () => professionalProfile.sdk.getLatestIps(
      ctx,
      {
        subject: suiteSubjectDid,
        pollOptions,
      },
    ));
    debug.record('professional-read-latest-ips', { response: professionalRead });
    assertSuccessfulTerminalBundle(professionalRead, 'Professional IPS read');
    assert.ok(readFirstBundleResourceFromResponseBody(professionalRead.poll.body), 'The professional actor must receive one readable IPS bundle resource.');

    const delegatedObservationId = `observation-${randomUUID()}`;
    const delegatedCreateBundle = new BundleEditor().setBundleType(BundleTypes.batch);
    delegatedCreateBundle
      .newEntryAs(BundleEditableResourceTypes.observation, delegatedObservationId)
      .create()
      .setSubject(suiteSubjectDid)
      .setStatus('final')
      .setDate(new Date().toISOString())
      .setHeartRate(74)
      .ensureIdentifier();
    const delegatedCreate = await profiler.run('controller-submit-professional-authored-vital-sign', () => individualControllerSdk.updateClinicalSection(
      ctx,
      {
        subject: suiteSubjectDid,
        sender: individualControllerLoadRequest.profileDid,
        clinicalCreator: professionalClinicalCreator,
        recipient: EXAMPLE_PROFILE_PROVIDER_DID,
        section: HealthcareBasicSections.VitalSigns.attributeValue,
        bundle: delegatedCreateBundle.buildJsonApi(),
        clinicalFormat: 'r4',
        pollOptions,
      },
    ));
    debug.record('controller-submit-professional-authored-vital-sign', { response: delegatedCreate });
    assertSuccessfulTerminalBundle(delegatedCreate, 'Delegated professional vital-sign create');

    const delegatedUpdateBundle = new BundleEditor().setBundleType(BundleTypes.batch);
    delegatedUpdateBundle
      .newEntryAs(BundleEditableResourceTypes.observation, delegatedObservationId)
      .update()
      .setSubject(suiteSubjectDid)
      .setStatus('final')
      .setDate(new Date().toISOString())
      .setHeartRate(75)
      .ensureIdentifier();
    const delegatedUpdate = await profiler.run('controller-cannot-update-submitted-professional-fact', () => individualControllerSdk.updateClinicalSection(
      ctx,
      {
        subject: suiteSubjectDid,
        sender: individualControllerLoadRequest.profileDid,
        clinicalCreator: professionalClinicalCreator,
        recipient: EXAMPLE_PROFILE_PROVIDER_DID,
        section: HealthcareBasicSections.VitalSigns.attributeValue,
        bundle: delegatedUpdateBundle.buildJsonApi(),
        clinicalFormat: 'r4',
        pollOptions,
      },
    ));
    assertTerminalBundleFailure(
      delegatedUpdate,
      'Delegated submitter update',
      /authenticated (?:author|creator)|registered creator/i,
    );

    const delegatedDeleteBundle = new BundleEditor().setBundleType(BundleTypes.batch);
    delegatedDeleteBundle
      .newEntryAs(BundleEditableResourceTypes.observation, delegatedObservationId)
      .delete();
    const delegatedDelete = await profiler.run('controller-cannot-delete-submitted-professional-fact', () => individualControllerSdk.updateClinicalSection(
      ctx,
      {
        subject: suiteSubjectDid,
        sender: individualControllerLoadRequest.profileDid,
        clinicalCreator: professionalClinicalCreator,
        recipient: EXAMPLE_PROFILE_PROVIDER_DID,
        section: HealthcareBasicSections.VitalSigns.attributeValue,
        bundle: delegatedDeleteBundle.buildJsonApi(),
        clinicalFormat: 'r4',
        pollOptions,
      },
    ));
    assertTerminalBundleFailure(
      delegatedDelete,
      'Delegated submitter delete',
      /authenticated (?:author|creator)|registered creator/i,
    );

    const deleteVitalSign = new BundleEditor().setBundleType(BundleTypes.batch);
    deleteVitalSign
      .newEntryAs(BundleEditableResourceTypes.observation, professionalObservationId)
      .delete();
    const professionalDelete = await profiler.run('professional-delete-authored-vital-sign', () => professionalProfile.sdk.updateClinicalSection(
      ctx,
      {
        subject: suiteSubjectDid,
        sender: professionalActorDid,
        clinicalCreator: professionalClinicalCreator,
        recipient: EXAMPLE_PROFILE_PROVIDER_DID,
        section: HealthcareBasicSections.VitalSigns.attributeValue,
        bundle: deleteVitalSign.buildJsonApi(),
        clinicalFormat: 'r4',
        pollOptions,
      },
    ));
    debug.record('professional-delete-authored-vital-sign', { response: professionalDelete });
    const deleteAnalysis = assertSuccessfulTerminalBundle(professionalDelete, 'Professional vital-sign delete');
    assert.ok(deleteAnalysis.successfulOperations >= 1, 'The author-owned DELETE must return one successful batch operation.');

    const professionalDelegatedDelete = await profiler.run('professional-delete-delegated-fact', () => professionalProfile.sdk.updateClinicalSection(
      ctx,
      {
        subject: suiteSubjectDid,
        sender: professionalActorDid,
        clinicalCreator: professionalClinicalCreator,
        recipient: EXAMPLE_PROFILE_PROVIDER_DID,
        section: HealthcareBasicSections.VitalSigns.attributeValue,
        bundle: delegatedDeleteBundle.buildJsonApi(),
        clinicalFormat: 'r4',
        pollOptions,
      },
    ));
    assertSuccessfulTerminalBundle(professionalDelegatedDelete, 'Professional deletes delegated fact');
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
      assertSuccessfulTerminalBundle(revokedConsent.consent, 'Professional consent revocation');
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
          individualEditor: individualDisableEditor,
        },
        pollOptions,
      ));
      debug.record('individual-controller-disable-individual', { response: disableIndividual });
      assertSuccessfulTerminalBundle(disableIndividual, 'Individual organization disable');

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
          individualEditor: individualPurgeEditor,
        },
        pollOptions,
      ));
      debug.record('individual-controller-purge-individual', { response: purgeIndividual });
      assertSuccessfulTerminalBundle(purgeIndividual, 'Individual organization purge');
    }

    if (individualControllerProfileLoaded) {
      await profiler.run('individual-controller-close-profile', () => closeBackendProfile(
        individualControllerProfileRuntime,
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
      assertSuccessfulTerminalBundle(disableEmployee, 'Professional employee disable');

      const purgeEmployee = await profiler.run('organization-controller-purge-professional', () => organizationControllerSdk.purgeEmployee(
        ctx,
        {
          employeeClaims: employeeDraft.toClaims(),
          resourceId: employeeResourceId,
        },
        pollOptions,
      ));
      debug.record('organization-controller-purge-professional', { response: purgeEmployee });
      assertSuccessfulTerminalBundle(purgeEmployee, 'Professional employee purge');
    }

    if (hostActivated) {
      const tenantLifecycleEditor = new OrganizationLifecycleEditor()
        // The authenticated lifecycle proof is the verified ICA credential
        // pair. Its exact legal identifier must select the same tenant; an
        // unverified form value cannot override the representative memberOf.
        .setIdentifierValue(controllerOrganizationTaxId)
        .setTaxId(controllerOrganizationTaxId);

      const disableTenant = await profiler.run('organization-controller-disable-tenant', () => organizationControllerSdk.disableTenant(
        hostCtx,
        {
          organizationEditor: tenantLifecycleEditor,
        },
        pollOptions,
      ));
      debug.record('organization-controller-disable-tenant', { response: disableTenant });
      assertSuccessfulTerminalBundle(disableTenant, 'Hosted tenant disable');

      const purgeTenant = await profiler.run('organization-controller-purge-tenant', () => organizationControllerSdk.purgeTenant(
        hostCtx,
        {
          organizationEditor: tenantLifecycleEditor,
        },
        pollOptions,
      ));
      debug.record('organization-controller-purge-tenant', { response: purgeTenant });
      assertSuccessfulTerminalBundle(purgeTenant, 'Hosted tenant purge');

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
      assertSuccessfulTerminalBundle(disableHost, 'Host disable');

      const purgeHost = await profiler.run('host-purge', () => hostSdk.purgeHost(
        hostCtx,
        {
          organizationEditor: hostLifecycleEditor,
        },
        pollOptions,
      ));
      debug.record('host-purge', { response: purgeHost });
      assertSuccessfulTerminalBundle(purgeHost, 'Host purge');
    }

    profiler.flush();
  }
});

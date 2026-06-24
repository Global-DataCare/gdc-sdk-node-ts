/**
 * Canonical live GW E2E suite.
 *
 * Important execution rule:
 * - run this suite from the user's real terminal/TTY
 * - never treat agent sandbox networking as authoritative for this suite
 * - local agent sandboxes may fail with EPERM / ECONNREFUSED / DNS restrictions
 *   even when the same command works correctly in the user's terminal
 * - never validate the final result from a sandbox-only run
 *
 * Important isolation rule:
 * - never rerun the final lifecycle against the same persisted host/tenant/individual
 * - the final live validation must use a fresh host id, a fresh tenant id, and
 *   a fresh individual subject for that execution
 * - if a previous run leaves persisted state behind, discard that run and start
 *   again with a new epoch/run id instead of retrying on top of old state
 *
 * If an AI agent is driving the run, the agent should:
 * - keep GW CORE running in a long-lived TTY session
 * - run this suite outside sandbox restrictions when localhost/GCP access is needed
 * - treat direct user-terminal results as the source of truth for live validation
 * - restart from a new run id instead of doing "reruns" over the same host
 *
 * Follow-up after publish:
 * - keep this suite focused on proving the runtime end-to-end
 * - add one explicit v2 profile-runtime live slice for:
 *   - `loadProfile(...)`
 *   - `startIndividualOrganization(...)`
 *   - `confirmIndividualOrganizationOrder(...)`
 *   - the current canonical index/`Composition` read helper
 * - do not freeze the final read-step wording until current GW CORE proves
 *   whether `getLatestIps(...)` or `searchClinicalBundle(...)` is the
 *   canonical public helper for that slice
 * - build a separate `101` Node walkthrough that uses JobManager + virtual API
 *   + actor facades + bundle editor/viewer + consent view model
 * - that future `101` must explain each user conversation step explicitly and
 *   should avoid inline route plumbing in the spec body
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IndividualOrganizationLifecycleEditor, OrganizationLifecycleEditor } from 'gdc-common-utils-ts';
import { HealthcareBasicSections } from 'gdc-common-utils-ts/constants';
import { DeviceAppTypes, DeviceUserClasses } from 'gdc-common-utils-ts/constants/device';
import { ClaimsOrganizationSchemaorg, ClaimsPersonSchemaorg } from 'gdc-common-utils-ts/constants/schemaorg';
import { ClaimConsent } from 'gdc-common-utils-ts/models/consent-rule';
import {
  MedicationStatementClaim,
  MedicationStatementClaimsFhirApiExtended,
} from 'gdc-common-utils-ts/models/interoperable-claims/medication-statement-claims';
import {
  EXAMPLE_ACTIVATE_ORGANIZATION_FROM_ICA_PROOF_INPUT,
  EXAMPLE_API_ORGANIZATION_DID,
  EXAMPLE_EMAIL_PROFESSIONAL,
  EXAMPLE_EMAIL_RELATED_PERSON,
  EXAMPLE_HOSTED_PROVIDER_DID,
  EXAMPLE_INDEX_PROVIDER_SECTOR_DID_WEB,
  EXAMPLE_IPS_BUNDLE_NOTE_TEXT,
  EXAMPLE_LICENSE_ISSUE_INPUT,
  EXAMPLE_JURISDICTION,
  EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE,
  EXAMPLE_LIVE_GW_BASE_URL_LOCAL,
  EXAMPLE_LIVE_CONSENT_GRANT_INPUT,
  EXAMPLE_LIVE_EMPLOYEE_INPUT,
  EXAMPLE_PROFILE_APP_TYPE_FAMILY,
  EXAMPLE_PROFILE_CONNECTION_PIN_PASSWORD,
  EXAMPLE_PROFILE_CONNECTION_SECRET_KIND_PIN_PASSWORD,
  EXAMPLE_PROFILE_KEY_ACCESS_MODE_SERVER,
  EXAMPLE_PROFILE_LOCAL_PIN_PASSWORD_BACKEND,
  EXAMPLE_PROFILE_PROVIDER_DID,
  EXAMPLE_PROFILE_RUNTIME_CLASS_SERVER,
  EXAMPLE_REGISTERED_SUBJECT_ALTERNATE_NAME,
  EXAMPLE_RELATED_PERSON_DISABLE_INPUT,
  EXAMPLE_RELATED_PERSON_FHIR_RESOURCE,
  EXAMPLE_RELATED_PERSON_ROLE,
  EXAMPLE_RELATED_PERSON_UPSERT_BUNDLE_PAYLOAD,
  EXAMPLE_SECTOR,
  EXAMPLE_SUBJECT_DID,
  EXAMPLE_TENANT_IDENTIFIER,
  EXAMPLE_TENANT_DISABLE_MESSAGE,
  EXAMPLE_INDIVIDUAL_DISABLE_MESSAGE,
  buildExampleLiveMedicationCases,
  buildExampleMedicationIpsDocumentBundle,
  EXAMPLE_SMART_PRESENTATION_SUBMISSION,
  buildExampleCommunicationIngestionPayload,
  buildExampleDocumentReferenceSearchPayload,
  cloneExample,
} from 'gdc-common-utils-ts/examples';
import {
  buildProfessionalDidWeb,
  buildIndividualDidWeb,
  buildLicenseIssueEntry,
  readInvoiceBundleSummaryFromResponseBody,
} from 'gdc-common-utils-ts';
import { createIpsSummarySearchDidcommMessage } from 'gdc-common-utils-ts/utils/communication-bundle-document-request';
import {
  buildBundleDocumentFromClaims,
  extractFlatClaimValue,
  getBundleDocumentResourceIds,
  getBundleDocumentResources,
} from '../../gdc-common-utils-ts/dist/utils/bundle-document-builder.js';

import {
  ActorCapabilities,
  ActorKinds,
  BackendSubjectIndexReadModes,
  DirectBackendProfileRuntime,
  extractOfferIdFromResponseBody,
  IndividualControllerBackendRuntime,
  NodeActorSession,
  connectBackendToSubjectIndex,
  getBackendSubjectIndexComposition,
  prepareConnectToSubjectIndex,
  prepareGetSubjectIndexComposition,
  prepareLoadProfile,
} from '../dist/index.js';
import {
  buildUnsignedJwt,
  buildUnsignedProfessionalSmartVpJwt,
  buildUnsignedVpJwt,
  loadVpPayloadFixture,
} from './helpers/vp-token-fixture.mjs';
import {
  createRuntimeClient,
  ensureLiveGwTraceFiles,
} from './helpers/live-gw-runtime-helpers.mjs';
import {
  LiveGwSuiteProfiles,
  normalizeLiveGwSuiteProfile,
  shouldRunLiveGwSuiteProfile,
} from './helpers/live-gw-suite-profiles.mjs';
import {
  isDirectExecutionMode,
  LiveGwExecutionModes,
  normalizeLiveGwExecutionMode,
} from './helpers/live-gw-execution-modes.mjs';
import {
  buildLegacyFhirCommunicationBatchBundle,
  buildLegacyFhirCommunicationBatchPath,
  buildLegacyFhirCommunicationPollPath,
  LiveGwTransportProfiles,
  normalizeLiveGwTransportProfile,
  shouldRunLiveGwTransportProfile,
  submitLegacyFhirBatchAndPoll,
} from './helpers/live-gw-transport-profiles.mjs';

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim();
}

function isEnabledByDefault(name, fallback = '1') {
  const normalized = env(name, fallback).toLowerCase();
  return normalized !== '0' && normalized !== 'false' && normalized !== 'no';
}

const RUN = isEnabledByDefault('RUN_LIVE_GW_E2E', '0');
const RUN_ACTOR_CHAIN = isEnabledByDefault('RUN_LIVE_GW_E2E_ACTOR_CHAIN', '0');
const RUN_IPS_INGESTION = isEnabledByDefault('RUN_LIVE_GW_E2E_IPS_INGESTION', '0');
const RUN_INDIVIDUAL_LIFECYCLE = isEnabledByDefault('RUN_LIVE_GW_E2E_INDIVIDUAL_LIFECYCLE', '0');
const RUN_PROFILE_RUNTIME = isEnabledByDefault('RUN_LIVE_GW_E2E_PROFILE_RUNTIME', '0');
const RUN_HOST_VERIFICATION_TRANSACTION = isEnabledByDefault('RUN_LIVE_GW_E2E_HOST_VERIFICATION_TRANSACTION', '0');
const ACTIVE_TRANSPORT_PROFILE = normalizeLiveGwTransportProfile(
  env('LIVE_GW_E2E_TRANSPORT', LiveGwTransportProfiles.DidcommPlain),
);
const ACTIVE_SUITE_PROFILE = normalizeLiveGwSuiteProfile(
  env('LIVE_GW_E2E_SUITE', LiveGwSuiteProfiles.All),
);
const ACTIVE_EXECUTION_MODE = normalizeLiveGwExecutionMode(
  env('LIVE_GW_E2E_EXECUTION_MODE', LiveGwExecutionModes.Direct),
);
const DEBUG = env('LIVE_GW_NODE_E2E_DEBUG', env('LIVE_GW_E2E_DEBUG', '0')) === '1';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIVE_HOST_VERIFICATION_DEFAULT_PDF_PATH = env(
  'LIVE_GW_HOST_VERIFICATION_PDF_PATH',
  path.join(__dirname, '..', '..', 'examples', 'TEST-A4-Antifraud.pdf'),
);
const LIVE_HOST_VERIFICATION_PDF_URL = env('LIVE_GW_HOST_VERIFICATION_PDF_URL');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const runSlug = runId.toLowerCase();
/**
 * Canonical isolation seed for one live execution.
 *
 * The suite intentionally derives fresh tenant and individual identifiers from
 * the current run timestamp so the final validation does not reuse persisted
 * Firestore/GCS state from an earlier execution.
 *
 * The host id must follow the same rule on the GW process side. Do not rerun
 * the final lifecycle on top of an old host registry; restart GW CORE with a
 * fresh host id for each final live validation.
 */
const defaultSuiteTenantId = `livee2e-${runSlug}`;
const defaultSuiteSubjectId = `z${runSlug.replace(/[^a-z0-9]/g, '')}`;
const ENV_JURISDICTION = 'JURISDICTION';
const ENV_SECTOR = 'SECTOR';
const ENV_HOST_JURISDICTION = 'HOST_JURISDICTION';
const ENV_HOST_NETWORK = 'HOST_NETWORK';
const ENV_HOST_NETWORK_OR_TENANT_SECTOR = 'HOST_NETWORK_OR_TENANT_SECTOR';
const DEFAULT_HOST_NETWORK = 'test';
const suiteTenantId = env('TENANT_ID', defaultSuiteTenantId || EXAMPLE_TENANT_IDENTIFIER);
const suiteTenantRouteId = env('TENANT_ROUTE_ID', suiteTenantId);
/**
 * Tenant organization jurisdiction for tenant-scoped routes.
 *
 * Step by step:
 * - this belongs to the tenant onboarding/runtime slice
 * - it is not the same value as the host coverage jurisdiction
 * - do not force `JURISDICTION=EU` just because the host is published under
 *   `/host/cds-EU/...`
 * - only set this env when the live run intentionally targets a tenant route
 *   for a specific jurisdiction
 * - otherwise the suite falls back to the shared example value
 */
const suiteJurisdiction = env(ENV_JURISDICTION, EXAMPLE_JURISDICTION);
const suiteSector = env(ENV_SECTOR, EXAMPLE_SECTOR);
const suiteSubjectDid = env('SUBJECT_DID', buildIndividualDidWeb({
  providerDidWeb: EXAMPLE_HOSTED_PROVIDER_DID,
  individualId: defaultSuiteSubjectId || EXAMPLE_SUBJECT_DID,
}));
const suiteHostIdentifierValue = env('HOST_ID_VALUE', `host-${runSlug}`);
/**
 * Host discovery/publication coverage scope.
 *
 * Step by step:
 * - this is the jurisdiction used by host-scoped routes and discovery docs
 * - in deployed GW runs it should normally come from the GW runtime env
 *   (`HOST_JURISDICTION`)
 * - callers should not override it unless they are intentionally testing a
 *   different host deployment profile
 */
const suiteHostCoverageScope = env('HOST_COVERAGE_SCOPE', env(ENV_HOST_JURISDICTION, 'EU'));
/**
 * Host route jurisdiction used by host-side onboarding routes such as
 * `/host/cds-{jurisdiction}/v1/{hostNetwork}/registry/...`.
 *
 * Important distinction:
 * - this is not the tenant business jurisdiction stored in onboarding claims
 * - local demo environments often publish host routes under `ES`
 * - shared staging/public host surfaces may publish them under `EU`
 * - use `HOST_JURISDICTION` to avoid accidentally sending host onboarding
 *   traffic to `/host/cds-ES/...` when the deployed host actually lives under
 *   `/host/cds-EU/...`
 */
const suiteHostRouteJurisdiction = env(ENV_HOST_JURISDICTION, suiteJurisdiction);
const suiteConsentSection = env(
  'SMART_SCOPE_SECTION',
  String(EXAMPLE_LIVE_CONSENT_GRANT_INPUT.actions?.[0] || HealthcareBasicSections.PatientSummaryDocument.attributeValue),
);
const LOCAL_LIVE_POLL_INTERVAL_MS = Math.max(1, Number(env('LIVE_GW_POLL_INTERVAL_MS', '200')));
const LOCAL_LIVE_POLL_TIMEOUT_MS = Math.max(1000, Number(env('LIVE_GW_POLL_TIMEOUT_MS', '60000')));
const LOCAL_LIVE_REQUEST_TIMEOUT_MS = Math.max(1000, Number(env('LIVE_GW_REQUEST_TIMEOUT_MS', '60000')));

function normalizeDirectDownloadUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return '';
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return trimmed;
  }
  const hostname = parsed.hostname.toLowerCase();
  const isDropboxHost = hostname === 'dropbox.com'
    || hostname.endsWith('.dropbox.com')
    || hostname === 'www.dropbox.com';
  if (isDropboxHost) {
    parsed.searchParams.set('dl', '1');
  }
  return parsed.toString();
}

function isLocalBaseUrl(baseUrl) {
  const normalized = String(baseUrl || '').trim().toLowerCase();
  return normalized.includes('127.0.0.1')
    || normalized.includes('localhost');
}

/**
 * Shared remote environments must not disable/purge the host by default.
 *
 * Step by step:
 * - local clean environments may exercise the full host teardown
 * - shared GKE/staging environments should leave the host published so other
 *   developers can continue using the environment
 * - callers can still force host teardown explicitly when they know they are
 *   running against an isolated host instance
 */
function shouldRunHostTeardown(baseUrl) {
  const explicit = env('LIVE_GW_ALLOW_HOST_TEARDOWN', '');
  if (explicit) {
    const normalized = explicit.toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }
  return isLocalBaseUrl(baseUrl);
}

function buildLiveHostVerificationPdfAttachment() {
  const normalizedUrl = normalizeDirectDownloadUrl(LIVE_HOST_VERIFICATION_PDF_URL);
  if (normalizedUrl) {
    return {
      id: 'signed-terms-pdf-001',
      media_type: 'application/pdf',
      data: {
        links: [normalizedUrl],
      },
    };
  }

  const resolvedLocalPath = path.resolve(LIVE_HOST_VERIFICATION_DEFAULT_PDF_PATH);
  return {
    id: 'signed-terms-pdf-001',
    media_type: 'application/pdf',
    data: {
      base64: fs.readFileSync(resolvedLocalPath).toString('base64'),
    },
  };
}

/**
 * Resolves the host-side `{segment}` used in `/host/cds-{jurisdiction}/v1/{segment}`.
 *
 * Step by step:
 * - for host routes this segment represents the host network/runtime scope
 * - for tenant routes the analogous segment is the tenant business sector
 * - older tests called both things `sector`, which is how mistakes like
 *   `SECTOR=test` leaked into host onboarding runs
 * - the canonical env for new live runs is `HOST_NETWORK`
 * - `HOST_NETWORK_OR_TENANT_SECTOR` is accepted as an explicit bridge name
 * - `HOST_REGISTRY_SECTOR` remains as a final legacy fallback only
 */
function resolveLiveHostNetworkOrTenantSector() {
  return env(
    ENV_HOST_NETWORK,
    env(
      ENV_HOST_NETWORK_OR_TENANT_SECTOR,
      env('HOST_REGISTRY_SECTOR', DEFAULT_HOST_NETWORK),
    ),
  );
}

assert.ok(
  isDirectExecutionMode(ACTIVE_EXECUTION_MODE),
  'Current live GW E2E suites require direct execution mode with local queue disabled.',
);

function createDebugLogger() {
  return ensureLiveGwTraceFiles({
    debugEnabled: DEBUG,
    debugFilePath: env(
      'LIVE_GW_NODE_E2E_DEBUG_FILE',
      path.join(__dirname, '..', 'test-results', `live-gw-node-runtime-debug-${runId}.jsonl`),
    ),
    httpTraceFilePath: env(
      'SDK_HTTP_TRACE_FILE',
      path.join(__dirname, '..', 'test-results', `live-gw-http-trace-${runId}.jsonl`),
    ),
  });
}

function readHttpTraceEntries(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return [];
  }
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function assertLatestActivateTraceHasPlaintextTransportMeta({
  jurisdiction,
  hostNetworkOrTenantSector,
  controller,
}) {
  const traceFilePath = String(process.env.SDK_HTTP_TRACE_FILE || '').trim();
  const expectedPath = `/host/cds-${jurisdiction}/v1/${hostNetworkOrTenantSector}/registry/org.schema/Organization/_activate`;
  const activationEntries = readHttpTraceEntries(traceFilePath)
    .filter((entry) => String(entry?.request?.url || '').includes(expectedPath))
    .filter((entry) => !String(entry?.request?.url || '').includes(`${expectedPath}-response`))
    .filter((entry) => entry?.request?.body?.meta?.jws?.protected);
  assert.ok(activationEntries.length > 0, `HTTP trace must contain an activation request for ${expectedPath}.`);

  const latest = activationEntries[activationEntries.length - 1];
  const protectedHeader = latest?.request?.body?.meta?.jws?.protected;
  const jweHeader = latest?.request?.body?.meta?.jwe?.header;
  assert.equal(
    protectedHeader?.kid,
    controller?.publicKeyJwk?.kid,
    'Plaintext activation trace must mirror controller.publicKeyJwk.kid into meta.jws.protected.kid.',
  );
  assert.deepEqual(
    protectedHeader?.jwk,
    controller?.publicKeyJwk,
    'Plaintext activation trace must mirror controller.publicKeyJwk into meta.jws.protected.jwk.',
  );
  assert.equal(
    jweHeader?.skid,
    controller?.jwks?.keys?.[0]?.kid,
    'Plaintext activation trace must mirror controller jwks encryption kid into meta.jwe.header.skid.',
  );
}

/**
 * Local live polling must stay tight and deterministic.
 *
 * In the canonical local flow there is no blockchain confirmation loop, so
 * waiting more than one second between polls only slows down developer and
 * integrator feedback. Blockchain-backed environments can override these
 * values explicitly through env vars later.
 */
function createLivePollOptions(overrides = {}) {
  return {
    timeoutMs: Math.max(1000, Number(overrides.timeoutMs ?? LOCAL_LIVE_POLL_TIMEOUT_MS)),
    intervalMs: Math.max(1, Number(overrides.intervalMs ?? LOCAL_LIVE_POLL_INTERVAL_MS)),
  };
}

function buildLiveLegalOrganizationVerificationTransactionInput({
  tenantId,
  tenantRouteId,
  jurisdiction,
  sector,
  controllerEmail,
  controllerRole,
  serviceIdentifierDid,
  serviceUrl,
}) {
  const exampleEntry = EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.data[0];
  return {
    claims: {
      ...cloneExample(exampleEntry.meta.claims),
      'org.schema.Organization.alternateName': tenantRouteId,
      'org.schema.Organization.legalName': env('ORG_LEGAL_NAME', 'TEST LEGAL ORGANIZATION SL'),
      'org.schema.Organization.identifier.additionalType': env('ORG_IDENTIFIER_TYPE', 'taxID'),
      'org.schema.Organization.identifier.value': tenantId,
      'org.schema.Organization.address.addressCountry': jurisdiction,
      'org.schema.Organization.taxID': tenantId,
      'org.schema.Person.email': controllerEmail,
      'org.schema.Person.hasOccupation.identifier.value': controllerRole,
      'org.schema.Service.category': sector,
      'org.schema.Service.identifier': serviceIdentifierDid,
      'org.schema.Service.url': serviceUrl,
    },
    controller: cloneExample(exampleEntry.resource.controller),
    organization: cloneExample(exampleEntry.resource.organization),
    legalRepresentativePayload: {
      ...cloneExample(exampleEntry.resource.legalRepresentativePayload),
      email: controllerEmail,
    },
    verification: cloneExample(exampleEntry.resource.verification),
    attachments: [buildLiveHostVerificationPdfAttachment()],
  };
}

async function maybeSubmitHostVerificationTransaction({
  profiler,
  debug,
  orgControllerSession,
  hostCtx,
  pollOptions,
  tenantId,
  tenantRouteId,
  jurisdiction,
  sector,
  controllerEmail,
  controllerRole,
  serviceIdentifierDid,
  serviceUrl,
  stage,
}) {
  /**
   * Compatibility branch selector for the legal organization onboarding suite.
   *
 * Step by step:
 * - when `RUN_LIVE_GW_E2E_HOST_VERIFICATION_TRANSACTION=1`, the suite proves
 *   the new host runtime path:
 *   `Organization/_transaction -> Order/_batch`
 * - when `RUN_LIVE_GW_E2E_HOST_VERIFICATION_TRANSACTION=0`, the suite skips
 *   `_transaction` and continues with the legacy activation path only
   * - that legacy path still depends on ICA `_verify` producing a compatible
   *   proof/credential for `_activate`
   *
   * The dedicated legacy live command is therefore the same professional live
   * slice with `RUN_LIVE_GW_E2E_HOST_VERIFICATION_TRANSACTION=0`.
   */
  if (!RUN_HOST_VERIFICATION_TRANSACTION) {
    return null;
  }

  const verification = await profiler.run(stage, () => orgControllerSession.asOrganizationController().submitLegalOrganizationVerificationTransaction(
    hostCtx,
    buildLiveLegalOrganizationVerificationTransactionInput({
      tenantId,
      tenantRouteId,
      jurisdiction,
      sector,
      controllerEmail,
      controllerRole,
      serviceIdentifierDid,
      serviceUrl,
    }),
    pollOptions,
  ));
  debug.record(stage, { response: verification });
  assert.equal(
    verification.poll.status,
    200,
    'Host verification transaction must complete successfully when the new host flow is enabled.',
  );
  assert.ok(
    ['transaction-response', 'batch-response'].includes(String(verification.poll.body?.type || '')),
    'Host verification transaction must return a terminal bundle response.',
  );
  assert.ok(
    ['200', '201'].includes(getFirstBatchEntryStatus(verification.poll.body, 'Host verification transaction')),
    'Host verification transaction must return an inner verification response.status of 200/201.',
  );
  return verification;
}

async function maybeActivateOrganizationFromLegacyIcaProof({
  profiler,
  debug,
  hostSession,
  hostCtx,
  pollOptions,
  vpToken,
  tenantId,
  tenantRouteId,
  jurisdiction,
  sector,
  controllerEmail,
  controllerRole,
  serviceIdentifierDid,
  serviceUrl,
  stage,
}) {
  if (RUN_HOST_VERIFICATION_TRANSACTION) {
    return null;
  }

  const activation = await profiler.run(stage, () => hostSession.asHostOnboarding().activateOrganizationInGatewayFromIcaProof(
    hostCtx,
    {
      vpToken,
      controller: cloneExample(EXAMPLE_ACTIVATE_ORGANIZATION_FROM_ICA_PROOF_INPUT.controller),
      additionalClaims: {
        ...cloneExample(EXAMPLE_ACTIVATE_ORGANIZATION_FROM_ICA_PROOF_INPUT.additionalClaims),
        'org.schema.Organization.alternateName': tenantRouteId,
        'org.schema.Organization.legalName': env('ORG_LEGAL_NAME', 'TEST LEGAL ORGANIZATION SL'),
        'org.schema.Organization.identifier.additionalType': env('ORG_IDENTIFIER_TYPE', 'taxID'),
        'org.schema.Organization.identifier.value': tenantId,
        'org.schema.Organization.address.addressCountry': jurisdiction,
        'org.schema.Organization.taxID': tenantId,
        'org.schema.Person.email': controllerEmail,
        'org.schema.Person.hasOccupation.identifier.value': controllerRole,
        'org.schema.Service.category': sector,
        'org.schema.Service.identifier': serviceIdentifierDid,
        'org.schema.Service.url': serviceUrl,
      },
    },
    pollOptions,
  ));
  debug.record(stage, { response: activation });
  assert.equal(activation.poll.status, 200, 'Legacy host onboarding facade must complete organization activation.');
  assertLatestActivateTraceHasPlaintextTransportMeta({
    jurisdiction: hostCtx.jurisdiction,
    hostNetworkOrTenantSector: hostCtx.hostNetworkOrTenantSector,
    controller: EXAMPLE_ACTIVATE_ORGANIZATION_FROM_ICA_PROOF_INPUT.controller,
  });
  assert.ok(
    ['200', '201', '409'].includes(getFirstBatchEntryStatus(activation.poll.body, 'Legacy host activation')),
    'Legacy host onboarding facade must return an inner activation response.status of 200/201/409.',
  );
  return activation;
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
      const ranked = [...steps].sort((a, b) => b.durationMs - a.durationMs);
      const totalDurationMs = steps.reduce((sum, step) => sum + step.durationMs, 0);
      const summary = {
        totalDurationMs,
        steps,
        slowestSteps: ranked.slice(0, 5),
      };
      debug.record(`${scope}-step-timing-summary`, summary);
      return summary;
    },
  };
}

function getBatchEntries(pollBody, label) {
  const entries = pollBody?.body?.data || pollBody?.data || [];
  assert.ok(Array.isArray(entries), `${label} must return a batch-style data array.`);
  assert.ok(entries.length > 0, `${label} must return at least one batch entry.`);
  return entries;
}

function getFirstBatchEntryStatus(pollBody, label) {
  return String(getBatchEntries(pollBody, label)[0]?.response?.status || '');
}

function getSearchRows(pollBody, label) {
  const first = getBatchEntries(pollBody, label)[0] || {};
  const rows = first?.resource?.data;
  assert.ok(Array.isArray(rows), `${label} first batch entry must expose resource.data.`);
  assert.ok(rows.length > 0, `${label} must return at least one matched row.`);
  return rows;
}

function getAcceptedOfferIdentifierFromResponseBody(body) {
  const first = getBatchEntries(body, 'Invoice/order response')[0] || {};
  const claims = first?.meta?.claims || {};
  return String(
    claims['org.schema.Order.acceptedOffer.identifier']
    || claims['Order.acceptedOffer.identifier']
    || '',
  ).trim();
}

function getInvoiceProjectionIdsFromResponseBody(body) {
  const first = getBatchEntries(body, 'Invoice/order response')[0] || {};
  const bundle = first?.resource;
  const entries = Array.isArray(bundle?.entry) ? bundle.entry : [];
  let pdfDocumentId;
  let structuredDocumentId;
  for (const entry of entries) {
    const resource = entry?.resource;
    if (resource?.resourceType !== 'DocumentReference') continue;
    const content = Array.isArray(resource?.content) ? resource.content : [];
    const attachment = content[0]?.attachment || {};
    const contentType = String(attachment?.contentType || '').trim();
    if (contentType === 'application/pdf') {
      pdfDocumentId = String(resource?.id || '').trim() || pdfDocumentId;
      continue;
    }
    if (!structuredDocumentId) {
      structuredDocumentId = String(resource?.id || '').trim() || structuredDocumentId;
    }
  }
  return { pdfDocumentId, structuredDocumentId };
}

function runtimeUuid() {
  const fromCrypto = globalThis.crypto?.randomUUID?.();
  if (fromCrypto) return fromCrypto;
  return `fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildRoutePath(ctx, section, format, resourceType, action) {
  return `/${encodeURIComponent(ctx.tenantId)}/cds-${encodeURIComponent(ctx.jurisdiction)}/v1/${encodeURIComponent(ctx.sector)}/${encodeURIComponent(section)}/${encodeURIComponent(format)}/${encodeURIComponent(resourceType)}/${encodeURIComponent(action)}`;
}

function buildTenantDspaceVersionPath(ctx) {
  return `/${encodeURIComponent(ctx.tenantId)}/cds-${encodeURIComponent(ctx.jurisdiction)}/v1/${encodeURIComponent(ctx.sector)}/.well-known/dspace-version`;
}

function buildTenantCatalogArtifactPath(ctx) {
  return `/${encodeURIComponent(ctx.tenantId)}/cds-${encodeURIComponent(ctx.jurisdiction)}/v1/${encodeURIComponent(ctx.sector)}/dsp/catalog/dcat.json`;
}

function buildHostDspaceVersionPath(hostCoverageScope, hostNetwork) {
  return `/host/cds-${encodeURIComponent(hostCoverageScope)}/v1/${encodeURIComponent(hostNetwork)}/.well-known/dspace-version`;
}

function buildHostCatalogArtifactPath(hostCoverageScope, hostNetwork) {
  return `/host/cds-${encodeURIComponent(hostCoverageScope)}/v1/${encodeURIComponent(hostNetwork)}/dsp/catalog/dcat.json`;
}

async function fetchJsonOrText(baseUrl, relativePath, bearerToken) {
  const response = await fetch(`${baseUrl}${relativePath}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json, text/plain, */*',
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
    },
  });
  const raw = await response.text();
  let json;
  try {
    json = raw ? JSON.parse(raw) : undefined;
  } catch {
    json = undefined;
  }
  return {
    status: response.status,
    body: json,
    text: raw,
  };
}

async function postJsonOrText(baseUrl, relativePath, body, bearerToken) {
  const response = await fetch(`${baseUrl}${relativePath}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let json;
  try {
    json = raw ? JSON.parse(raw) : undefined;
  } catch {
    json = undefined;
  }
  return {
    status: response.status,
    body: json,
    text: raw,
  };
}

async function waitForFetchStatus(baseUrl, relativePath, bearerToken, expectedStatus, options = {}) {
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || LOCAL_LIVE_POLL_TIMEOUT_MS));
  const intervalMs = Math.max(100, Number(options.intervalMs || LOCAL_LIVE_POLL_INTERVAL_MS));
  const startedAt = Date.now();
  let lastResponse;
  do {
    lastResponse = await fetchJsonOrText(baseUrl, relativePath, bearerToken);
    if (lastResponse.status === expectedStatus) {
      return lastResponse;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  } while ((Date.now() - startedAt) < timeoutMs);
  return lastResponse;
}

async function waitForPostStatus(baseUrl, relativePath, body, bearerToken, expectedStatus, options = {}) {
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || LOCAL_LIVE_POLL_TIMEOUT_MS));
  const intervalMs = Math.max(100, Number(options.intervalMs || LOCAL_LIVE_POLL_INTERVAL_MS));
  const startedAt = Date.now();
  let lastResponse;
  do {
    lastResponse = await postJsonOrText(baseUrl, relativePath, body, bearerToken);
    if (lastResponse.status === expectedStatus) {
      return lastResponse;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  } while ((Date.now() - startedAt) < timeoutMs);
  return lastResponse;
}

function getCatalogDatasetPublisherIds(catalogBody) {
  const datasets = Array.isArray(catalogBody?.['dcat:dataset']) ? catalogBody['dcat:dataset'] : [];
  return datasets
    .map((dataset) => String(dataset?.['dcterms:publisher']?.['@id'] || '').trim())
    .filter(Boolean);
}

function catalogIncludesTenantRouteFragment(catalogBody, tenantRouteId, jurisdiction, sector) {
  const routeFragment = `/${String(tenantRouteId || '').trim()}/cds-${String(jurisdiction || '').trim()}/${'v1'}/${String(sector || '').trim()}/`;
  if (!tenantRouteId || !jurisdiction || !sector) {
    return false;
  }
  return JSON.stringify(catalogBody || {}).includes(routeFragment);
}

async function submitAndPollDirect({ baseUrl, path: submitPath, payload, bearerToken, pollOptions }) {
  const submitResponse = await fetch(`${baseUrl}${submitPath}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json, application/didcomm-plain+json, */*',
      'Content-Type': 'application/didcomm-plain+json',
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const submitBody = await submitResponse.text();
  const location = submitResponse.headers.get('location');
  const submit = {
    status: submitResponse.status,
    location: location || undefined,
    body: submitBody ? JSON.parse(submitBody) : {},
  };
  assert.equal(submitResponse.status, 202, `Expected async submit 202 for ${submitPath}.`);
  assert.ok(location, `Expected Location header for ${submitPath}.`);

  const pollUrl = new URL(location, baseUrl);
  const timeoutMs = Math.max(1, Number(pollOptions?.timeoutMs || LOCAL_LIVE_POLL_TIMEOUT_MS));
  const intervalMs = Math.max(1, Number(pollOptions?.intervalMs || LOCAL_LIVE_POLL_INTERVAL_MS));
  const startedAt = Date.now();
  let attempts = 0;

  for (;;) {
    attempts += 1;
    const pollResponse = await fetch(pollUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json, application/didcomm-plain+json, */*',
        'Content-Type': 'application/json',
        ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      },
      body: JSON.stringify({ thid: payload.thid }),
    });
    const raw = await pollResponse.text();
    const body = raw ? JSON.parse(raw) : {};
    if (pollResponse.status === 200 || pollResponse.status >= 400) {
      return {
        submit,
        poll: {
          status: pollResponse.status,
          body,
          attempts,
        },
      };
    }
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(`Timed out polling ${pollUrl.pathname} for thid ${payload.thid}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

function buildLicenseIssueDidcommPayload({ ctx, email, role, userClass, deviceType }) {
  return {
    jti: `jti-${runtimeUuid()}`,
    iss: ctx.tenantId,
    aud: ctx.tenantId,
    type: 'application/didcomm-plain+json',
    thid: `license-issue-${runtimeUuid()}`,
    body: {
      resourceType: 'Bundle',
      type: 'batch',
      data: [
        buildLicenseIssueEntry({
          ...cloneExample(EXAMPLE_LICENSE_ISSUE_INPUT),
          email,
          role,
          userClass,
          type: deviceType,
        }),
      ],
    },
  };
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

/**
 * Canonical professional live lifecycle.
 *
 * This same test covers two legal-onboarding branches:
 *
 * 1. new runtime branch
 *    - set `RUN_LIVE_GW_E2E_HOST_VERIFICATION_TRANSACTION=1`
 *    - proves `Organization/_transaction -> Order/_batch`
 *
 * 2. legacy compatibility branch
 *    - set `RUN_LIVE_GW_E2E_HOST_VERIFICATION_TRANSACTION=0`
 *    - proves the older ICA `_verify -> Organization/_activate` path without
 *      the new host `_transaction` submit/poll step
 *
 * Dedicated legacy command:
 *
 * ```bash
 * RUN_LIVE_GW_E2E=1 \
 * RUN_LIVE_GW_E2E_ACTOR_CHAIN=1 \
 * RUN_LIVE_GW_E2E_HOST_VERIFICATION_TRANSACTION=0 \
 * LIVE_GW_E2E_SUITE=professional \
 * node --test tests/live-gw-node-runtime.e2e.test.mjs
 * ```
 */
test('LIVE professional lifecycle on GW', {
  skip: !(RUN && RUN_ACTOR_CHAIN && shouldRunLiveGwSuiteProfile(ACTIVE_SUITE_PROFILE, LiveGwSuiteProfiles.Professional)),
}, async () => {
  const debug = createDebugLogger();
  const baseUrl = env('BASE_URL', EXAMPLE_LIVE_GW_BASE_URL_LOCAL);
  const vpTokenEnv = env('VP_TOKEN');
  const vpTokenFile = env(
    'VP_TOKEN_FILE',
    path.join(__dirname, 'fixtures', 'ica-vp-minimal.json'),
  );
  const tenantId = suiteTenantId;
  const tenantRouteId = suiteTenantRouteId;
  const jurisdiction = suiteJurisdiction;
  const sector = suiteSector;
  const hostNetworkOrTenantSector = resolveLiveHostNetworkOrTenantSector();
  const professionalIdToken = env(
    'PROFESSIONAL_ID_TOKEN',
    buildUnsignedJwt({
      sub: env('PROFESSIONAL_SUB', 'professional'),
      tenant_id: tenantId,
      email: env('PROFESSIONAL_EMAIL', 'professional@example.com'),
    }),
  );
  const bearerToken = env('AUTH_BEARER', professionalIdToken);
  const professionalDid = env('PROFESSIONAL_DID', EXAMPLE_API_ORGANIZATION_DID);
  const controllerEmail = env('CONTROLLER_EMAIL', `controller+${runSlug}@example.com`);
  const controllerRole = env('CONTROLLER_ROLE', 'RESPRSN');
  const serviceIdentifierDid = env('SERVICE_IDENTIFIER_DID', 'did:web:provider.example.org');
  const serviceUrl = env('SERVICE_URL', 'https://provider.example.org');

  const vpPayload = loadVpPayloadFixture(vpTokenFile);
  const vpToken = vpTokenEnv || buildUnsignedVpJwt(vpPayload);
  const hostCtx = { jurisdiction: suiteHostRouteJurisdiction, hostNetworkOrTenantSector };
  const ctx = { tenantId: tenantRouteId, jurisdiction, sector };
  const pollOptions = createLivePollOptions();

  const pingPath = `/host/cds-${jurisdiction}/v1/${hostNetworkOrTenantSector}/.well-known/ping`;
  const ping = await fetch(`${baseUrl}${pingPath}`);
  assert.equal(ping.status, 200, `GW ping must return 200 at ${baseUrl}${pingPath}.`);
  debug.record('ping', { baseUrl, pingPath, status: ping.status });

  const runtimeClient = createRuntimeClient({ baseUrl, ctx, bearerToken, requestTimeoutMs: LOCAL_LIVE_REQUEST_TIMEOUT_MS });

  const hostSession = new NodeActorSession(
    {
      actorKind: ActorKinds.HostOnboarding,
      capabilities: [
        ActorCapabilities.HostingActivateOrganization,
        ActorCapabilities.HostingConfirmOrder,
        ActorCapabilities.HostingDisableHost,
        ActorCapabilities.HostingPurgeHost,
      ],
    },
    runtimeClient,
  );
  const orgControllerSession = new NodeActorSession(
    {
      actorKind: ActorKinds.OrganizationController,
      capabilities: [
        ActorCapabilities.OrganizationCreateEmployee,
        ActorCapabilities.OrganizationDisableEmployee,
        ActorCapabilities.OrganizationPurgeEmployee,
        ActorCapabilities.TokenRequestSmart,
      ],
    },
    runtimeClient,
  );
  const individualControllerSession = new NodeActorSession(
    {
      actorKind: ActorKinds.IndividualController,
      capabilities: [
        ActorCapabilities.IndividualBootstrap,
        ActorCapabilities.ConsentGrantProfessionalAccess,
        ActorCapabilities.TokenRequestSmart,
        ActorCapabilities.IndividualDisable,
        ActorCapabilities.IndividualPurge,
      ],
    },
    runtimeClient,
  );

  const verification = await maybeSubmitHostVerificationTransaction({
    profiler: {
      run: async (_label, work) => work(),
    },
    debug,
    orgControllerSession,
    hostCtx,
    pollOptions,
    tenantId,
    tenantRouteId,
    jurisdiction,
    sector,
    controllerEmail,
    controllerRole,
    serviceIdentifierDid,
    serviceUrl,
    stage: 'legal-verification-transaction',
  });

  if (verification) {
    const legalOfferId = extractOfferIdFromResponseBody(verification.poll.body);
    assert.ok(legalOfferId, 'Host verification transaction must expose one offer identifier before order confirmation.');
    const legalOrder = await orgControllerSession.asOrganizationController().confirmOrganizationLicenseOrder(
      ctx,
      {
        offerId: legalOfferId,
        hostNetwork: hostNetworkOrTenantSector,
      },
      pollOptions,
    );
    debug.record('legal-order-confirmation', { response: legalOrder, offerId: legalOfferId });
    assert.equal(legalOrder.poll.status, 200, 'Organization controller facade must confirm the legal organization order after _transaction.');
    assert.ok(
      ['200', '201'].includes(getFirstBatchEntryStatus(legalOrder.poll.body, 'Legal organization order')),
      'Legal organization order must return an inner response.status of 200/201.',
    );
  }

  await maybeActivateOrganizationFromLegacyIcaProof({
    profiler: {
      run: async (_label, work) => work(),
    },
    debug,
    hostSession,
    hostCtx,
    pollOptions,
    vpToken,
    tenantId,
    tenantRouteId,
    jurisdiction,
    sector,
    controllerEmail,
    controllerRole,
    serviceIdentifierDid,
    serviceUrl,
    stage: 'legal-activation',
  });

  const didBinding = await orgControllerSession.asOrganizationController().submitOrganizationDidBinding(
    ctx,
    {
      organization: {
        url: env('ORGANIZATION_BINDING_URL', serviceUrl),
      },
    },
    pollOptions,
  );
  debug.record('organization-did-binding', { response: didBinding });
  assert.equal(didBinding.poll.status, 200, 'Organization controller facade must bind the tenant DID document aliases through GW.');
  {
    const bindingEntries = getBatchEntries(didBinding.poll.body, 'Organization DID binding');
    assert.equal(String(bindingEntries[0]?.response?.status || ''), '200', 'Organization DID binding must return inner success 200.');
  }

  const employeeEmail = env('EMPLOYEE_EMAIL', `employee+${runSlug}@example.com`);
  const employeeRole = env('EMPLOYEE_ROLE', 'ISCO-08|2211');
  const employeeIdentifier = env('EMPLOYEE_IDENTIFIER', `urn:uuid:${runtimeUuid()}`);
  const employeeClaims = {
    ...cloneExample(EXAMPLE_LIVE_EMPLOYEE_INPUT.employeeClaims),
    [ClaimsPersonSchemaorg.identifier]: employeeIdentifier,
    [ClaimsPersonSchemaorg.email]: employeeEmail,
    [ClaimsPersonSchemaorg.hasOccupationalRoleValue]: employeeRole,
    [ClaimsPersonSchemaorg.memberOfOrgTaxId]: tenantId,
  };

  const employee = await orgControllerSession.asOrganizationController().createOrganizationEmployee(
    ctx,
    {
      employeeClaims,
    },
    pollOptions,
  );
  debug.record('employee-create', { response: employee });
  assert.equal(employee.poll.status, 200, 'Organization controller facade must create employee through GW.');

  const employeeSearch = await orgControllerSession.asOrganizationController().searchOrganizationEmployees(
    ctx,
    {
      employeeClaims: {
        [ClaimsPersonSchemaorg.identifier]: employeeIdentifier,
        [ClaimsPersonSchemaorg.email]: employeeEmail,
        [ClaimsPersonSchemaorg.hasOccupationalRoleValue]: employeeRole,
        [ClaimsPersonSchemaorg.memberOfOrgTaxId]: tenantId,
      },
    },
  );
  debug.record('employee-search', { response: employeeSearch });
  assert.equal(employeeSearch.poll.status, 200, 'Organization controller facade must search the created employee through GW.');
  const employeeRows = getSearchRows(employeeSearch.poll.body, 'Employee search after create');
  const employeeRow = employeeRows.find((row) =>
    extractFlatClaimValue(row, ClaimsPersonSchemaorg.identifier) === employeeIdentifier
    && extractFlatClaimValue(row, ClaimsPersonSchemaorg.email) === employeeEmail,
  ) || employeeRows[0];
  assert.ok(employeeRow, 'Employee search after create must return one matching row.');
  const employeeResourceId = String(
    employeeRow?.resourceId
    || employeeRow?.id
    || extractFlatClaimValue(employeeRow, 'Employee.id')
    || '',
  ).trim();
  assert.ok(employeeResourceId, 'Employee search after create must expose one resource id for lifecycle operations.');

  const purgeWhileActive = await orgControllerSession.asOrganizationController().purgeEmployee(
    ctx,
    {
      employeeClaims,
      resourceId: employeeResourceId,
    },
    pollOptions,
  );
  debug.record('employee-purge-active', { response: purgeWhileActive });
  assert.equal(purgeWhileActive.poll.status, 200, 'Employee purge on active employee must still complete the async envelope.');
  {
    const purgeEntries = getBatchEntries(purgeWhileActive.poll.body, 'Employee purge while active');
    const first = purgeEntries[0] || {};
    const purgeStatus = String(first?.response?.status || '');
    assert.ok(
      purgeStatus === '404' || purgeStatus === '409',
      'Employee purge while active must return inner 404/409 according to the current GW CORE runtime guard.',
    );
    if (purgeStatus === '409') {
      assert.match(
        String(first?.response?.outcome?.issue?.[0]?.diagnostics || ''),
        /disabled before purge/i,
        'Employee purge while active conflict must explain that disable is required first.',
      );
    }
  }

  const disableEmployee = await orgControllerSession.asOrganizationController().disableEmployee(
    ctx,
    {
      employeeClaims,
      resourceId: employeeResourceId,
    },
    pollOptions,
  );
  debug.record('employee-disable', { response: disableEmployee });
  assert.equal(disableEmployee.poll.status, 200, 'Organization controller facade must disable employee through GW.');
  {
    const disableEntries = getBatchEntries(disableEmployee.poll.body, 'Employee disable');
    assert.equal(String(disableEntries[0]?.response?.status || ''), '200', 'Employee disable must return inner success 200.');
  }

  const purgeDisabled = await orgControllerSession.asOrganizationController().purgeEmployee(
    ctx,
    {
      employeeClaims,
      resourceId: employeeResourceId,
    },
    pollOptions,
  );
  debug.record('employee-purge-disabled', { response: purgeDisabled });
  assert.equal(purgeDisabled.poll.status, 200, 'Organization controller facade must purge an inactive employee through GW.');
  {
    const purgeEntries = getBatchEntries(purgeDisabled.poll.body, 'Employee purge after disable');
    assert.equal(String(purgeEntries[0]?.response?.status || ''), '200', 'Employee purge after disable must return inner success 200.');
  }

  const individualAltName = env(
    'INDIVIDUAL_ALTERNATE_NAME',
    `${runSlug}-individual-${EXAMPLE_REGISTERED_SUBJECT_ALTERNATE_NAME}`,
  );
  const individualControllerEmail = env(
    'INDIVIDUAL_CONTROLLER_EMAIL',
    `controller+${runSlug}@example.com`,
  );
  const patientSubjectDid = suiteSubjectDid;
  const smartProfessionalDid = env('SMART_SUBJECT_DID', buildProfessionalDidWeb({
    organizationDidWeb: 'did:web:api.acme.org',
    email: 'doctor1@acme.org',
    role: 'ISCO-08|2211',
  }));
  const smartClientId = env('SMART_CLIENT_ID', 'did:web:api.acme.org:employee:admin1@acme.org:device:demo');

  const individualStart = await individualControllerSession.asIndividualController().startIndividualOrganization({
    tenantId: tenantRouteId,
    jurisdiction,
    sector,
    alternateName: individualAltName,
    controllerEmail: individualControllerEmail,
    controllerRole: env('INDIVIDUAL_CONTROLLER_ROLE', 'RESPRSN'),
    additionalClaims: {
      'org.schema.Person.email': individualControllerEmail,
      'org.schema.Person.hasOccupation.identifier.value': env('INDIVIDUAL_CONTROLLER_ROLE', 'RESPRSN'),
      'org.schema.Service.category': sector,
    },
    timeoutSeconds: Math.round(pollOptions.timeoutMs / 1000),
    intervalSeconds: pollOptions.intervalMs / 1000,
  });
  debug.record('individual-start', { response: individualStart });
  assert.equal(individualStart.registration.poll.status, 200, 'Individual controller facade must start subject organization registration.');

  const individualOrder = await individualControllerSession.asIndividualController().confirmIndividualOrganizationOrder({
    tenantId: tenantRouteId,
    jurisdiction,
    sector,
    offerId: individualStart.offerId,
    timeoutSeconds: Math.round(pollOptions.timeoutMs / 1000),
    intervalSeconds: pollOptions.intervalMs / 1000,
  });
  debug.record('individual-order', { response: individualOrder });
  assert.equal(individualOrder.poll.status, 200, 'Individual controller facade must confirm subject order.');
  {
    const invoiceSummary = readInvoiceBundleSummaryFromResponseBody(individualOrder.poll.body);
    assert.equal(invoiceSummary.invoiceId, individualStart.offerId, 'Individual order must return an invoice bundle with a reusable invoice identifier.');
    assert.ok(invoiceSummary.pdfDocumentId, 'Individual order must include a PDF invoice DocumentReference.');
    assert.ok(invoiceSummary.structuredDocumentId, 'Individual order must include a structured invoice DocumentReference.');
  }

  const consent = await individualControllerSession.asIndividualController().grantProfessionalAccess(ctx, {
    ...cloneExample(EXAMPLE_LIVE_CONSENT_GRANT_INPUT),
    subjectDid: patientSubjectDid,
    actor: { identifier: smartProfessionalDid },
    actorRole: env('PROFESSIONAL_ROLE', 'ISCO-08|2211'),
    purpose: env('CONSENT_PURPOSE', 'TREAT'),
    pollOptions,
  });
  debug.record('consent', { response: consent });
  assert.equal((consent.consent || consent).poll.status, 200, 'Individual controller facade must grant professional access.');

  const smartVpToken = env(
    'SMART_VP_TOKEN',
    buildUnsignedProfessionalSmartVpJwt({
      clientId: smartClientId,
      actorDid: smartProfessionalDid,
      role: env('SMART_SUBJECT_OCCUPATION', 'ISCO-08|2211'),
    }),
  );

  const smart = await individualControllerSession.asIndividualController().requestSmartToken({
    tenantId: tenantRouteId,
    jurisdiction,
    sector,
    idToken: professionalIdToken,
    actorDid: smartProfessionalDid,
    subjectDid: smartProfessionalDid,
    clientId: smartClientId,
    issuer: env('SMART_ISSUER', smartClientId),
    audience: env('SMART_AUDIENCE', 'did:web:api.acme.org'),
    redirectUri: env('SMART_REDIRECT_URI', 'https://app.acme.org/callback'),
    acrValues: env('SMART_ACR_VALUES', 'urn:antifraud:acr:openid4vp:employee'),
    codeChallenge: env('SMART_CODE_CHALLENGE', 'b2MtY2hhbGxlbmdlLWJhc2U2NA'),
    codeChallengeMethod: 'S256',
    vpToken: smartVpToken,
    presentationSubmission: cloneExample(EXAMPLE_SMART_PRESENTATION_SUBMISSION),
    scopes: [`organization/Composition.rs?subject=${env('SMART_SCOPE_SUBJECT_DID', patientSubjectDid)}&section=${suiteConsentSection} organization/Consent.cruds`],
    smartTokenKind: 'openid-smart',
    timeoutSeconds: 60,
    intervalSeconds: 2,
  });
  debug.record('smart-token', { response: smart });
  assert.ok(smart.accessToken, 'Individual controller facade must obtain a SMART token.');

  if (RUN_INDIVIDUAL_LIFECYCLE) {
    const individualLifecycleEditor = new IndividualOrganizationLifecycleEditor()
      .setIdentifier(patientSubjectDid)
      .setAlternateName(individualAltName)
      .setOwnerEmail(individualControllerEmail);

    const disable = await individualControllerSession.asIndividualController().disableIndividualOrganization(
      ctx,
      {
        organizationEditor: individualLifecycleEditor,
      },
      pollOptions,
    );
    debug.record('individual-disable', { response: disable });
    assert.equal(disable.poll.status, 200, 'Individual controller facade must disable the hosted subject organization.');

    const purge = await individualControllerSession.asIndividualController().purgeIndividualOrganization(
      ctx,
      {
        organizationEditor: individualLifecycleEditor,
      },
      pollOptions,
    );
    debug.record('individual-purge', { response: purge });
    assert.equal(purge.poll.status, 200, 'Individual controller facade must purge the hosted subject organization after disable.');
  }
});

async function runLiveIndividualLifecycleSuite() {
  const debug = createDebugLogger();
  const baseUrl = env('BASE_URL', EXAMPLE_LIVE_GW_BASE_URL_LOCAL);
  const runHostTeardown = shouldRunHostTeardown(baseUrl);
  const vpTokenEnv = env('VP_TOKEN');
  const vpTokenFile = env(
    'VP_TOKEN_FILE',
    path.join(__dirname, 'fixtures', 'ica-vp-minimal.json'),
  );
  const tenantId = suiteTenantId;
  const tenantRouteId = suiteTenantRouteId;
  const jurisdiction = suiteJurisdiction;
  const sector = suiteSector;
  const hostNetworkOrTenantSector = resolveLiveHostNetworkOrTenantSector();
  const bearerToken = env('AUTH_BEARER', 'dummy');
  const doctorDid = env('INDIVIDUAL_TEST_DOCTOR_DID', EXAMPLE_API_ORGANIZATION_DID);
  const doctorEmail = env('INDIVIDUAL_TEST_DOCTOR_EMAIL', EXAMPLE_EMAIL_PROFESSIONAL);
  const memberEmail = env('INDIVIDUAL_MEMBER_EMAIL', `member+${runSlug}@example.com`);
  const memberRole = env('INDIVIDUAL_MEMBER_ROLE', EXAMPLE_RELATED_PERSON_ROLE);
  const ctx = { tenantId: tenantRouteId, jurisdiction, sector };
  const hostCtx = { jurisdiction: suiteHostRouteJurisdiction, hostNetworkOrTenantSector };
  const pollOptions = createLivePollOptions();

  const vpPayload = loadVpPayloadFixture(vpTokenFile);
  const vpToken = vpTokenEnv || buildUnsignedVpJwt(vpPayload);
  const runtimeClient = createRuntimeClient({ baseUrl, ctx, bearerToken, requestTimeoutMs: LOCAL_LIVE_REQUEST_TIMEOUT_MS });
  const hostDiscoveryVersionPath = buildHostDspaceVersionPath(suiteHostCoverageScope, hostNetworkOrTenantSector);
  const hostCatalogArtifactPath = buildHostCatalogArtifactPath(suiteHostCoverageScope, hostNetworkOrTenantSector);
  const profiler = createStepProfiler(debug, 'individual-suite');
  const hostSession = new NodeActorSession(
    {
      actorKind: ActorKinds.HostOnboarding,
      capabilities: [
        ActorCapabilities.HostingActivateOrganization,
        ActorCapabilities.HostingConfirmOrder,
        ActorCapabilities.HostingDisableHost,
        ActorCapabilities.HostingPurgeHost,
      ],
    },
    runtimeClient,
  );
  const individualControllerSession = new NodeActorSession(
    {
      actorKind: ActorKinds.IndividualController,
      capabilities: [
        ActorCapabilities.IndividualBootstrap,
        ActorCapabilities.IndividualIngestCommunication,
        ActorCapabilities.ConsentGrantProfessionalAccess,
        ActorCapabilities.IndividualUpsertRelatedPerson,
        ActorCapabilities.IndividualMemberDisable,
        ActorCapabilities.IndividualMemberPurge,
        ActorCapabilities.IndividualDisable,
        ActorCapabilities.IndividualPurge,
      ],
    },
    runtimeClient,
  );
  const orgControllerSession = new NodeActorSession(
    {
      actorKind: ActorKinds.OrganizationController,
      capabilities: [
        ActorCapabilities.OrganizationDisableTenant,
        ActorCapabilities.OrganizationPurgeTenant,
      ],
    },
    runtimeClient,
  );

  await maybeActivateOrganizationFromLegacyIcaProof({
    profiler,
    debug,
    hostSession,
    hostCtx,
    pollOptions,
    vpToken,
    tenantId,
    tenantRouteId,
    jurisdiction,
    sector,
    controllerEmail: env('CONTROLLER_EMAIL', `controller+${runSlug}@example.com`),
    controllerRole: env('CONTROLLER_ROLE', 'RESPRSN'),
    serviceIdentifierDid: env('SERVICE_IDENTIFIER_DID', 'did:web:provider.example.org'),
    serviceUrl: env('SERVICE_URL', 'https://provider.example.org'),
    stage: 'activate-organization',
  });

  const hostDspaceBeforeDisable = await profiler.run('host-dspace-before-disable', () => fetchJsonOrText(baseUrl, hostDiscoveryVersionPath, bearerToken));
  debug.record('individual-suite-host-dspace-before-disable', hostDspaceBeforeDisable);
  assert.equal(hostDspaceBeforeDisable.status, 200, 'Host dspace-version must be published while the host remains active.');

  const hostCatalogBeforeDisable = await profiler.run('host-catalog-before-disable', () => fetchJsonOrText(baseUrl, hostCatalogArtifactPath, bearerToken));
  debug.record('individual-suite-host-catalog-before-disable', hostCatalogBeforeDisable);
  assert.equal(hostCatalogBeforeDisable.status, 200, 'Host DCAT catalog must be published while the host remains active.');
  assert.ok(
    catalogIncludesTenantRouteFragment(hostCatalogBeforeDisable.body, tenantRouteId, jurisdiction, sector),
    'Host DCAT catalog must list the activated tenant route while the tenant remains operational.',
  );

  const individualAltName = env(
    'INDIVIDUAL_ALTERNATE_NAME',
    `${runSlug}-profile-${EXAMPLE_REGISTERED_SUBJECT_ALTERNATE_NAME}`,
  );
  const individualControllerEmail = env(
    'INDIVIDUAL_CONTROLLER_EMAIL',
    `controller+${runSlug}@example.com`,
  );
  const subjectDid = suiteSubjectDid;
  const individualStart = await profiler.run('individual-start', () => individualControllerSession.asIndividualController().startIndividualOrganization({
    tenantId: tenantRouteId,
    jurisdiction,
    sector,
    alternateName: individualAltName,
    controllerEmail: individualControllerEmail,
    controllerRole: env('INDIVIDUAL_CONTROLLER_ROLE', 'RESPRSN'),
    additionalClaims: {
      'org.schema.Person.email': individualControllerEmail,
      'org.schema.Person.hasOccupation.identifier.value': env('INDIVIDUAL_CONTROLLER_ROLE', 'RESPRSN'),
      'org.schema.Service.category': sector,
    },
    timeoutSeconds: Math.round(pollOptions.timeoutMs / 1000),
    intervalSeconds: pollOptions.intervalMs / 1000,
  }));
  debug.record('individual-suite-start', { response: individualStart });
  assert.equal(individualStart.registration.poll.status, 200, 'Individual lifecycle suite must create the hosted individual tenant.');

  const individualOrder = await profiler.run('individual-order', () => individualControllerSession.asIndividualController().confirmIndividualOrganizationOrder({
    tenantId: tenantRouteId,
    jurisdiction,
    sector,
    offerId: individualStart.offerId,
    timeoutSeconds: Math.round(pollOptions.timeoutMs / 1000),
    intervalSeconds: pollOptions.intervalMs / 1000,
  }));
  debug.record('individual-suite-order', { response: individualOrder });
  assert.equal(individualOrder.poll.status, 200, 'Individual lifecycle suite must confirm the hosted individual order.');
  {
    const invoiceSummary = readInvoiceBundleSummaryFromResponseBody(individualOrder.poll.body);
    const resolvedInvoiceId = invoiceSummary.invoiceId || getAcceptedOfferIdentifierFromResponseBody(individualOrder.poll.body);
    const projectionIds = getInvoiceProjectionIdsFromResponseBody(individualOrder.poll.body);
    assert.equal(resolvedInvoiceId, individualStart.offerId, 'Individual lifecycle suite must expose the invoice bundle returned by GW CORE.');
    assert.ok(invoiceSummary.pdfDocumentId || projectionIds.pdfDocumentId, 'Individual lifecycle suite must return a PDF invoice projection.');
    assert.ok(invoiceSummary.structuredDocumentId || projectionIds.structuredDocumentId, 'Individual lifecycle suite must return a structured invoice projection.');
  }

  const tenantDspaceBeforeDisable = await profiler.run('tenant-dspace-before-disable', () => fetchJsonOrText(baseUrl, buildTenantDspaceVersionPath(ctx), bearerToken));
  debug.record('individual-suite-tenant-dspace-before-disable', tenantDspaceBeforeDisable);
  assert.equal(tenantDspaceBeforeDisable.status, 200, 'Tenant dspace-version must be published while the tenant remains active.');

  const tenantCatalogBeforeDisable = await profiler.run('tenant-catalog-before-disable', () => fetchJsonOrText(baseUrl, buildTenantCatalogArtifactPath(ctx), bearerToken));
  debug.record('individual-suite-tenant-catalog-before-disable', tenantCatalogBeforeDisable);
  assert.equal(tenantCatalogBeforeDisable.status, 200, 'Tenant DCAT catalog must be published while the tenant remains active.');

  const medicationCases = buildExampleLiveMedicationCases(Date.now());
  let indexedBeforeIngestion = null;
  try {
    indexedBeforeIngestion = await individualControllerSession.asIndividualController().getLatestIps(
      ctx,
      {
        subject: subjectDid,
        pollOptions,
      },
    );
  } catch (error) {
    indexedBeforeIngestion = {
      error: error instanceof Error ? error.message : String(error),
    };
  }
  debug.record('individual-suite-index-before-ingestion', { response: indexedBeforeIngestion });

  for (const medication of medicationCases) {
    const medicationIpsBundle = buildExampleMedicationIpsDocumentBundle({
      subjectDid,
      medication,
    });
    const ingestionPayload = buildExampleCommunicationIngestionPayload({
      subjectDid,
      sent: medication.effectiveDateTime,
      ipsBundleBase64: Buffer.from(JSON.stringify(medicationIpsBundle), 'utf8').toString('base64'),
    });
    const ingestion = await profiler.run(`medication-ingest-${medication.identifier}`, () => individualControllerSession.asIndividualController().ingestCommunicationAndUpdateIndex(
      ctx,
      {
        communicationPayload: ingestionPayload,
        pathFormatSegment: 'api',
        pollOptions,
      },
    ));
    debug.record('individual-suite-ingest', {
      medicationIdentifier: medication.identifier,
      response: ingestion,
    });
    assert.equal(ingestion.poll.status, 200, `Individual lifecycle suite must ingest medication ${medication.identifier}.`);
  }

  const ipsSearchCommunicationPayload = createIpsSummarySearchDidcommMessage({
    subjectId: subjectDid,
    requesterId: env('INDIVIDUAL_IPS_SEARCH_REQUESTER_ID', EXAMPLE_API_ORGANIZATION_DID),
    thid: `individual-suite-ips-search-${runtimeUuid()}`,
    sent: new Date().toISOString(),
  });
  const ipsSearch = await profiler.run('ips-search', () => individualControllerSession.asIndividualController().ingestCommunicationAndUpdateIndex(
    ctx,
    {
      communicationPayload: ipsSearchCommunicationPayload,
      pathFormatSegment: 'org.hl7.fhir.r4',
      pollOptions,
    },
  ));
  debug.record('individual-suite-ips-search', { response: ipsSearch });
  assert.equal(ipsSearch.poll.status, 200, 'Individual lifecycle suite must return the latest IPS document view.');
  const ipsIndexedBundle = getBatchEntries(
    ipsSearch.poll.body,
    'Individual lifecycle IPS communication search',
  )[0]?.resource;
  assert.ok(
    getBundleDocumentResourceIds(ipsIndexedBundle).length > 0 || getBundleDocumentResources(ipsIndexedBundle).length > 0,
    'Individual lifecycle suite must expose at least one indexed bundle/document resource after IPS ingestion.',
  );

  const relatedPersonIdentifier = `urn:uuid:${runtimeUuid()}`;
  const relatedPersonResourceId = `family-member-${runSlug}`;
  const relatedPersonPayload = cloneExample(EXAMPLE_RELATED_PERSON_UPSERT_BUNDLE_PAYLOAD);
  relatedPersonPayload.thid = `relatedperson-upsert-${runtimeUuid()}`;
  relatedPersonPayload.body.entry[0].resource = {
    ...cloneExample(EXAMPLE_RELATED_PERSON_FHIR_RESOURCE),
    id: relatedPersonResourceId,
    identifier: [{ value: relatedPersonIdentifier }],
    patient: { reference: subjectDid },
    name: [{ text: `${runSlug}-Doraemon` }],
    telecom: [{ value: `mailto:${memberEmail}` }],
  };
  const relatedPersonUpsert = await profiler.run('related-person-upsert', () => individualControllerSession.asIndividualController().upsertRelatedPersonAndPoll(
    ctx,
    {
      relatedPersonPayload,
      pollOptions,
    },
  ));
  debug.record('individual-suite-relatedperson-upsert', { response: relatedPersonUpsert });
  assert.equal(relatedPersonUpsert.poll.status, 200, 'Individual lifecycle suite must upsert one family related person.');

  const memberIssue = await profiler.run('member-license-issue', () => submitAndPollDirect({
    baseUrl,
    path: buildRoutePath(ctx, 'identity', 'openid', 'License', '_issue'),
    bearerToken,
    pollOptions,
    payload: buildLicenseIssueDidcommPayload({
      ctx,
      email: memberEmail,
      role: memberRole,
      userClass: DeviceUserClasses.Individual,
      deviceType: DeviceAppTypes.Mobile,
    }),
  }));
  debug.record('individual-suite-member-license-issue', { response: memberIssue });
  assert.equal(memberIssue.poll.status, 200, 'Individual lifecycle suite must issue one member activation code from the individual seat pool.');

  const memberConsent = await profiler.run('member-consent-grant', () => individualControllerSession.asIndividualController().grantProfessionalAccess(ctx, {
    ...cloneExample(EXAMPLE_LIVE_CONSENT_GRANT_INPUT),
    subjectDid,
    actor: { email: memberEmail },
    actorRole: memberRole,
    purpose: env('CONSENT_PURPOSE', 'TREAT'),
    pollOptions,
  }));
  debug.record('individual-suite-member-consent', { response: memberConsent });
  assert.equal(memberConsent.consent.poll.status, 200, 'Individual lifecycle suite must create a consent for the invited member.');

  const doctorConsent = await profiler.run('doctor-consent-grant', () => individualControllerSession.asIndividualController().grantProfessionalAccess(ctx, {
    ...cloneExample(EXAMPLE_LIVE_CONSENT_GRANT_INPUT),
    subjectDid,
    actor: [doctorDid, doctorEmail],
    actorRole: env('PROFESSIONAL_ROLE', 'ISCO-08|2211'),
    purpose: env('CONSENT_PURPOSE', 'TREAT'),
    pollOptions,
  }));
  debug.record('individual-suite-doctor-consent', { response: doctorConsent });
  assert.equal(doctorConsent.consent.poll.status, 200, 'Individual lifecycle suite must create a consent for the professional actor.');

  const revokedAt = env('REVOKED_CONSENT_PERIOD_END', '2026-06-01T00:00:00Z');
  const revokedMemberConsent = await profiler.run('member-consent-revoke', () => individualControllerSession.asIndividualController().submitAndPoll(
    runtimeClient.individualConsentR4BatchPath(ctx),
    runtimeClient.individualConsentR4PollPath(ctx),
    buildConsentLifecyclePayload({
      consentClaims: buildRevokedConsentClaims(memberConsent.consentClaims, revokedAt),
    }),
    pollOptions,
  ));
  debug.record('individual-suite-member-consent-revoke', { response: revokedMemberConsent });
  assert.equal(revokedMemberConsent.poll.status, 200, 'Individual lifecycle suite must revoke the member consent by closing its period.');

  const revokedDoctorConsent = await profiler.run('doctor-consent-revoke', () => individualControllerSession.asIndividualController().submitAndPoll(
    runtimeClient.individualConsentR4BatchPath(ctx),
    runtimeClient.individualConsentR4PollPath(ctx),
    buildConsentLifecyclePayload({
      consentClaims: buildRevokedConsentClaims(doctorConsent.consentClaims, revokedAt),
    }),
    pollOptions,
  ));
  debug.record('individual-suite-doctor-consent-revoke', { response: revokedDoctorConsent });
  assert.equal(revokedDoctorConsent.poll.status, 200, 'Individual lifecycle suite must revoke the doctor consent by closing its period.');

  const relatedPersonLifecycleClaims = {
    ...cloneExample(EXAMPLE_RELATED_PERSON_DISABLE_INPUT.memberClaims),
    [ClaimsPersonSchemaorg.email]: undefined,
    'RelatedPerson.identifier.value': relatedPersonIdentifier,
    'RelatedPerson.patient': subjectDid,
    'RelatedPerson.telecom': `mailto:${memberEmail}`,
  };
  const disableMember = await profiler.run('member-disable', () => individualControllerSession.asIndividualController().disableIndividualMember(
    ctx,
    {
      memberClaims: relatedPersonLifecycleClaims,
      resourceId: relatedPersonResourceId,
    },
    pollOptions,
  ));
  debug.record('individual-suite-member-disable', { response: disableMember });
  assert.equal(disableMember.poll.status, 200, 'Individual lifecycle suite must disable the related-person/member relationship.');

  const purgeMember = await profiler.run('member-purge', () => individualControllerSession.asIndividualController().purgeIndividualMember(
    ctx,
    {
      memberClaims: relatedPersonLifecycleClaims,
      resourceId: relatedPersonResourceId,
    },
    pollOptions,
  ));
  debug.record('individual-suite-member-purge', { response: purgeMember });
  assert.equal(purgeMember.poll.status, 200, 'Individual lifecycle suite must purge the related-person/member relationship after disable.');

  const tenantLifecycleEditor = new OrganizationLifecycleEditor()
    .setIdentifier(String(cloneExample(EXAMPLE_TENANT_DISABLE_MESSAGE.claims)[ClaimsOrganizationSchemaorg.identifier]))
    .setIdentifierValue(tenantId)
    .setTaxId(tenantId);
  const disableTenantWhileIndividualActive = await profiler.run('tenant-disable-while-individual-active', () => orgControllerSession.asOrganizationController().disableTenant(
    hostCtx,
    {
      organizationEditor: tenantLifecycleEditor,
    },
    pollOptions,
  ));
  debug.record('individual-suite-tenant-disable-while-individual-active', { response: disableTenantWhileIndividualActive });
  {
    const disableEntries = getBatchEntries(disableTenantWhileIndividualActive.poll.body, 'Tenant disable while individual active');
    assert.equal(String(disableEntries[0]?.response?.status || ''), '409', 'Tenant disable must be rejected while active individuals remain.');
  }

  const purgeTenantWhileIndividualExists = await profiler.run('tenant-purge-while-individual-exists', () => orgControllerSession.asOrganizationController().purgeTenant(
    hostCtx,
    {
      organizationEditor: tenantLifecycleEditor,
    },
    pollOptions,
  ));
  debug.record('individual-suite-tenant-purge-while-individual-exists', { response: purgeTenantWhileIndividualExists });
  {
    const purgeEntries = getBatchEntries(purgeTenantWhileIndividualExists.poll.body, 'Tenant purge while individual exists');
    assert.equal(String(purgeEntries[0]?.response?.status || ''), '409', 'Tenant purge must be rejected while individual descendants still exist.');
  }

  const hostLifecycleEditor = new OrganizationLifecycleEditor()
    .setIdentifierValue(suiteHostIdentifierValue);
  const disableHostWhileTenantRegistered = await profiler.run('host-disable-while-tenant-registered', () => hostSession.asHostOnboarding().disableHost(
    hostCtx,
    {
      organizationEditor: hostLifecycleEditor,
    },
    pollOptions,
  ));
  debug.record('individual-suite-host-disable-while-tenant-registered', { response: disableHostWhileTenantRegistered });
  {
    const disableEntries = getBatchEntries(disableHostWhileTenantRegistered.poll.body, 'Host disable while tenant registered');
    assert.equal(String(disableEntries[0]?.response?.status || ''), '409', 'Host disable must be rejected while hosted tenant registrations remain.');
  }

  const purgeHostWhileTenantRegistered = await profiler.run('host-purge-while-tenant-registered', () => hostSession.asHostOnboarding().purgeHost(
    hostCtx,
    {
      organizationEditor: hostLifecycleEditor,
    },
    pollOptions,
  ));
  debug.record('individual-suite-host-purge-while-tenant-registered', { response: purgeHostWhileTenantRegistered });
  {
    const purgeEntries = getBatchEntries(purgeHostWhileTenantRegistered.poll.body, 'Host purge while tenant registered');
    assert.equal(String(purgeEntries[0]?.response?.status || ''), '409', 'Host purge must be rejected while hosted tenant registrations remain.');
  }

  const individualLifecycleEditor = new IndividualOrganizationLifecycleEditor()
    .setIdentifier(subjectDid)
    .setAlternateName(individualAltName)
    .setOwnerEmail(individualControllerEmail);
  const disableIndividual = await profiler.run('individual-disable', () => individualControllerSession.asIndividualController().disableIndividualOrganization(
    ctx,
    {
      organizationEditor: individualLifecycleEditor,
    },
    pollOptions,
  ));
  debug.record('individual-suite-disable', { response: disableIndividual });
  assert.equal(disableIndividual.poll.status, 200, 'Individual lifecycle suite must disable the hosted individual organization for cleanup.');

  const purgeIndividual = await profiler.run('individual-purge', () => individualControllerSession.asIndividualController().purgeIndividualOrganization(
    ctx,
    {
      organizationEditor: individualLifecycleEditor,
    },
    pollOptions,
  ));
  debug.record('individual-suite-purge', { response: purgeIndividual });
  assert.equal(purgeIndividual.poll.status, 200, 'Individual lifecycle suite must purge the hosted individual organization for cleanup.');

  const disableTenant = await profiler.run('tenant-disable', () => orgControllerSession.asOrganizationController().disableTenant(
    hostCtx,
    {
      organizationEditor: tenantLifecycleEditor,
    },
    pollOptions,
  ));
  debug.record('individual-suite-tenant-disable', { response: disableTenant });
  assert.equal(disableTenant.poll.status, 200, 'Individual lifecycle suite must disable the hosted tenant after descendant cleanup.');

  await assert.rejects(
    individualControllerSession.asIndividualController().startIndividualOrganization({
      tenantId: tenantRouteId,
      jurisdiction,
      sector,
      alternateName: `${individualAltName}-after-disable`,
      controllerEmail: `after-disable+${runSlug}@example.com`,
      controllerRole: env('INDIVIDUAL_CONTROLLER_ROLE', 'RESPRSN'),
      additionalClaims: {
        'org.schema.Person.email': `after-disable+${runSlug}@example.com`,
        'org.schema.Person.hasOccupation.identifier.value': env('INDIVIDUAL_CONTROLLER_ROLE', 'RESPRSN'),
        'org.schema.Service.category': sector,
      },
      timeoutSeconds: Math.round(pollOptions.timeoutMs / 1000),
      intervalSeconds: pollOptions.intervalMs / 1000,
    }),
    /offerId|404|403|409/i,
    'Tenant disabled must not allow creating a new hosted individual.',
  );

  const tenantDspaceAfterDisable = await profiler.run('tenant-dspace-after-disable', () => fetchJsonOrText(baseUrl, buildTenantDspaceVersionPath(ctx), bearerToken));
  debug.record('individual-suite-tenant-dspace-after-disable', tenantDspaceAfterDisable);
  assert.equal(tenantDspaceAfterDisable.status, 404, 'Tenant dspace-version must disappear once the tenant is disabled.');

  const tenantCatalogAfterDisable = await profiler.run('tenant-catalog-after-disable', () => fetchJsonOrText(baseUrl, buildTenantCatalogArtifactPath(ctx), bearerToken));
  debug.record('individual-suite-tenant-catalog-after-disable', tenantCatalogAfterDisable);
  assert.equal(tenantCatalogAfterDisable.status, 404, 'Tenant DCAT catalog must disappear once the tenant is disabled.');

  const hostCatalogAfterTenantDisable = await profiler.run('host-catalog-after-tenant-disable', () => fetchJsonOrText(baseUrl, hostCatalogArtifactPath, bearerToken));
  debug.record('individual-suite-host-catalog-after-tenant-disable', hostCatalogAfterTenantDisable);
  assert.equal(hostCatalogAfterTenantDisable.status, 200, 'Host DCAT catalog must remain available while the host itself is still active.');
  assert.ok(
    !catalogIncludesTenantRouteFragment(hostCatalogAfterTenantDisable.body, tenantRouteId, jurisdiction, sector),
    'Host DCAT catalog must stop listing the tenant once the tenant is disabled.',
  );

  const purgeTenant = await profiler.run('tenant-purge', () => orgControllerSession.asOrganizationController().purgeTenant(
    hostCtx,
    {
      organizationEditor: tenantLifecycleEditor,
    },
    pollOptions,
  ));
  debug.record('individual-suite-tenant-purge', { response: purgeTenant });
  assert.equal(purgeTenant.poll.status, 200, 'Individual lifecycle suite must purge the hosted tenant at the end of the lifecycle.');

  if (!runHostTeardown) {
    const hostCatalogAfterTenantPurge = await profiler.run('host-catalog-after-tenant-purge', () => fetchJsonOrText(baseUrl, hostCatalogArtifactPath, bearerToken));
    debug.record('individual-suite-host-catalog-after-tenant-purge', hostCatalogAfterTenantPurge);
    assert.equal(hostCatalogAfterTenantPurge.status, 200, 'Shared host DCAT catalog must remain available when host teardown is intentionally skipped.');
    assert.ok(
      !catalogIncludesTenantRouteFragment(hostCatalogAfterTenantPurge.body, tenantRouteId, jurisdiction, sector),
      'Host DCAT catalog must not keep publishing the purged tenant route after tenant purge.',
    );
    profiler.flush();
    return;
  }

  const disableHost = await profiler.run('host-disable', () => hostSession.asHostOnboarding().disableHost(
    hostCtx,
    {
      organizationEditor: hostLifecycleEditor,
    },
    pollOptions,
  ));
  debug.record('individual-suite-host-disable', { response: disableHost });
  assert.equal(disableHost.poll.status, 200, 'Individual lifecycle suite must disable the host after all hosted tenants are purged.');
  {
    const disableEntries = getBatchEntries(disableHost.poll.body, 'Host disable');
    assert.equal(String(disableEntries[0]?.response?.status || ''), '200', 'Host disable must return an inner response.status of 200 after all hosted tenants are purged.');
  }

  /**
   * Technical host discovery and functional host publication are not the same.
   *
   * Step by step:
   * - `dspace-version` only proves that the host still exposes one DSP root
   * - it does not prove that the host still publishes index/digital-twin/etc
   * - functional publication must be asserted through:
   *   - host DCAT catalog
   *   - backend `/api/dataspace-discovery/providers`
   *
   * Because of that, the suite records `dspace-version` after host disable for
   * diagnostics, but it does not use it as the authoritative pass/fail signal
   * for index-hosting publication.
   */
  const hostDspaceAfterDisable = await profiler.run('host-dspace-after-disable', () => waitForFetchStatus(
    baseUrl,
    hostDiscoveryVersionPath,
    bearerToken,
    503,
  ));
  debug.record('individual-suite-host-dspace-after-disable', hostDspaceAfterDisable);

  const hostCatalogAfterDisable = await profiler.run('host-catalog-after-disable', () => waitForFetchStatus(
    baseUrl,
    hostCatalogArtifactPath,
    bearerToken,
    503,
  ));
  debug.record('individual-suite-host-catalog-after-disable', hostCatalogAfterDisable);
  assert.equal(hostCatalogAfterDisable.status, 503, 'Host DCAT catalog must stop publishing once the host is disabled.');

  const providerDiscoveryAfterHostDisable = await profiler.run('provider-discovery-after-host-disable', () => waitForPostStatus(
    baseUrl,
    '/api/dataspace-discovery/providers',
    {
      sector,
      providerCapability: env('HOST_PROVIDER_CAPABILITY', 'clinical/summary.index.read'),
      jurisdiction,
      coverageScope: suiteHostCoverageScope,
    },
    bearerToken,
    503,
  ));
  debug.record('individual-suite-host-provider-discovery-after-disable', providerDiscoveryAfterHostDisable);
  assert.equal(providerDiscoveryAfterHostDisable.status, 503, 'Published provider discovery must become unavailable once the host is disabled.');

  const purgeHost = await profiler.run('host-purge', () => hostSession.asHostOnboarding().purgeHost(
    hostCtx,
    {
      organizationEditor: hostLifecycleEditor,
    },
    pollOptions,
  ));
  debug.record('individual-suite-host-purge', { response: purgeHost });
  assert.equal(purgeHost.poll.status, 200, 'Individual lifecycle suite must purge the disabled host after discovery publication is stopped.');
  {
    const purgeEntries = getBatchEntries(purgeHost.poll.body, 'Host purge');
    assert.equal(String(purgeEntries[0]?.response?.status || ''), '200', 'Host purge must return an inner response.status of 200 after host discovery publication is stopped.');
  }
  profiler.flush();
}

test('LIVE didcomm-plain communication conversation indexes DocumentReference and MedicationStatement projections', {
  skip: !(RUN
    && RUN_IPS_INGESTION
    && shouldRunLiveGwSuiteProfile(ACTIVE_SUITE_PROFILE, LiveGwSuiteProfiles.Clinical)
    && shouldRunLiveGwTransportProfile(ACTIVE_TRANSPORT_PROFILE, LiveGwTransportProfiles.DidcommPlain)),
}, async () => {
  const debug = createDebugLogger();
  const baseUrl = env('BASE_URL', EXAMPLE_LIVE_GW_BASE_URL_LOCAL);
  const tenantId = suiteTenantRouteId;
  const jurisdiction = suiteJurisdiction;
  const sector = suiteSector;
  const bearerToken = env('AUTH_BEARER');
  const subjectDid = suiteSubjectDid;

  const runtimeClient = createRuntimeClient({
    baseUrl,
    ctx: { tenantId, jurisdiction, sector },
    bearerToken,
  });
  const individualControllerSession = new NodeActorSession(
    { actorKind: ActorKinds.IndividualController, capabilities: [ActorCapabilities.IndividualIngestCommunication] },
    runtimeClient,
  );

  const ipsDocumentBundle = {
    resourceType: 'Bundle',
    type: 'document',
    entry: [
      { resource: { resourceType: 'Composition', status: 'final', type: { coding: [{ system: 'http://loinc.org', code: '60591-5' }] } } },
      { resource: { resourceType: 'Patient', id: 'subject-1' } },
      { resource: { resourceType: 'AllergyIntolerance', clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }] } } },
      { resource: { resourceType: 'MedicationStatement', status: 'active' } },
    ],
  };
  const ipsBundleB64 = Buffer.from(JSON.stringify(ipsDocumentBundle), 'utf8').toString('base64');
  const communicationIngestionPayload = buildExampleCommunicationIngestionPayload({
    subjectDid,
    sent: new Date().toISOString(),
    ipsBundleBase64: ipsBundleB64,
  });

  let ingest = await individualControllerSession.asIndividualController().ingestCommunicationAndUpdateIndex(
    { tenantId, jurisdiction, sector },
    {
      communicationPayload: communicationIngestionPayload,
      pathFormatSegment: 'api',
      pollOptions: createLivePollOptions(),
    },
  );
  if (ingest.poll.status === 404) {
    ingest = await individualControllerSession.asIndividualController().ingestCommunicationAndUpdateIndex(
      { tenantId, jurisdiction, sector },
      {
        communicationPayload: communicationIngestionPayload,
        pathFormatSegment: 'org.hl7.fhir.r4',
        pollOptions: createLivePollOptions(),
      },
    );
  }
  debug.record('communication-ingest', { response: ingest });
  assert.equal(ingest.poll.status, 200, 'Communication ingestion through facade must complete.');
  {
    const first = getBatchEntries(ingest.poll.body, 'Communication ingestion')[0] || {};
    const status = Number(first?.response?.status || 0);
    assert.ok(status === 200 || status === 201, 'Communication ingestion first entry response.status must be 200/201.');
  }

  const search = await individualControllerSession.asIndividualController().submitAndPoll(
    runtimeClient.v1Path({ tenantId, jurisdiction, sector }, 'individual', 'org.hl7.fhir.r4', 'Bundle', '_search'),
    runtimeClient.v1Path({ tenantId, jurisdiction, sector }, 'individual', 'org.hl7.fhir.r4', 'Bundle', '_search-response'),
    {
      ...buildExampleDocumentReferenceSearchPayload(subjectDid),
      thid: `search-documentreference-${Date.now()}`,
    },
    createLivePollOptions(),
  );
  debug.record('documentreference-search', { response: search });
  assert.equal(search.poll.status, 200, 'DocumentReference search through facade submitAndPoll must return 200.');
  {
    const rows = getSearchRows(search.poll.body, 'DocumentReference search after communication ingestion');
    const match = rows.find((row) => {
      const subject = extractFlatClaimValue(row, 'DocumentReference.subject');
      const cid = extractFlatClaimValue(row, 'DocumentReference.contenthash');
      return subject === subjectDid && cid.startsWith('z');
    });
    assert.ok(match, 'DocumentReference search after communication ingestion must include one row with matching subject and CID contenthash.');
  }
  const professionalDid = env('PROFESSIONAL_DID', EXAMPLE_API_ORGANIZATION_DID);
  const routeCtx = { tenantId, jurisdiction, sector };

  const cases = buildExampleLiveMedicationCases(Date.now());

  for (const medication of cases) {
    const medicationClaims = {
      '@context': 'org.hl7.fhir.api',
      [MedicationStatementClaim.Identifier]: medication.identifier,
      [MedicationStatementClaim.Subject]: subjectDid,
      [MedicationStatementClaim.Status]: 'active',
      [MedicationStatementClaim.MedicationText]: medication.text,
      [MedicationStatementClaim.Effective]: medication.effectiveDateTime,
      [MedicationStatementClaim.Note]: medication.note,
      [MedicationStatementClaim.Category]: medication.section,
      [MedicationStatementClaimsFhirApiExtended.DoseQuantityValue]: medication.doseQuantityValue,
      [MedicationStatementClaimsFhirApiExtended.DoseQuantityUnit]: medication.doseQuantityUnit,
      [MedicationStatementClaimsFhirApiExtended.TimingFrequency]: medication.timingFrequency,
      [MedicationStatementClaimsFhirApiExtended.TimingPeriod]: medication.timingPeriod,
      [MedicationStatementClaimsFhirApiExtended.TimingPeriodUnit]: medication.timingPeriodUnit,
      [MedicationStatementClaimsFhirApiExtended.DosageAsNeeded]: medication.dosageAsNeeded,
    };
    const bundle = buildBundleDocumentFromClaims({
      subjectDid,
      claimsList: [medicationClaims],
    });
    const communicationPayload = buildExampleCommunicationIngestionPayload({
      subjectDid,
      sent: medication.effectiveDateTime,
      ipsBundleBase64: Buffer.from(JSON.stringify(bundle), 'utf8').toString('base64'),
    });

    let ingest = await individualControllerSession.asIndividualController().ingestCommunicationAndUpdateIndex(
      routeCtx,
      {
        communicationPayload,
        pathFormatSegment: 'api',
        pollOptions: createLivePollOptions(),
      },
    );
    if (ingest.poll.status === 404) {
      ingest = await individualControllerSession.asIndividualController().ingestCommunicationAndUpdateIndex(
        routeCtx,
        {
          communicationPayload,
          pathFormatSegment: 'org.hl7.fhir.r4',
          pollOptions: createLivePollOptions(),
        },
      );
    }
    debug.record('communication-ingest-medication', {
      medicationIdentifier: medication.identifier,
      response: ingest,
    });
    assert.equal(ingest.poll.status, 200, `Communication ingestion for ${medication.identifier} must complete.`);
    {
      const first = getBatchEntries(ingest.poll.body, `Communication ingestion for ${medication.identifier}`)[0] || {};
      const status = Number(first?.response?.status || 0);
      assert.ok(status === 200 || status === 201, `Communication ingestion for ${medication.identifier} first entry response.status must be 200/201.`);
    }
  }

  const ipsSearchCommunicationPayload = createIpsSummarySearchDidcommMessage({
    subjectId: subjectDid,
    requesterId: professionalDid,
    thid: `ips-search-${Date.now()}`,
    sent: new Date().toISOString(),
  });
  const ipsSearch = await individualControllerSession.asIndividualController().ingestCommunicationAndUpdateIndex(
    routeCtx,
    {
      communicationPayload: ipsSearchCommunicationPayload,
      pathFormatSegment: 'org.hl7.fhir.r4',
      pollOptions: createLivePollOptions(),
    },
  );
  debug.record('ips-communication-search', {
    payload: ipsSearchCommunicationPayload,
    response: ipsSearch,
  });
  assert.equal(ipsSearch.poll.status, 200, 'IPS communication search must return 200.');
  // Important architecture note:
  // this request does not call Bundle/_search directly from the test.
  // The test sends a Communication whose content-reference asks for
  // `individual/.../Bundle/_search?...`. GW stores the Communication,
  // then resolves that embedded request internally and returns the
  // consolidated Bundle document in the Communication batch response.
  const ipsSearchEntries = getBatchEntries(
    ipsSearch.poll.body,
    'IPS communication search after communication ingestion',
  );
  const ipsBundle = ipsSearchEntries[0]?.resource;
  assert.equal(ipsBundle?.resourceType, 'Bundle', 'IPS communication search must return a FHIR Bundle resource.');
  assert.equal(ipsBundle?.type, 'document', 'IPS communication search must return a Bundle document.');
  assert.equal(
    ipsBundle?.entry?.[0]?.resource?.resourceType,
    'Composition',
    'IPS communication search must return a Bundle document whose first entry is Composition.',
  );
  const medicationIds = getBundleDocumentResourceIds(ipsBundle, {
    section: HealthcareBasicSections.HistoryOfMedicationUse.attributeValue,
    resourceType: 'MedicationStatement',
  });
  assert.ok(
    medicationIds.length >= cases.length,
    'IPS communication search must expose at least the ingested MedicationStatement ids in the medication section.',
  );
  for (const medication of cases) {
    assert.ok(
      medicationIds.includes(medication.identifier),
      `IPS communication search must include MedicationStatement id ${medication.identifier} in the medication section.`,
    );
    const resources = getBundleDocumentResources(ipsBundle, {
      section: HealthcareBasicSections.HistoryOfMedicationUse.attributeValue,
      resourceType: 'MedicationStatement',
    });
    const match = resources.find((resource) =>
      extractFlatClaimValue(resource, MedicationStatementClaim.Identifier) === medication.identifier
      && extractFlatClaimValue(resource, MedicationStatementClaim.MedicationText) === medication.text
      && extractFlatClaimValue(resource, MedicationStatementClaim.Note) === medication.note,
    );
    assert.ok(match, `IPS communication search must include consolidated MedicationStatement ${medication.identifier} in the medication section.`);
  }
});

test('LIVE legacy-fhir communication conversation indexes DocumentReference and MedicationStatement projections', {
  skip: !(RUN
    && RUN_IPS_INGESTION
    && shouldRunLiveGwSuiteProfile(ACTIVE_SUITE_PROFILE, LiveGwSuiteProfiles.Clinical)
    && shouldRunLiveGwTransportProfile(ACTIVE_TRANSPORT_PROFILE, LiveGwTransportProfiles.LegacyFhir)),
}, async () => {
  const debug = createDebugLogger();
  const baseUrl = env('BASE_URL', EXAMPLE_LIVE_GW_BASE_URL_LOCAL);
  const tenantId = suiteTenantRouteId;
  const jurisdiction = suiteJurisdiction;
  const sector = suiteSector;
  const bearerToken = env('AUTH_BEARER');
  const subjectDid = suiteSubjectDid;
  const routeCtx = { tenantId, jurisdiction, sector };

  const runtimeClient = createRuntimeClient({
    baseUrl,
    ctx: routeCtx,
    bearerToken,
  });
  const individualControllerSession = new NodeActorSession(
    { actorKind: ActorKinds.IndividualController, capabilities: [ActorCapabilities.IndividualIngestCommunication] },
    runtimeClient,
  );

  const ipsDocumentBundle = {
    resourceType: 'Bundle',
    type: 'document',
    entry: [
      { resource: { resourceType: 'Composition', status: 'final', type: { coding: [{ system: 'http://loinc.org', code: '60591-5' }] } } },
      { resource: { resourceType: 'Patient', id: 'subject-1' } },
      { resource: { resourceType: 'AllergyIntolerance', clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }] } } },
      { resource: { resourceType: 'MedicationStatement', status: 'active' } },
    ],
  };
  const ipsBundleB64 = Buffer.from(JSON.stringify(ipsDocumentBundle), 'utf8').toString('base64');
  const communicationPayload = {
    ...buildExampleCommunicationIngestionPayload({
      subjectDid,
      sent: new Date().toISOString(),
      ipsBundleBase64: ipsBundleB64,
    }),
    thid: `legacy-fhir-communication-${Date.now()}`,
  };
  const submitPath = buildLegacyFhirCommunicationBatchPath(routeCtx);
  const pollPath = buildLegacyFhirCommunicationPollPath(routeCtx);
  const batchBundle = buildLegacyFhirCommunicationBatchBundle({ communicationPayload });

  const ingest = await submitLegacyFhirBatchAndPoll({
    baseUrl,
    submitPath,
    pollPath,
    bearerToken,
    bundlePayload: batchBundle,
    thid: communicationPayload.thid,
    pollOptions: createLivePollOptions(),
  });
  debug.record('legacy-fhir-communication-ingest', { transportProfile: LiveGwTransportProfiles.LegacyFhir, response: ingest });
  assert.equal(ingest.poll.status, 200, 'Legacy FHIR communication ingestion must complete.');
  {
    const first = getBatchEntries(ingest.poll.body, 'Legacy FHIR communication ingestion')[0] || {};
    const status = Number(first?.response?.status || 0);
    assert.ok(status === 200 || status === 201, 'Legacy FHIR communication ingestion first entry response.status must be 200/201.');
  }

  const search = await individualControllerSession.asIndividualController().submitAndPoll(
    runtimeClient.v1Path(routeCtx, 'individual', 'org.hl7.fhir.r4', 'Bundle', '_search'),
    runtimeClient.v1Path(routeCtx, 'individual', 'org.hl7.fhir.r4', 'Bundle', '_search-response'),
    {
      ...buildExampleDocumentReferenceSearchPayload(subjectDid),
      thid: `legacy-fhir-search-documentreference-${Date.now()}`,
    },
    createLivePollOptions(),
  );
  debug.record('legacy-fhir-documentreference-search', { response: search });
  assert.equal(search.poll.status, 200, 'Legacy FHIR DocumentReference search must return 200.');
  {
    const rows = getSearchRows(search.poll.body, 'Legacy FHIR DocumentReference search after communication ingestion');
    const match = rows.find((row) => {
      const subject = extractFlatClaimValue(row, 'DocumentReference.subject');
      const cid = extractFlatClaimValue(row, 'DocumentReference.contenthash');
      return subject === subjectDid && cid.startsWith('z');
    });
    assert.ok(match, 'Legacy FHIR DocumentReference search must include one row with matching subject and CID contenthash.');
  }
  const professionalDid = env('PROFESSIONAL_DID', EXAMPLE_API_ORGANIZATION_DID);
  const cases = buildExampleLiveMedicationCases(Date.now());

  for (const medication of cases) {
    const medicationClaims = {
      '@context': 'org.hl7.fhir.api',
      [MedicationStatementClaim.Identifier]: medication.identifier,
      [MedicationStatementClaim.Subject]: subjectDid,
      [MedicationStatementClaim.Status]: 'active',
      [MedicationStatementClaim.MedicationText]: medication.text,
      [MedicationStatementClaim.Effective]: medication.effectiveDateTime,
      [MedicationStatementClaim.Note]: medication.note,
      [MedicationStatementClaim.Category]: medication.section,
      [MedicationStatementClaimsFhirApiExtended.DoseQuantityValue]: medication.doseQuantityValue,
      [MedicationStatementClaimsFhirApiExtended.DoseQuantityUnit]: medication.doseQuantityUnit,
      [MedicationStatementClaimsFhirApiExtended.TimingFrequency]: medication.timingFrequency,
      [MedicationStatementClaimsFhirApiExtended.TimingPeriod]: medication.timingPeriod,
      [MedicationStatementClaimsFhirApiExtended.TimingPeriodUnit]: medication.timingPeriodUnit,
      [MedicationStatementClaimsFhirApiExtended.DosageAsNeeded]: medication.dosageAsNeeded,
    };
    const bundle = buildBundleDocumentFromClaims({
      subjectDid,
      claimsList: [medicationClaims],
    });
    const communicationPayload = {
      ...buildExampleCommunicationIngestionPayload({
        subjectDid,
        sent: medication.effectiveDateTime,
        ipsBundleBase64: Buffer.from(JSON.stringify(bundle), 'utf8').toString('base64'),
      }),
      thid: `legacy-fhir-medication-${medication.identifier}`,
    };
    const batchBundle = buildLegacyFhirCommunicationBatchBundle({ communicationPayload });

    const ingest = await submitLegacyFhirBatchAndPoll({
      baseUrl,
      submitPath,
      pollPath,
      bearerToken,
      bundlePayload: batchBundle,
      thid: communicationPayload.thid,
      pollOptions: createLivePollOptions(),
    });
    debug.record('legacy-fhir-communication-ingest-medication', {
      medicationIdentifier: medication.identifier,
      response: ingest,
    });
    assert.equal(ingest.poll.status, 200, `Legacy FHIR communication ingestion for ${medication.identifier} must complete.`);
    {
      const first = getBatchEntries(ingest.poll.body, `Legacy FHIR communication ingestion for ${medication.identifier}`)[0] || {};
      const status = Number(first?.response?.status || 0);
      assert.ok(status === 200 || status === 201, `Legacy FHIR communication ingestion for ${medication.identifier} first entry response.status must be 200/201.`);
    }
  }

  const ipsSearchCommunicationPayload = createIpsSummarySearchDidcommMessage({
    subjectId: subjectDid,
    requesterId: professionalDid,
    thid: `legacy-fhir-ips-search-${Date.now()}`,
    sent: new Date().toISOString(),
  });
  const ipsSearch = await individualControllerSession.asIndividualController().ingestCommunicationAndUpdateIndex(
    routeCtx,
    {
      communicationPayload: ipsSearchCommunicationPayload,
      pathFormatSegment: 'org.hl7.fhir.r4',
      pollOptions: createLivePollOptions(),
    },
  );
  debug.record('legacy-fhir-ips-communication-search', {
    payload: ipsSearchCommunicationPayload,
    response: ipsSearch,
  });
  assert.equal(ipsSearch.poll.status, 200, 'Legacy FHIR IPS communication search must return 200.');

  const ipsSearchEntries = getBatchEntries(
    ipsSearch.poll.body,
    'Legacy FHIR IPS communication search after communication ingestion',
  );
  const ipsBundle = ipsSearchEntries[0]?.resource;
  assert.equal(ipsBundle?.resourceType, 'Bundle', 'Legacy FHIR IPS communication search must return a FHIR Bundle resource.');
  assert.equal(ipsBundle?.type, 'document', 'Legacy FHIR IPS communication search must return a Bundle document.');
  assert.equal(
    ipsBundle?.entry?.[0]?.resource?.resourceType,
    'Composition',
    'Legacy FHIR IPS communication search must return a Bundle document whose first entry is Composition.',
  );

  const medicationIds = getBundleDocumentResourceIds(ipsBundle, {
    section: HealthcareBasicSections.HistoryOfMedicationUse.attributeValue,
    resourceType: 'MedicationStatement',
  });
  assert.ok(
    medicationIds.length >= cases.length,
    'Legacy FHIR IPS communication search must expose at least the ingested MedicationStatement ids in the medication section.',
  );
  for (const medication of cases) {
    assert.ok(
      medicationIds.includes(medication.identifier),
      `Legacy FHIR IPS communication search must include MedicationStatement id ${medication.identifier} in the medication section.`,
    );
    const resources = getBundleDocumentResources(ipsBundle, {
      section: HealthcareBasicSections.HistoryOfMedicationUse.attributeValue,
      resourceType: 'MedicationStatement',
    });
    const match = resources.find((resource) =>
      extractFlatClaimValue(resource, MedicationStatementClaim.Identifier) === medication.identifier
      && extractFlatClaimValue(resource, MedicationStatementClaim.MedicationText) === medication.text
      && extractFlatClaimValue(resource, MedicationStatementClaim.Note) === medication.note,
    );
    assert.ok(match, `Legacy FHIR IPS communication search must include consolidated MedicationStatement ${medication.identifier} in the medication section.`);
  }
});

async function runLiveProfileRuntimeIndividualSuite() {
  const debug = createDebugLogger();
  const baseUrl = env('BASE_URL', EXAMPLE_LIVE_GW_BASE_URL_LOCAL);
  const vpTokenEnv = env('VP_TOKEN');
  const vpTokenFile = env(
    'VP_TOKEN_FILE',
    path.join(__dirname, 'fixtures', 'ica-vp-minimal.json'),
  );
  const tenantId = `${suiteTenantId}-profile`;
  const tenantRouteId = `${suiteTenantRouteId}-profile`;
  const jurisdiction = suiteJurisdiction;
  const sector = suiteSector;
  const hostNetworkOrTenantSector = resolveLiveHostNetworkOrTenantSector();
  const controllerEmail = env('CONTROLLER_EMAIL', `controller+${runSlug}@example.com`);
  const controllerRole = env('CONTROLLER_ROLE', 'RESPRSN');
  const serviceIdentifierDid = env('SERVICE_IDENTIFIER_DID', 'did:web:provider.example.org');
  const serviceUrl = env('SERVICE_URL', 'https://provider.example.org');
  const bearerToken = env('AUTH_BEARER', 'dummy');
  const ctx = { tenantId: tenantRouteId, jurisdiction, sector };
  const hostCtx = { jurisdiction: suiteHostRouteJurisdiction, hostNetworkOrTenantSector };
  const pollOptions = createLivePollOptions();
  const profiler = createStepProfiler(debug, 'profile-runtime-suite');
  const vpPayload = loadVpPayloadFixture(vpTokenFile);
  const vpToken = vpTokenEnv || buildUnsignedVpJwt(vpPayload);
  const runtimeClient = createRuntimeClient({ baseUrl, ctx, bearerToken, requestTimeoutMs: LOCAL_LIVE_REQUEST_TIMEOUT_MS });
  const hostSession = new NodeActorSession(
    {
      actorKind: ActorKinds.HostOnboarding,
      capabilities: [
        ActorCapabilities.HostingActivateOrganization,
        ActorCapabilities.HostingConfirmOrder,
        ActorCapabilities.HostingDisableHost,
        ActorCapabilities.HostingPurgeHost,
      ],
    },
    runtimeClient,
  );
  const orgControllerSession = new NodeActorSession(
    {
      actorKind: ActorKinds.OrganizationController,
      capabilities: [
        ActorCapabilities.OrganizationDisableTenant,
        ActorCapabilities.OrganizationPurgeTenant,
      ],
    },
    runtimeClient,
  );
  const individualControllerSession = new NodeActorSession(
    {
      actorKind: ActorKinds.IndividualController,
      capabilities: [
        ActorCapabilities.IndividualDisable,
        ActorCapabilities.IndividualPurge,
      ],
    },
    runtimeClient,
  );
  const profileRuntime = new DirectBackendProfileRuntime({
    facadeClient: runtimeClient,
    defaultRouteContext: ctx,
    subjectIndexReadMode: BackendSubjectIndexReadModes.LatestIps,
  });
  const individualRuntime = new IndividualControllerBackendRuntime(profileRuntime);

  await maybeSubmitHostVerificationTransaction({
    profiler,
    debug,
    orgControllerSession,
    hostCtx,
    pollOptions,
    tenantId,
    tenantRouteId,
    jurisdiction,
    sector,
    controllerEmail,
    controllerRole,
    serviceIdentifierDid,
    serviceUrl,
    stage: 'profile-runtime-suite-legal-verification-transaction',
  });

  await maybeActivateOrganizationFromLegacyIcaProof({
    profiler,
    debug,
    hostSession,
    hostCtx,
    pollOptions,
    vpToken,
    tenantId,
    tenantRouteId,
    jurisdiction,
    sector,
    controllerEmail,
    controllerRole,
    serviceIdentifierDid,
    serviceUrl,
    stage: 'activate-organization',
  });

  const individualAltName = env(
    'INDIVIDUAL_ALTERNATE_NAME',
    `${runSlug}-${EXAMPLE_REGISTERED_SUBJECT_ALTERNATE_NAME}`,
  );
  const individualControllerEmail = env(
    'INDIVIDUAL_CONTROLLER_EMAIL',
    `controller+${runSlug}@example.com`,
  );
  const individualControllerRole = env('INDIVIDUAL_CONTROLLER_ROLE', 'RESPRSN');
  const subjectDid = suiteSubjectDid;
  const profileDid = env('INDIVIDUAL_CONTROLLER_PROFILE_DID', EXAMPLE_PROFILE_PROVIDER_DID);
  const loadRequest = prepareLoadProfile({
    actorKind: ActorKinds.IndividualController,
    providerDid: EXAMPLE_PROFILE_PROVIDER_DID,
    runtimeClass: EXAMPLE_PROFILE_RUNTIME_CLASS_SERVER,
    keyAccessMode: EXAMPLE_PROFILE_KEY_ACCESS_MODE_SERVER,
    actorRole: individualControllerRole,
    profileId: individualControllerEmail,
    profileDid,
    subjectDid,
    email: individualControllerEmail,
    appType: EXAMPLE_PROFILE_APP_TYPE_FAMILY,
    localPinPassword: EXAMPLE_PROFILE_LOCAL_PIN_PASSWORD_BACKEND,
  });
  const profile = await profiler.run('load-profile', () => individualRuntime.loadProfile(loadRequest));
  debug.record('profile-runtime-suite-load-profile', {
    descriptor: profile.profile.descriptor,
    actorKind: profile.session.actorKind,
  });
  assert.equal(profile.session.actorKind, ActorKinds.IndividualController, 'Profile runtime suite must materialize one individual-controller facade from loadProfile(...).');

  const individualStart = await profiler.run('individual-start', () => individualRuntime.startIndividualOrganization(
    profile,
    {
      tenantId: tenantRouteId,
      jurisdiction,
      sector,
      alternateName: individualAltName,
      controllerEmail: individualControllerEmail,
      controllerRole: individualControllerRole,
      additionalClaims: {
        'org.schema.Person.email': individualControllerEmail,
        'org.schema.Person.hasOccupation.identifier.value': individualControllerRole,
        'org.schema.Service.category': sector,
      },
      timeoutSeconds: Math.round(pollOptions.timeoutMs / 1000),
      intervalSeconds: pollOptions.intervalMs / 1000,
    },
  ));
  debug.record('profile-runtime-suite-start', { response: individualStart });
  assert.equal(individualStart.registration.poll.status, 200, 'Profile runtime suite must start the hosted individual registration through the loaded profile facade.');

  const individualOrder = await profiler.run('individual-order', () => individualRuntime.confirmIndividualOrganizationOrder(
    profile,
    {
      tenantId: tenantRouteId,
      jurisdiction,
      sector,
      offerId: individualStart.offerId,
      timeoutSeconds: Math.round(pollOptions.timeoutMs / 1000),
      intervalSeconds: pollOptions.intervalMs / 1000,
    },
  ));
  debug.record('profile-runtime-suite-order', { response: individualOrder });
  assert.equal(individualOrder.poll.status, 200, 'Profile runtime suite must confirm the hosted individual order through the loaded profile facade.');

  const medication = buildExampleLiveMedicationCases(Date.now())[0];
  const medicationIpsBundle = buildExampleMedicationIpsDocumentBundle({
    subjectDid,
    medication,
  });
  const ingestionPayload = buildExampleCommunicationIngestionPayload({
    subjectDid,
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
  debug.record('profile-runtime-suite-ingest', { response: ingestion });
  assert.equal(ingestion.poll.status, 200, 'Profile runtime suite must ingest one IPS payload before asserting the current index read helper.');

  const connection = await profiler.run('connect-subject-index', () => connectBackendToSubjectIndex(
    profileRuntime,
    prepareConnectToSubjectIndex({
      subjectId: subjectDid,
      userId: profileDid,
      userRoleCode: individualControllerRole,
      secretKind: EXAMPLE_PROFILE_CONNECTION_SECRET_KIND_PIN_PASSWORD,
      connectionPinPassword: EXAMPLE_PROFILE_CONNECTION_PIN_PASSWORD,
    }),
  ));
  debug.record('profile-runtime-suite-connect', { response: connection });
  assert.ok(
    connection.status === 'connected' || connection.status === 'already-connected',
    'Profile runtime suite must connect the loaded profile to the subject index or detect an already-connected relation.',
  );

  const composition = await profiler.run('read-subject-index', () => getBackendSubjectIndexComposition(
    profileRuntime,
    prepareGetSubjectIndexComposition({
      subjectId: subjectDid,
      userId: profileDid,
      userRoleCode: individualControllerRole,
    }),
  ));
  debug.record('profile-runtime-suite-composition', { response: composition });
  assert.ok(
    composition.composition,
    'Profile runtime suite must return one current GW CORE index payload through the profile-runtime read helper.',
  );

  const profileIndividualLifecycleEditor = new IndividualOrganizationLifecycleEditor()
    .setIdentifier(subjectDid)
    .setAlternateName(individualAltName)
    .setOwnerEmail(individualControllerEmail);
  const profileIndividualDisable = await profiler.run('profile-individual-disable', () => individualControllerSession.asIndividualController().disableIndividualOrganization(
    ctx,
    {
      organizationEditor: profileIndividualLifecycleEditor,
    },
    pollOptions,
  ));
  debug.record('profile-runtime-suite-disable', { response: profileIndividualDisable });
  assert.equal(profileIndividualDisable.poll.status, 200, 'Profile runtime suite must disable the hosted individual organization during cleanup.');

  const profileIndividualPurge = await profiler.run('profile-individual-purge', () => individualControllerSession.asIndividualController().purgeIndividualOrganization(
    ctx,
    {
      organizationEditor: profileIndividualLifecycleEditor,
    },
    pollOptions,
  ));
  debug.record('profile-runtime-suite-purge', { response: profileIndividualPurge });
  assert.equal(profileIndividualPurge.poll.status, 200, 'Profile runtime suite must purge the hosted individual organization during cleanup.');

  const profileTenantLifecycleEditor = new OrganizationLifecycleEditor()
    .setIdentifier(String(cloneExample(EXAMPLE_TENANT_DISABLE_MESSAGE.claims)[ClaimsOrganizationSchemaorg.identifier]))
    .setIdentifierValue(tenantId)
    .setTaxId(tenantId);
  const profileTenantDisable = await profiler.run('profile-tenant-disable', () => orgControllerSession.asOrganizationController().disableTenant(
    hostCtx,
    {
      organizationEditor: profileTenantLifecycleEditor,
    },
    pollOptions,
  ));
  debug.record('profile-runtime-suite-tenant-disable', { response: profileTenantDisable });
  assert.equal(profileTenantDisable.poll.status, 200, 'Profile runtime suite must disable the hosted tenant during cleanup.');

  const profileTenantPurge = await profiler.run('profile-tenant-purge', () => orgControllerSession.asOrganizationController().purgeTenant(
    hostCtx,
    {
      organizationEditor: profileTenantLifecycleEditor,
    },
    pollOptions,
  ));
  debug.record('profile-runtime-suite-tenant-purge', { response: profileTenantPurge });
  assert.equal(profileTenantPurge.poll.status, 200, 'Profile runtime suite must purge the hosted tenant during cleanup.');

  profiler.flush();
}

test('LIVE backend profile runtime individual-controller flow on GW', {
  skip: !(RUN
    && RUN_PROFILE_RUNTIME
    && shouldRunLiveGwSuiteProfile(ACTIVE_SUITE_PROFILE, LiveGwSuiteProfiles.Individual)),
}, async () => {
  await runLiveProfileRuntimeIndividualSuite();
});

test('LIVE individual lifecycle on GW', {
  skip: !(RUN && shouldRunLiveGwSuiteProfile(ACTIVE_SUITE_PROFILE, LiveGwSuiteProfiles.Individual)),
}, async () => {
  await runLiveIndividualLifecycleSuite();
});

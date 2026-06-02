import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CommunicationCategoryCodes, HealthcareBasicSections } from 'gdc-common-utils-ts/constants';
import {
  MedicationStatementClaim,
  MedicationStatementClaimsFhirApiExtended,
} from 'gdc-common-utils-ts/models/interoperable-claims/medication-statement-claims';
import {
  EXAMPLE_ACTIVATE_ORGANIZATION_FROM_ICA_PROOF_INPUT,
  EXAMPLE_API_ORGANIZATION_DID,
  EXAMPLE_JURISDICTION,
  EXAMPLE_LIVE_GW_BASE_URL_LOCAL,
  EXAMPLE_LIVE_CONSENT_GRANT_INPUT,
  EXAMPLE_LIVE_EMPLOYEE_INPUT,
  EXAMPLE_SECTOR,
  EXAMPLE_SUBJECT_DID,
  EXAMPLE_TENANT_IDENTIFIER,
  buildExampleLiveMedicationCases,
  EXAMPLE_SMART_PRESENTATION_SUBMISSION,
  buildExampleCommunicationIngestionPayload,
  buildExampleDocumentReferenceSearchPayload,
  cloneExample,
} from 'gdc-common-utils-ts/examples';

import { ActorCapabilities, ActorKinds, NodeActorSession, NodeHttpClient } from '../dist/index.js';
import {
  buildUnsignedJwt,
  buildUnsignedVpJwt,
  loadVpPayloadFixture,
} from './helpers/vp-token-fixture.mjs';

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim();
}

const RUN = env('RUN_LIVE_GW_E2E', '0') === '1';
const RUN_IPS_INGESTION = env('RUN_LIVE_GW_E2E_IPS_INGESTION', '0') === '1';
const DEBUG = env('LIVE_GW_NODE_E2E_DEBUG', env('LIVE_GW_E2E_DEBUG', '0')) === '1';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const suiteTenantId = env('TENANT_ID', EXAMPLE_TENANT_IDENTIFIER);
const suiteTenantRouteId = env('TENANT_ROUTE_ID', suiteTenantId);
const suiteJurisdiction = env('JURISDICTION', EXAMPLE_JURISDICTION);
const suiteSector = env('SECTOR', EXAMPLE_SECTOR);
const suiteSubjectDid = env('SUBJECT_DID', EXAMPLE_SUBJECT_DID);
const suiteConsentSection = env(
  'SMART_SCOPE_SECTION',
  String(EXAMPLE_LIVE_CONSENT_GRANT_INPUT.actions?.[0] || HealthcareBasicSections.PatientSummaryDocument.attributeValue),
);

function ensureTraceFiles() {
  const debugFile = env(
    'LIVE_GW_NODE_E2E_DEBUG_FILE',
    path.join(__dirname, '..', 'test-results', `live-gw-node-runtime-debug-${runId}.jsonl`),
  );
  const httpTraceFile = env(
    'SDK_HTTP_TRACE_FILE',
    path.join(__dirname, '..', 'test-results', `live-gw-http-trace-${runId}.jsonl`),
  );
  fs.mkdirSync(path.dirname(debugFile), { recursive: true });
  if (!process.env.SDK_HTTP_TRACE_FILE) {
    process.env.SDK_HTTP_TRACE_FILE = httpTraceFile;
  }
  return { debugFile, httpTraceFile };
}

function redactForDebug(value) {
  return JSON.parse(JSON.stringify(value, (key, nestedValue) => {
    if (/token|authorization|secret|password/i.test(String(key || ''))) {
      return '[redacted]';
    }
    return nestedValue;
  }));
}

function createDebugLogger() {
  const { debugFile } = ensureTraceFiles();
  if (!DEBUG) {
    return { filePath: debugFile, record: () => {} };
  }
  fs.writeFileSync(debugFile, '');
  return {
    filePath: debugFile,
    record(stage, data) {
      fs.appendFileSync(
        debugFile,
        `${JSON.stringify({
          ts: new Date().toISOString(),
          stage,
          ...redactForDebug(data),
        })}\n`,
      );
    },
  };
}

function assertBundleHasEntries(pollBody, label) {
  const entries = pollBody?.body?.data || pollBody?.data || [];
  assert.ok(Array.isArray(entries), `${label} must return a bundle-like data array.`);
  assert.ok(entries.length > 0, `${label} must return at least one entry in data[].`);
  return entries;
}

function assertCommunicationAckShape(pollBody, label) {
  const entries = assertBundleHasEntries(pollBody, label);
  const first = entries[0] || {};
  const status = Number(first?.response?.status || 0);
  assert.ok(status === 200 || status === 201, `${label} first entry response.status must be 200/201.`);
  return first;
}

function assertSearchResponseHasMatches(pollBody, label) {
  const entries = assertBundleHasEntries(pollBody, label);
  const first = entries[0] || {};
  const resourceData = first?.resource?.data;
  assert.ok(Array.isArray(resourceData), `${label} first entry must expose resource.data array.`);
  assert.ok(resourceData.length > 0, `${label} must return at least one matched resource.`);
  return resourceData;
}

function extractClaim(record, key) {
  if (!record || typeof record !== 'object') return '';
  const direct = record[key];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const nested = record?.meta?.claims?.[key];
  if (typeof nested === 'string' && nested.trim()) return nested.trim();
  return '';
}

function assertDocumentReferenceSearchHasCid(pollBody, label, expectedSubject) {
  const resourceData = assertSearchResponseHasMatches(pollBody, label);
  const match = resourceData.find((row) => {
    const subject = extractClaim(row, 'DocumentReference.subject');
    const cid = extractClaim(row, 'DocumentReference.contenthash');
    return subject === expectedSubject && cid.startsWith('z');
  });
  assert.ok(match, `${label} must include at least one DocumentReference row with subject=${expectedSubject} and CID contenthash.`);
  return match;
}

function assertMedicationSearchHasMatch(pollBody, label, expected) {
  const resourceData = assertSearchResponseHasMatches(pollBody, label);
  const match = resourceData.find((row) =>
    extractClaim(row, MedicationStatementClaim.Identifier) === expected.identifier
    && extractClaim(row, MedicationStatementClaim.MedicationText) === expected.text
    && extractClaim(row, MedicationStatementClaim.Note) === expected.note
    && String(row?.[MedicationStatementClaimsFhirApiExtended.DoseQuantityValue] ?? row?.meta?.claims?.[MedicationStatementClaimsFhirApiExtended.DoseQuantityValue] ?? '') === String(expected.doseQuantityValue)
    && extractClaim(row, MedicationStatementClaimsFhirApiExtended.DoseQuantityUnit) === expected.doseQuantityUnit
    && String(row?.[MedicationStatementClaimsFhirApiExtended.TimingFrequency] ?? row?.meta?.claims?.[MedicationStatementClaimsFhirApiExtended.TimingFrequency] ?? '') === String(expected.timingFrequency)
    && String(row?.[MedicationStatementClaimsFhirApiExtended.TimingPeriod] ?? row?.meta?.claims?.[MedicationStatementClaimsFhirApiExtended.TimingPeriod] ?? '') === String(expected.timingPeriod)
    && extractClaim(row, MedicationStatementClaimsFhirApiExtended.TimingPeriodUnit) === expected.timingPeriodUnit
    && String(row?.[MedicationStatementClaimsFhirApiExtended.DosageAsNeeded] ?? row?.meta?.claims?.[MedicationStatementClaimsFhirApiExtended.DosageAsNeeded] ?? '') === String(expected.dosageAsNeeded)
  );
  assert.ok(match, `${label} must include MedicationStatement ${expected.identifier}.`);
  return match;
}

function assertIpsBundleHasMedication(pollBody, label, expected) {
  const entries = assertBundleHasEntries(pollBody, label);
  const first = entries[0] || {};
  const bundle = first?.resource;
  assert.equal(bundle?.resourceType, 'Bundle', `${label} must return a FHIR Bundle resource.`);
  assert.equal(bundle?.type, 'document', `${label} must return a Bundle document.`);
  const bundleEntries = Array.isArray(bundle?.entry) ? bundle.entry : [];
  assert.ok(bundleEntries.length > 0, `${label} must contain bundle entries.`);
  assert.equal(
    bundleEntries[0]?.resource?.resourceType,
    'Composition',
    `${label} first bundle entry must be Composition.`,
  );
  const match = bundleEntries.find((entry) =>
    entry?.resource?.resourceType === 'MedicationStatement'
    && extractClaim(entry.resource, MedicationStatementClaim.Identifier) === expected.identifier
    && extractClaim(entry.resource, MedicationStatementClaim.MedicationText) === expected.text
    && extractClaim(entry.resource, MedicationStatementClaim.Note) === expected.note,
  );
  assert.ok(match, `${label} must include consolidated MedicationStatement ${expected.identifier}.`);
  return match;
}

function buildMedicationBundle({
  subjectDid,
  identifier,
  effectiveDateTime,
  medicationText,
  noteText,
  doseQuantityValue,
  doseQuantityUnit,
  timingFrequency,
  timingPeriod,
  timingPeriodUnit,
  dosageAsNeeded,
}) {
  return {
    resourceType: 'Bundle',
    type: 'document',
    entry: [
      {
        resource: {
          resourceType: 'Composition',
          id: `composition-${identifier}`,
          status: 'final',
          subject: { reference: subjectDid },
          type: { coding: [{ system: 'http://loinc.org', code: '60591-5' }] },
          section: [
            {
              code: {
                coding: [{
                  system: 'http://loinc.org',
                  code: '10160-0',
                }],
              },
            },
          ],
        },
      },
      {
        resource: {
          resourceType: 'Patient',
          id: `patient-${identifier}`,
        },
      },
      {
        resource: {
          resourceType: 'MedicationStatement',
          id: identifier,
          status: 'active',
          subject: { reference: subjectDid },
          effectiveDateTime,
          medicationCodeableConcept: { text: medicationText },
          identifier: [{ value: identifier }],
          note: [{ text: noteText }],
          meta: {
            claims: {
              '@context': 'org.hl7.fhir.api',
              [MedicationStatementClaim.Identifier]: identifier,
              [MedicationStatementClaim.Subject]: subjectDid,
              [MedicationStatementClaim.Status]: 'active',
              [MedicationStatementClaim.MedicationText]: medicationText,
              [MedicationStatementClaim.Effective]: effectiveDateTime,
              [MedicationStatementClaim.Note]: noteText,
              [MedicationStatementClaim.Category]: HealthcareBasicSections.HistoryOfMedicationUse.attributeValue,
              [MedicationStatementClaimsFhirApiExtended.DoseQuantityValue]: doseQuantityValue,
              [MedicationStatementClaimsFhirApiExtended.DoseQuantityUnit]: doseQuantityUnit,
              [MedicationStatementClaimsFhirApiExtended.TimingFrequency]: timingFrequency,
              [MedicationStatementClaimsFhirApiExtended.TimingPeriod]: timingPeriod,
              [MedicationStatementClaimsFhirApiExtended.TimingPeriodUnit]: timingPeriodUnit,
              [MedicationStatementClaimsFhirApiExtended.DosageAsNeeded]: dosageAsNeeded,
            },
          },
        },
      },
    ],
  };
}

function createRuntimeClient({ baseUrl, ctx, bearerToken, requestTimeoutMs = 15_000 } = {}) {
  return new NodeHttpClient({
    baseUrl,
    ctx,
    bearerToken,
    requestTimeoutMs,
  });
}

test('LIVE actor-scoped node runtime chain on GW', { skip: !RUN }, async () => {
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
  const hostSector = env('HOST_REGISTRY_SECTOR', 'test');
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

  const vpPayload = loadVpPayloadFixture(vpTokenFile);
  const vpToken = vpTokenEnv || buildUnsignedVpJwt(vpPayload);
  const hostCtx = { jurisdiction, sector: hostSector };
  const ctx = { tenantId: tenantRouteId, jurisdiction, sector };
  const pollOptions = { timeoutMs: 120000, intervalMs: 1500 };

  const ping = await fetch(`${baseUrl}/host/.well-known/ping`);
  assert.equal(ping.status, 200, `GW ping must return 200 at ${baseUrl}.`);
  debug.record('ping', { baseUrl, status: ping.status });

  const runtimeClient = createRuntimeClient({ baseUrl, ctx, bearerToken, requestTimeoutMs: 10_000 });

  const hostSession = new NodeActorSession(
    { actorKind: ActorKinds.HostOnboarding, capabilities: [ActorCapabilities.HostActivateOrganization, ActorCapabilities.HostConfirmOrder] },
    runtimeClient,
  );
  const orgControllerSession = new NodeActorSession(
    { actorKind: ActorKinds.OrganizationController, capabilities: [ActorCapabilities.OrganizationCreateEmployee, ActorCapabilities.TokenRequestSmart] },
    runtimeClient,
  );
  const individualControllerSession = new NodeActorSession(
    {
      actorKind: ActorKinds.IndividualController,
      capabilities: [ActorCapabilities.IndividualBootstrap, ActorCapabilities.ConsentGrantProfessionalAccess, ActorCapabilities.TokenRequestSmart],
    },
    runtimeClient,
  );

  const activation = await hostSession.asHostOnboarding().activateOrganizationInGatewayFromIcaProof(
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
        'org.schema.Person.email': env('CONTROLLER_EMAIL', 'controller@example.com'),
        'org.schema.Person.hasOccupation.identifier.value': env('CONTROLLER_ROLE', 'RESPRSN'),
        'org.schema.Service.category': sector,
        'org.schema.Service.identifier': env('SERVICE_IDENTIFIER_DID', 'did:web:provider.example.org'),
        'org.schema.Service.url': env('SERVICE_URL', 'https://provider.example.org'),
      },
    },
    pollOptions,
  );
  debug.record('legal-activation', { response: activation });
  assert.equal(activation.poll.status, 200, 'Host onboarding facade must complete organization activation.');
  assert.ok(
    ['200', '201'].includes(String(activation.poll.body?.data?.[0]?.response?.status || '')),
    'Host onboarding facade must return an inner activation response.status of 200/201.',
  );

  const employee = await orgControllerSession.asOrganizationController().createOrganizationEmployee(
    ctx,
    {
      employeeClaims: {
        ...cloneExample(EXAMPLE_LIVE_EMPLOYEE_INPUT.employeeClaims),
        'org.schema.Person.identifier': env('CONTROLLER_IDENTIFIER', 'urn:uuid:11b2c3d4-e5f6-7890-1234-567890abcdef'),
        'org.schema.Person.email': env('CONTROLLER_EMAIL', 'controller@example.com'),
        'org.schema.Person.hasOccupation.identifier.value': env('CONTROLLER_ROLE', 'RESPRSN'),
      },
    },
    pollOptions,
  );
  debug.record('employee-create', { response: employee });
  assert.equal(employee.poll.status, 200, 'Organization controller facade must create employee through GW.');

  const individualAltName = env('INDIVIDUAL_ALTERNATE_NAME', 'Doraemon');
  const individualControllerEmail = env('INDIVIDUAL_CONTROLLER_EMAIL', 'controller@example.com');
  const patientSubjectDid = suiteSubjectDid;
  const smartProfessionalDid = env('SMART_SUBJECT_DID', 'did:web:api.acme.org:employee:doctor1@acme.org:ISCO-08|2211');
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

  const consent = await individualControllerSession.asIndividualController().grantProfessionalAccess(ctx, {
    ...cloneExample(EXAMPLE_LIVE_CONSENT_GRANT_INPUT),
    subjectDid: patientSubjectDid,
    actor: { identifier: professionalDid },
    actorRole: env('PROFESSIONAL_ROLE', 'ISCO-08|2211'),
    purpose: env('CONSENT_PURPOSE', 'TREAT'),
    pollOptions,
  });
  debug.record('consent', { response: consent });
  assert.equal((consent.consent || consent).poll.status, 200, 'Individual controller facade must grant professional access.');

  const smartVpToken = env(
    'SMART_VP_TOKEN',
    buildUnsignedVpJwt({
      vp: {
        holder: smartClientId,
        verifiableCredential: [
          {
            type: ['VerifiableCredential', 'EmployeeCredential'],
            credentialSubject: {
              id: smartProfessionalDid,
              hasOccupation: env('SMART_SUBJECT_OCCUPATION', 'ISCO-08|2211'),
            },
          },
        ],
      },
    }),
  );

  const smart = await individualControllerSession.asIndividualController().requestSmartToken({
    tenantId: tenantRouteId,
    jurisdiction,
    sector,
    idToken: professionalIdToken,
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
});

test('LIVE communication ingestion through individual controller facade persists DocumentReference baseline', { skip: !(RUN && RUN_IPS_INGESTION) }, async () => {
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
      pollOptions: { timeoutMs: 120000, intervalMs: 1500 },
    },
  );
  if (ingest.poll.status === 404) {
    ingest = await individualControllerSession.asIndividualController().ingestCommunicationAndUpdateIndex(
      { tenantId, jurisdiction, sector },
      {
        communicationPayload: communicationIngestionPayload,
        pathFormatSegment: 'org.hl7.fhir.r4',
        pollOptions: { timeoutMs: 120000, intervalMs: 1500 },
      },
    );
  }
  debug.record('communication-ingest', { response: ingest });
  assert.equal(ingest.poll.status, 200, 'Communication ingestion through facade must complete.');
  assertCommunicationAckShape(ingest.poll.body, 'Communication ingestion');

  const search = await individualControllerSession.asIndividualController().submitAndPoll(
    runtimeClient.v1Path({ tenantId, jurisdiction, sector }, 'individual', 'org.hl7.fhir.r4', 'Bundle', '_search'),
    runtimeClient.v1Path({ tenantId, jurisdiction, sector }, 'individual', 'org.hl7.fhir.r4', 'Bundle', '_search-response'),
    {
      ...buildExampleDocumentReferenceSearchPayload(subjectDid),
      thid: `search-documentreference-${Date.now()}`,
    },
    { timeoutMs: 120000, intervalMs: 1500 },
  );
  debug.record('documentreference-search', { response: search });
  assert.equal(search.poll.status, 200, 'DocumentReference search through facade submitAndPoll must return 200.');
  assertDocumentReferenceSearchHasCid(
    search.poll.body,
    'DocumentReference search after communication ingestion',
    subjectDid,
  );
});

test('LIVE communication ingestion indexes two medication statements from two bundles', { skip: !(RUN && RUN_IPS_INGESTION) }, async () => {
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

  const cases = buildExampleLiveMedicationCases(Date.now());

  for (const medication of cases) {
    const bundle = buildMedicationBundle({
      subjectDid,
      identifier: medication.identifier,
      effectiveDateTime: medication.effectiveDateTime,
      medicationText: medication.text,
      noteText: medication.note,
      doseQuantityValue: medication.doseQuantityValue,
      doseQuantityUnit: medication.doseQuantityUnit,
      timingFrequency: medication.timingFrequency,
      timingPeriod: medication.timingPeriod,
      timingPeriodUnit: medication.timingPeriodUnit,
      dosageAsNeeded: medication.dosageAsNeeded,
    });
    const communicationPayload = buildExampleCommunicationIngestionPayload({
      subjectDid,
      sent: medication.effectiveDateTime,
      ipsBundleBase64: Buffer.from(JSON.stringify(bundle), 'utf8').toString('base64'),
    });
    const communicationResource = communicationPayload?.body?.data?.[0]?.resource;
    if (communicationResource?.meta?.claims) {
      communicationResource.meta.claims['Composition.section'] = HealthcareBasicSections.HistoryOfMedicationUse.attributeValue;
    }

    let ingest = await individualControllerSession.asIndividualController().ingestCommunicationAndUpdateIndex(
      routeCtx,
      {
        communicationPayload,
        pathFormatSegment: 'api',
        pollOptions: { timeoutMs: 120000, intervalMs: 1500 },
      },
    );
    if (ingest.poll.status === 404) {
      ingest = await individualControllerSession.asIndividualController().ingestCommunicationAndUpdateIndex(
        routeCtx,
        {
          communicationPayload,
          pathFormatSegment: 'org.hl7.fhir.r4',
          pollOptions: { timeoutMs: 120000, intervalMs: 1500 },
        },
      );
    }
    debug.record('communication-ingest-medication', {
      medicationIdentifier: medication.identifier,
      response: ingest,
    });
    assert.equal(ingest.poll.status, 200, `Communication ingestion for ${medication.identifier} must complete.`);
    assertCommunicationAckShape(ingest.poll.body, `Communication ingestion for ${medication.identifier}`);
  }

  const search = await runtimeClient.searchClinicalBundle(routeCtx, {
    subject: subjectDid,
    section: HealthcareBasicSections.HistoryOfMedicationUse.attributeValue,
    includedTypes: ['MedicationStatement'],
    pollOptions: { timeoutMs: 120000, intervalMs: 1500 },
  });
  debug.record('medicationstatement-search', { response: search });
  assert.equal(search.poll.status, 200, 'MedicationStatement bundle search must return 200.');

  for (const medication of cases) {
    assertMedicationSearchHasMatch(
      search.poll.body,
      'MedicationStatement search after communication ingestion',
      {
        identifier: medication.identifier,
        text: medication.text,
        note: medication.note,
        doseQuantityValue: medication.doseQuantityValue,
        doseQuantityUnit: medication.doseQuantityUnit,
        timingFrequency: medication.timingFrequency,
        timingPeriod: medication.timingPeriod,
        timingPeriodUnit: medication.timingPeriodUnit,
        dosageAsNeeded: medication.dosageAsNeeded,
      },
    );
  }

  const ipsSearch = await individualControllerSession.asIndividualController().submitAndPoll(
    runtimeClient.individualBundleSearchPath(routeCtx),
    runtimeClient.individualBundleSearchPollPath(routeCtx),
    {
      thid: `ips-search-${Date.now()}`,
      body: {
        resourceType: 'Bundle',
        type: 'batch',
        entry: [{
          request: {
            method: 'GET',
            url:
              `Bundle?type=document&composition.subject=${encodeURIComponent(subjectDid)}`
              + `&composition.type=${encodeURIComponent('http://loinc.org|60591-5')}`,
          },
        }],
      },
    },
    { timeoutMs: 120000, intervalMs: 1500 },
  );
  debug.record('ips-bundle-search', { response: ipsSearch });
  assert.equal(ipsSearch.poll.status, 200, 'IPS bundle search must return 200.');
  for (const medication of cases) {
    assertIpsBundleHasMedication(
      ipsSearch.poll.body,
      'IPS bundle search after communication ingestion',
      {
        identifier: medication.identifier,
        text: medication.text,
        note: medication.note,
      },
    );
  }
});

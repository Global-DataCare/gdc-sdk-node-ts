import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HealthcareBasicSections } from 'gdc-common-utils-ts/constants';
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
import { createIpsSummarySearchDidcommMessage } from 'gdc-common-utils-ts/utils/communication-bundle-document-request';
import {
  buildBundleDocumentFromClaims,
  extractFlatClaimValue,
  getBundleDocumentResourceIds,
  getBundleDocumentResources,
} from '../../gdc-common-utils-ts/dist/utils/bundle-document-builder.js';

import { ActorCapabilities, ActorKinds, NodeActorSession } from '../dist/index.js';
import {
  buildUnsignedJwt,
  buildUnsignedVpJwt,
  loadVpPayloadFixture,
} from './helpers/vp-token-fixture.mjs';
import {
  createRuntimeClient,
  ensureLiveGwTraceFiles,
} from './helpers/live-gw-runtime-helpers.mjs';

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

function getBatchEntries(pollBody, label) {
  const entries = pollBody?.body?.data || pollBody?.data || [];
  assert.ok(Array.isArray(entries), `${label} must return a batch-style data array.`);
  assert.ok(entries.length > 0, `${label} must return at least one batch entry.`);
  return entries;
}

function getSearchRows(pollBody, label) {
  const first = getBatchEntries(pollBody, label)[0] || {};
  const rows = first?.resource?.data;
  assert.ok(Array.isArray(rows), `${label} first batch entry must expose resource.data.`);
  assert.ok(rows.length > 0, `${label} must return at least one matched row.`);
  return rows;
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
    ['200', '201', '409'].includes(String(activation.poll.body?.data?.[0]?.response?.status || '')),
    'Host onboarding facade must return an inner activation response.status of 200/201/409.',
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
    actor: { identifier: smartProfessionalDid },
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
    { timeoutMs: 120000, intervalMs: 1500 },
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
  const professionalDid = env('PROFESSIONAL_DID', EXAMPLE_API_ORGANIZATION_DID);

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
      pollOptions: { timeoutMs: 120000, intervalMs: 1500 },
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

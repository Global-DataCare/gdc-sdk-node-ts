import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
  EXAMPLE_INDEX_PROVIDER_SECTOR_DID_WEB,
  EXAMPLE_IPS_BUNDLE_NOTE_TEXT,
  EXAMPLE_LICENSE_ISSUE_INPUT,
  EXAMPLE_JURISDICTION,
  EXAMPLE_LIVE_GW_BASE_URL_LOCAL,
  EXAMPLE_LIVE_CONSENT_GRANT_INPUT,
  EXAMPLE_LIVE_EMPLOYEE_INPUT,
  EXAMPLE_REGISTERED_SUBJECT_ALTERNATE_NAME,
  EXAMPLE_RELATED_PERSON_DISABLE_INPUT,
  EXAMPLE_RELATED_PERSON_FHIR_RESOURCE,
  EXAMPLE_RELATED_PERSON_ROLE,
  EXAMPLE_RELATED_PERSON_UPSERT_BUNDLE_PAYLOAD,
  EXAMPLE_SECTOR,
  EXAMPLE_SUBJECT_DID,
  EXAMPLE_TENANT_IDENTIFIER,
  EXAMPLE_INDIVIDUAL_DISABLE_MESSAGE,
  buildExampleLiveMedicationCases,
  buildExampleMedicationIpsDocumentBundle,
  EXAMPLE_SMART_PRESENTATION_SUBMISSION,
  buildExampleCommunicationIngestionPayload,
  buildExampleDocumentReferenceSearchPayload,
  cloneExample,
} from 'gdc-common-utils-ts/examples';
import {
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

const RUN = env('RUN_LIVE_GW_E2E', '0') === '1';
const RUN_ACTOR_CHAIN = env('RUN_LIVE_GW_E2E_ACTOR_CHAIN', '1') === '1';
const RUN_IPS_INGESTION = env('RUN_LIVE_GW_E2E_IPS_INGESTION', '0') === '1';
const RUN_INDIVIDUAL_LIFECYCLE = env('RUN_LIVE_GW_E2E_INDIVIDUAL_LIFECYCLE', '0') === '1';
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
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const runSlug = runId.toLowerCase();
const suiteTenantId = env('TENANT_ID', EXAMPLE_TENANT_IDENTIFIER);
const suiteTenantRouteId = env('TENANT_ROUTE_ID', suiteTenantId);
const suiteJurisdiction = env('JURISDICTION', EXAMPLE_JURISDICTION);
const suiteSector = env('SECTOR', EXAMPLE_SECTOR);
const suiteSubjectDid = env('SUBJECT_DID', EXAMPLE_SUBJECT_DID);
const suiteConsentSection = env(
  'SMART_SCOPE_SECTION',
  String(EXAMPLE_LIVE_CONSENT_GRANT_INPUT.actions?.[0] || HealthcareBasicSections.PatientSummaryDocument.attributeValue),
);

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

function runtimeUuid() {
  const fromCrypto = globalThis.crypto?.randomUUID?.();
  if (fromCrypto) return fromCrypto;
  return `fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildRoutePath(ctx, section, format, resourceType, action) {
  return `/${encodeURIComponent(ctx.tenantId)}/cds-${encodeURIComponent(ctx.jurisdiction)}/v1/${encodeURIComponent(ctx.sector)}/${encodeURIComponent(section)}/${encodeURIComponent(format)}/${encodeURIComponent(resourceType)}/${encodeURIComponent(action)}`;
}

async function submitAndPollDirect({ baseUrl, path: submitPath, payload, bearerToken, pollOptions }) {
  const submitResponse = await fetch(`${baseUrl}${submitPath}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json, application/didcomm-plaintext+json, */*',
      'Content-Type': 'application/didcomm-plaintext+json',
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
  const timeoutMs = Math.max(1, Number(pollOptions?.timeoutMs || 120000));
  const intervalMs = Math.max(1, Number(pollOptions?.intervalMs || 1500));
  const startedAt = Date.now();
  let attempts = 0;

  for (;;) {
    attempts += 1;
    const pollResponse = await fetch(pollUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json, application/didcomm-plaintext+json, */*',
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

  const pingPath = `/host/cds-${jurisdiction}/v1/${hostSector}/.well-known/ping`;
  const ping = await fetch(`${baseUrl}${pingPath}`);
  assert.equal(ping.status, 200, `GW ping must return 200 at ${baseUrl}${pingPath}.`);
  debug.record('ping', { baseUrl, pingPath, status: ping.status });

  const runtimeClient = createRuntimeClient({ baseUrl, ctx, bearerToken, requestTimeoutMs: 10_000 });

  const hostSession = new NodeActorSession(
    { actorKind: ActorKinds.HostOnboarding, capabilities: [ActorCapabilities.HostActivateOrganization, ActorCapabilities.HostConfirmOrder] },
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
    `${runSlug}-${EXAMPLE_REGISTERED_SUBJECT_ALTERNATE_NAME}`,
  );
  const individualControllerEmail = env(
    'INDIVIDUAL_CONTROLLER_EMAIL',
    `controller+${runSlug}@example.com`,
  );
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

  if (RUN_INDIVIDUAL_LIFECYCLE) {
    const individualLifecycleClaims = {
      ...cloneExample(EXAMPLE_INDIVIDUAL_DISABLE_MESSAGE.claims),
      [ClaimsOrganizationSchemaorg.alternateName]: individualAltName,
      [ClaimsOrganizationSchemaorg.ownerEmail]: individualControllerEmail,
    };

    const disable = await individualControllerSession.asIndividualController().disableIndividualOrganization(
      ctx,
      {
        organizationClaims: individualLifecycleClaims,
      },
      pollOptions,
    );
    debug.record('individual-disable', { response: disable });
    assert.equal(disable.poll.status, 200, 'Individual controller facade must disable the hosted subject organization.');

    const purge = await individualControllerSession.asIndividualController().purgeIndividualOrganization(
      ctx,
      {
        organizationClaims: individualLifecycleClaims,
      },
      pollOptions,
    );
    debug.record('individual-purge', { response: purge });
    assert.equal(purge.poll.status, 200, 'Individual controller facade must purge the hosted subject organization after disable.');
  }
});

test('LIVE individual lifecycle on GW', {
  skip: !(RUN && shouldRunLiveGwSuiteProfile(ACTIVE_SUITE_PROFILE, LiveGwSuiteProfiles.Individual)),
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
  const hostSector = env('HOST_REGISTRY_SECTOR', 'test');
  const bearerToken = env('AUTH_BEARER', 'dummy');
  const doctorDid = env('INDIVIDUAL_TEST_DOCTOR_DID', EXAMPLE_API_ORGANIZATION_DID);
  const doctorEmail = env('INDIVIDUAL_TEST_DOCTOR_EMAIL', EXAMPLE_EMAIL_PROFESSIONAL);
  const memberEmail = env('INDIVIDUAL_MEMBER_EMAIL', `member+${runSlug}@example.com`);
  const memberRole = env('INDIVIDUAL_MEMBER_ROLE', EXAMPLE_RELATED_PERSON_ROLE);
  const ctx = { tenantId: tenantRouteId, jurisdiction, sector };
  const hostCtx = { jurisdiction, sector: hostSector };
  const pollOptions = { timeoutMs: 120000, intervalMs: 1500 };

  const vpPayload = loadVpPayloadFixture(vpTokenFile);
  const vpToken = vpTokenEnv || buildUnsignedVpJwt(vpPayload);
  const runtimeClient = createRuntimeClient({ baseUrl, ctx, bearerToken, requestTimeoutMs: 10_000 });
  const hostSession = new NodeActorSession(
    { actorKind: ActorKinds.HostOnboarding, capabilities: [ActorCapabilities.HostActivateOrganization, ActorCapabilities.HostConfirmOrder] },
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
  debug.record('individual-suite-legal-activation', { response: activation });
  assert.equal(activation.poll.status, 200, 'Host onboarding must complete before the individual lifecycle suite.');

  const individualAltName = env(
    'INDIVIDUAL_ALTERNATE_NAME',
    `${runSlug}-${EXAMPLE_REGISTERED_SUBJECT_ALTERNATE_NAME}`,
  );
  const individualControllerEmail = env('INDIVIDUAL_CONTROLLER_EMAIL', 'controller@example.com');
  const subjectDid = suiteSubjectDid;
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
  debug.record('individual-suite-start', { response: individualStart });
  assert.equal(individualStart.registration.poll.status, 200, 'Individual lifecycle suite must create the hosted individual tenant.');

  const individualOrder = await individualControllerSession.asIndividualController().confirmIndividualOrganizationOrder({
    tenantId: tenantRouteId,
    jurisdiction,
    sector,
    offerId: individualStart.offerId,
    timeoutSeconds: Math.round(pollOptions.timeoutMs / 1000),
    intervalSeconds: pollOptions.intervalMs / 1000,
  });
  debug.record('individual-suite-order', { response: individualOrder });
  assert.equal(individualOrder.poll.status, 200, 'Individual lifecycle suite must confirm the hosted individual order.');
  {
    const invoiceSummary = readInvoiceBundleSummaryFromResponseBody(individualOrder.poll.body);
    assert.equal(invoiceSummary.invoiceId, individualStart.offerId, 'Individual lifecycle suite must expose the invoice bundle returned by GW CORE.');
    assert.ok(invoiceSummary.pdfDocumentId, 'Individual lifecycle suite must return a PDF invoice projection.');
    assert.ok(invoiceSummary.structuredDocumentId, 'Individual lifecycle suite must return a structured invoice projection.');
  }

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
    const ingestion = await individualControllerSession.asIndividualController().ingestCommunicationAndUpdateIndex(
      ctx,
      {
        communicationPayload: ingestionPayload,
        pathFormatSegment: 'api',
        pollOptions,
      },
    );
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
  const ipsSearch = await individualControllerSession.asIndividualController().ingestCommunicationAndUpdateIndex(
    ctx,
    {
      communicationPayload: ipsSearchCommunicationPayload,
      pathFormatSegment: 'org.hl7.fhir.r4',
      pollOptions,
    },
  );
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
  const relatedPersonUpsert = await individualControllerSession.asIndividualController().upsertRelatedPersonAndPoll(
    ctx,
    {
      relatedPersonPayload,
      pollOptions,
    },
  );
  debug.record('individual-suite-relatedperson-upsert', { response: relatedPersonUpsert });
  assert.equal(relatedPersonUpsert.poll.status, 200, 'Individual lifecycle suite must upsert one family related person.');

  const memberIssue = await submitAndPollDirect({
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
  });
  debug.record('individual-suite-member-license-issue', { response: memberIssue });
  assert.equal(memberIssue.poll.status, 200, 'Individual lifecycle suite must issue one member activation code from the individual seat pool.');

  const memberConsent = await individualControllerSession.asIndividualController().grantProfessionalAccess(ctx, {
    ...cloneExample(EXAMPLE_LIVE_CONSENT_GRANT_INPUT),
    subjectDid,
    actor: { email: memberEmail },
    actorRole: memberRole,
    purpose: env('CONSENT_PURPOSE', 'TREAT'),
    pollOptions,
  });
  debug.record('individual-suite-member-consent', { response: memberConsent });
  assert.equal(memberConsent.consent.poll.status, 200, 'Individual lifecycle suite must create a consent for the invited member.');

  const doctorConsent = await individualControllerSession.asIndividualController().grantProfessionalAccess(ctx, {
    ...cloneExample(EXAMPLE_LIVE_CONSENT_GRANT_INPUT),
    subjectDid,
    actor: [doctorDid, doctorEmail],
    actorRole: env('PROFESSIONAL_ROLE', 'ISCO-08|2211'),
    purpose: env('CONSENT_PURPOSE', 'TREAT'),
    pollOptions,
  });
  debug.record('individual-suite-doctor-consent', { response: doctorConsent });
  assert.equal(doctorConsent.consent.poll.status, 200, 'Individual lifecycle suite must create a consent for the professional actor.');

  const revokedAt = env('REVOKED_CONSENT_PERIOD_END', '2026-06-01T00:00:00Z');
  const revokedMemberConsent = await individualControllerSession.asIndividualController().submitAndPoll(
    runtimeClient.individualConsentR4BatchPath(ctx),
    runtimeClient.individualConsentR4PollPath(ctx),
    buildConsentLifecyclePayload({
      consentClaims: buildRevokedConsentClaims(memberConsent.consentClaims, revokedAt),
    }),
    pollOptions,
  );
  debug.record('individual-suite-member-consent-revoke', { response: revokedMemberConsent });
  assert.equal(revokedMemberConsent.poll.status, 200, 'Individual lifecycle suite must revoke the member consent by closing its period.');

  const revokedDoctorConsent = await individualControllerSession.asIndividualController().submitAndPoll(
    runtimeClient.individualConsentR4BatchPath(ctx),
    runtimeClient.individualConsentR4PollPath(ctx),
    buildConsentLifecyclePayload({
      consentClaims: buildRevokedConsentClaims(doctorConsent.consentClaims, revokedAt),
    }),
    pollOptions,
  );
  debug.record('individual-suite-doctor-consent-revoke', { response: revokedDoctorConsent });
  assert.equal(revokedDoctorConsent.poll.status, 200, 'Individual lifecycle suite must revoke the doctor consent by closing its period.');

  const relatedPersonLifecycleClaims = {
    ...cloneExample(EXAMPLE_RELATED_PERSON_DISABLE_INPUT.memberClaims),
    [ClaimsPersonSchemaorg.email]: undefined,
    'RelatedPerson.identifier': relatedPersonIdentifier,
    'RelatedPerson.patient': subjectDid,
    'RelatedPerson.telecom': `mailto:${memberEmail}`,
  };
  const disableMember = await individualControllerSession.asIndividualController().disableIndividualMember(
    ctx,
    {
      memberClaims: relatedPersonLifecycleClaims,
      resourceId: relatedPersonResourceId,
    },
    pollOptions,
  );
  debug.record('individual-suite-member-disable', { response: disableMember });
  assert.equal(disableMember.poll.status, 200, 'Individual lifecycle suite must disable the related-person/member relationship.');

  const purgeMember = await individualControllerSession.asIndividualController().purgeIndividualMember(
    ctx,
    {
      memberClaims: relatedPersonLifecycleClaims,
      resourceId: relatedPersonResourceId,
    },
    pollOptions,
  );
  debug.record('individual-suite-member-purge', { response: purgeMember });
  assert.equal(purgeMember.poll.status, 200, 'Individual lifecycle suite must purge the related-person/member relationship after disable.');

  const individualLifecycleClaims = {
    ...cloneExample(EXAMPLE_INDIVIDUAL_DISABLE_MESSAGE.claims),
    [ClaimsOrganizationSchemaorg.alternateName]: individualAltName,
    [ClaimsOrganizationSchemaorg.ownerEmail]: individualControllerEmail,
  };
  const disableIndividual = await individualControllerSession.asIndividualController().disableIndividualOrganization(
    ctx,
    {
      organizationClaims: individualLifecycleClaims,
    },
    pollOptions,
  );
  debug.record('individual-suite-disable', { response: disableIndividual });
  assert.equal(disableIndividual.poll.status, 200, 'Individual lifecycle suite must disable the hosted individual organization for cleanup.');

  const purgeIndividual = await individualControllerSession.asIndividualController().purgeIndividualOrganization(
    ctx,
    {
      organizationClaims: individualLifecycleClaims,
    },
    pollOptions,
  );
  debug.record('individual-suite-purge', { response: purgeIndividual });
  assert.equal(purgeIndividual.poll.status, 200, 'Individual lifecycle suite must purge the hosted individual organization for cleanup.');
});

test('LIVE didcomm-plain communication ingestion through individual controller facade persists DocumentReference baseline', {
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

test('LIVE didcomm-plain communication ingestion indexes two medication statements from two bundles', {
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

test('LIVE legacy-fhir communication ingestion persists DocumentReference baseline', {
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
    pollOptions: { timeoutMs: 120000, intervalMs: 1500 },
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
    { timeoutMs: 120000, intervalMs: 1500 },
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
});

test('LIVE legacy-fhir communication ingestion indexes two medication statements from two bundles', {
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

  const submitPath = buildLegacyFhirCommunicationBatchPath(routeCtx);
  const pollPath = buildLegacyFhirCommunicationPollPath(routeCtx);
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
      pollOptions: { timeoutMs: 120000, intervalMs: 1500 },
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
      pollOptions: { timeoutMs: 120000, intervalMs: 1500 },
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

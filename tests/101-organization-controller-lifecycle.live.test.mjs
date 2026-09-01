// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
/**
 * Journey: 1) submit organization verification, 2) confirm its Order,
 * 3) reissue and activate the controller device, 4) disable and purge the
 * tenant, and 5) remove the host after no tenant remains.
 * Authorization invariant: only the reviewed controller proof authorizes the
 * tenant lifecycle. Persistence invariant: purge removes tenant state before
 * host cleanup is allowed.
 */
/**
 * 101 note:
 * - Teach the highest-level `sdk-node` actor/profile/runtime surface for this topic.
 * - Reuse `sdk-core` and `common-utils` helpers instead of re-teaching raw claims or low-level editors here.
 * - Read `docs/101-README.md` for the ordered path and keep actor role plus submit/poll explicit.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateKey, sign as cryptoSign } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ActorCapabilities } from 'gdc-common-utils-ts/constants/actor-session';
import { EXAMPLE_CONTROLLER_BINDING, EXAMPLE_JURISDICTION, EXAMPLE_LIVE_GW_BASE_URL_LOCAL, EXAMPLE_SECTOR, EXAMPLE_TENANT_IDENTIFIER, cloneExample } from 'gdc-common-utils-ts/examples';
import {
  addLegalRepresentativeCredential,
  addServiceControllerCredential,
  addOrganizationCredential,
  BundleReader,
  ClaimsOrganizationSchemaorg,
  ClaimsServiceSchemaorg,
  createJwtSigner,
  createLegalOrganizationOnboardingEditor,
  createVP,
  OrganizationLifecycleEditor,
  readLegalOrganizationVerificationCredentialPairFromResponseBody,
  readLegalOrganizationVerificationTaxIdFromResponseBody,
  readServiceControllerCredentialFromResponseBody,
  serializeServiceCapabilityTokens,
  ServiceCapability,
} from 'gdc-common-utils-ts';

import {
  HostOnboardingSdk,
  NodeHttpClient,
  OrganizationControllerSdk,
  createProfileDeviceActivationRequest,
  readLegalOrganizationCredentialReissuanceActivationCode,
} from '../dist/index.js';
import { extractOfferIdFromResponseBody } from '../dist/order-offer-summary.js';
import { ensureLiveGwTraceFiles } from './helpers/live-gw-runtime-helpers.mjs';

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim();
}

function isEnabledByDefault(name, fallback = '1') {
  const normalized = env(name, fallback).toLowerCase();
  return normalized !== '0' && normalized !== 'false' && normalized !== 'no';
}

const RUN = isEnabledByDefault('RUN_LIVE_101_ORGANIZATION_CONTROLLER_LIFECYCLE_E2E', '0');
const DEBUG = env('LIVE_101_ORGANIZATION_CONTROLLER_LIFECYCLE_DEBUG', '0') === '1';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const runSlug = runId.toLowerCase();
const suiteTenantId = env('TENANT_ID', `live-controller-${runSlug}`);
const suiteTenantRouteId = env('TENANT_ROUTE_ID', suiteTenantId);
const suiteJurisdiction = env('JURISDICTION', EXAMPLE_JURISDICTION);
const suiteSector = env('SECTOR', EXAMPLE_SECTOR);
const suiteHostSector = env('HOST_REGISTRY_SECTOR', 'test');
const suiteHostIdentifierValue = env('HOST_ID_VALUE', `live-controller-host-${runSlug}`);
const pollIntervalMs = Math.max(1, Number(env('LIVE_GW_POLL_INTERVAL_MS', '200')));
const pollTimeoutMs = Math.max(1000, Number(env('LIVE_GW_POLL_TIMEOUT_MS', '60000')));
const controllerSignerSeed = env('CONTROLLER_SIGNER_SEED', 'organization-controller-seed-001');
const controllerOrganizationTaxId = env('LIVE_CONTROLLER_ORGANIZATION_TAX_ID', EXAMPLE_TENANT_IDENTIFIER);
const liveHostVerificationDefaultPdfPath = env(
  'LIVE_GW_HOST_VERIFICATION_PDF_PATH',
  path.join(__dirname, '..', '..', 'examples', 'TEST-A4-Antifraud.pdf'),
);

function createDebugLogger() {
  return ensureLiveGwTraceFiles({
    debugEnabled: DEBUG,
    debugFilePath: env(
      'LIVE_101_ORGANIZATION_CONTROLLER_LIFECYCLE_DEBUG_FILE',
      path.join(__dirname, '..', 'test-results', `live-controller-lifecycle-${runId}.jsonl`),
    ),
    httpTraceFilePath: env(
      'SDK_HTTP_TRACE_FILE',
      path.join(__dirname, '..', 'test-results', `live-controller-lifecycle-http-${runId}.jsonl`),
    ),
  });
}

function createLivePollOptions(overrides = {}) {
  return {
    timeoutMs: Math.max(1000, Number(overrides.timeoutMs ?? pollTimeoutMs)),
    intervalMs: Math.max(1, Number(overrides.intervalMs ?? pollIntervalMs)),
  };
}

function createStepProfiler(debug, scope) {
  const steps = [];
  return {
    async run(label, work) {
      const startedAt = Date.now();
      try {
        const result = await work();
        const entry = { label, durationMs: Date.now() - startedAt, status: 'ok' };
        steps.push(entry);
        debug.record(`${scope}-step`, entry);
        return result;
      } catch (error) {
        const entry = {
          label,
          durationMs: Date.now() - startedAt,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        };
        steps.push(entry);
        debug.record(`${scope}-step`, entry);
        throw error;
      }
    },
    flush() {
      debug.record(`${scope}-summary`, {
        totalDurationMs: steps.reduce((sum, step) => sum + step.durationMs, 0),
        steps,
      });
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

function buildDemoIdToken(payload) {
  return [
    Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    'demo-signature',
  ].join('.');
}

function buildLiveHostVerificationPdfAttachment() {
  const resolvedLocalPath = path.resolve(liveHostVerificationDefaultPdfPath);
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
  organizationControllerCredential,
  tenantId,
  audience,
}) {
  // The first historical controller may still be the deployment-authorized
  // legal representative and therefore has the two-VC compatibility proof.
  // Later independent controllers must add their own ICA-issued controller VC.
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
  if (organizationControllerCredential) {
    addServiceControllerCredential(vpPayload, organizationControllerCredential);
  }
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

test('101: LIVE organization controller lifecycle with controller proof bearer', {
  skip: !RUN,
}, async () => {
  const debug = createDebugLogger();
  const profiler = createStepProfiler(debug, 'live-controller-lifecycle');
  const baseUrl = env('BASE_URL', EXAMPLE_LIVE_GW_BASE_URL_LOCAL);
  const pollOptions = createLivePollOptions();
  const hostCtx = { jurisdiction: suiteJurisdiction, hostNetwork: suiteHostSector };
  const tenantCtx = { tenantId: suiteTenantRouteId, jurisdiction: suiteJurisdiction, sector: suiteSector };
  const controllerEmail = env('CONTROLLER_EMAIL', `controller+${runSlug}@example.com`);
  const serviceIdentifierDid = env('SERVICE_IDENTIFIER_DID', 'did:web:provider.example.org');
  const serviceUrl = env('SERVICE_URL', 'https://provider.example.org');
  const serviceType = serializeServiceCapabilityTokens([
    ServiceCapability.IndexProvider,
    ServiceCapability.DigitalTwinReader,
  ]);
  const controllerVpAudience = env('CONTROLLER_VP_AUDIENCE', `host:${suiteHostIdentifierValue}`);
  const controllerSigner = await createJwtSigner({
    alg: env('CONTROLLER_SIGNER_ALG', 'ES384'),
    seed: controllerSignerSeed,
    purpose: 'organization-controller',
  });

  const bootstrapClient = new NodeHttpClient({
    baseUrl,
    ctx: tenantCtx,
    requestTimeoutMs: 10_000,
  });
  const hostSdk = new HostOnboardingSdk(bootstrapClient, [
    ActorCapabilities.HostingActivateOrganization,
    ActorCapabilities.HostingConfirmOrder,
    ActorCapabilities.HostingDisableHost,
    ActorCapabilities.HostingPurgeHost,
  ]);
  const verificationSdk = new OrganizationControllerSdk(bootstrapClient, [
    ActorCapabilities.OrganizationDisableTenant,
    ActorCapabilities.OrganizationPurgeTenant,
  ]);

  const controllerBinding = cloneExample(EXAMPLE_CONTROLLER_BINDING);
  controllerBinding.publicKeyJwk = controllerSigner.getPublicJwk();
  controllerBinding.jwks = { keys: [controllerSigner.getPublicJwk()] };

  const onboarding = createLegalOrganizationOnboardingEditor()
    .setLegalName(env('ORG_LEGAL_NAME', 'TEST LEGAL ORGANIZATION SL'))
    .setTaxId(controllerOrganizationTaxId)
    .setLegalIdentifierValue(controllerOrganizationTaxId)
    .setLegalIdentifierType(env('ORG_IDENTIFIER_TYPE', 'taxID'))
    .setTenantAlias(suiteTenantRouteId)
    .setAddressCountry(suiteJurisdiction)
    .setControllerEmail(controllerEmail)
    .setControllerRole(env('CONTROLLER_ROLE', 'RESPRSN'))
    .setServiceCategory(suiteSector)
    .setServiceIdentifier(serviceIdentifierDid)
    .setServiceType(serviceType)
    .setServiceUrl(serviceUrl);
  const draft = onboarding.buildDraft({ allowExplicitAlternateNameForTenantId: true });
  assert.equal(draft.validation.ok, true, 'Controller live onboarding draft must be valid before submission.');
  const verificationRequest = {
    ...onboarding.buildVerificationTransactionInput({
      controller: controllerBinding,
      organization: {
        ...(serviceIdentifierDid ? { did: serviceIdentifierDid } : {}),
        ...(serviceUrl ? { url: serviceUrl } : {}),
      },
      legalRepresentativePayload: { email: controllerEmail },
      verification: { resourceType: env('LEGAL_ORG_VERIFICATION_RESOURCE_TYPE', 'contract') },
      attachments: [buildLiveHostVerificationPdfAttachment()],
      validationOptions: { allowExplicitAlternateNameForTenantId: true },
    }),
    claims: {
      ...draft.claims,
      // The initial controller consumes the organization's self-invited
      // employee seat. Organization/_issue can subsequently reissue that
      // same actor-bound seat for another device without consuming a new one.
      [ClaimsOrganizationSchemaorg.numberOfEmployees]: 1,
      [ClaimsServiceSchemaorg.serviceType]: serviceType,
    },
  };

  let runtimeClient;
  let organizationControllerSdk;
  let tenantDisabled = false;
  let hostActivated = false;

  try {
    const verification = await profiler.run('organization-transaction', () => verificationSdk.submitLegalOrganizationVerificationTransaction(
      hostCtx,
      verificationRequest,
      pollOptions,
    ));
    debug.record('organization-transaction', { response: verification });
    assert.equal(verification.poll.status, 200);
    const verificationReader = new BundleReader(verification.poll.body || {});
    assert.ok(
      ['transaction-response', 'batch-response'].includes(String(verificationReader.getBundleType() || '')),
      'Host verification transaction must return one terminal bundle response type.',
    );

    const verificationPair = readLegalOrganizationVerificationCredentialPairFromResponseBody(verification.poll.body || {});
    const { organizationCredential, legalRepresentativeCredential } = verificationPair;
    const organizationControllerCredential = readServiceControllerCredentialFromResponseBody(verification.poll.body || {});
    // A fixed signed-PDF fixture may designate a different future technical
    // controller. ICA must not bind that actor to this representative's key.
    // The legacy first representative remains usable only through the audited
    // two-VC compatibility path; an independently enrolled controller requires
    // its own ServiceControllerCredential.
    const resolvedTaxId = readLegalOrganizationVerificationTaxIdFromResponseBody(verification.poll.body || {});
    const offerId = extractOfferIdFromResponseBody(verification.poll.body);
    assert.ok(offerId, 'Host verification transaction must expose one offer identifier before order confirmation.');

    const controllerVpToken = await buildSignedControllerVpToken({
      signer: controllerSigner,
      organizationCredential,
      legalRepresentativeCredential,
      organizationControllerCredential,
      tenantId: resolvedTaxId,
      audience: controllerVpAudience,
    });
    debug.record('controller-proof-bearer', {
      audience: controllerVpAudience,
      signerKid: controllerSigner.getKid(),
      compactJwtPreview: `${controllerVpToken.split('.').slice(0, 2).join('.')}.<signature>`,
      resolvedTaxId,
    });

    const legalOrder = await profiler.run('confirm-legal-order', () => hostSdk.confirmLegalOrganizationOrder(
      hostCtx,
      { offerId },
      pollOptions,
    ));
    debug.record('confirm-legal-order', { response: legalOrder, offerId });
    assert.equal(legalOrder.poll.status, 200);
    hostActivated = true;

    runtimeClient = new NodeHttpClient({
      baseUrl,
      ctx: tenantCtx,
      bearerToken: controllerVpToken,
      requestTimeoutMs: 10_000,
    });
    organizationControllerSdk = new OrganizationControllerSdk(runtimeClient, [
      ActorCapabilities.OrganizationDisableTenant,
      ActorCapabilities.OrganizationPurgeTenant,
    ]);

    // Reissue the already accredited controller's seat without attempting a
    // controller mutation. A second PDF-designated controller is a separate
    // E2E fixture because ICA must first issue that actor's own controller VC.
    const credentialReissuance = await profiler.run('reissue-current-controller-credentials', () =>
      organizationControllerSdk.submitLegalOrganizationCredentialReissuance(
        hostCtx,
        {
          ...verificationRequest,
          controller: {},
        },
        pollOptions,
      ));
    debug.record('reissue-current-controller-credentials', { response: credentialReissuance });
    assert.equal(credentialReissuance.poll.status, 200);
    const activationCode = readLegalOrganizationCredentialReissuanceActivationCode(credentialReissuance);
    assert.ok(activationCode, 'Organization/_issue must expose the current controller activation code.');

    const controllerIdToken = buildDemoIdToken({
      sub: `controller:${controllerEmail}`,
      tenant_id: suiteTenantRouteId,
      email: controllerEmail,
      email_verified: true,
    });
    const controllerDeviceRequest = createProfileDeviceActivationRequest({
        tenantId: suiteTenantRouteId,
        jurisdiction: suiteJurisdiction,
        sector: suiteSector,
        activationCode,
        idToken: controllerIdToken,
      })
      .setClientInstanceId(`controller-device-${runSlug}`)
      .setClientName('Local controller lifecycle E2E')
      .setDeviceName('Local controller lifecycle device')
      .setApplicationType('native')
      .setRedirectUris([`gdc-controller-${runSlug}://callback`])
      .setPublicJwks([controllerSigner.getPublicJwk()])
      .setTimeoutSeconds(Math.ceil(pollTimeoutMs / 1000))
      .setIntervalSeconds(Math.max(1, Math.ceil(pollIntervalMs / 1000)))
      .build();
    const controllerDeviceActivation = await profiler.run('rebind-current-controller-device', () =>
      runtimeClient.activateProfileDeviceWithActivationRequest(controllerDeviceRequest));
    debug.record('rebind-current-controller-device', { response: controllerDeviceActivation });
    assert.equal(controllerDeviceActivation.exchange.poll.status, 200);
    assert.equal(controllerDeviceActivation.dcr.poll.status, 200);
    assert.ok(controllerDeviceActivation.initialAccessToken);

    const tenantLifecycleInput = {
      organizationEditor: new OrganizationLifecycleEditor()
        .setIdentifierValue(resolvedTaxId)
        .setTaxId(resolvedTaxId),
    };
    const disabledTenant = await profiler.run('disable-tenant-with-controller-proof-bearer', () => organizationControllerSdk.disableTenant(
      hostCtx,
      tenantLifecycleInput,
      pollOptions,
    ));
    debug.record('disable-tenant-with-controller-proof-bearer', { response: disabledTenant });
    assert.equal(disabledTenant.poll.status, 200);
    tenantDisabled = true;

    const purgedTenant = await profiler.run('purge-tenant-with-controller-proof-bearer', () => organizationControllerSdk.purgeTenant(
      hostCtx,
      tenantLifecycleInput,
      pollOptions,
    ));
    debug.record('purge-tenant-with-controller-proof-bearer', { response: purgedTenant });
    assert.equal(purgedTenant.poll.status, 200);
    tenantDisabled = false;
  } finally {
    if (hostActivated) {
      const hostLifecycleInput = {
        organizationEditor: new OrganizationLifecycleEditor()
          .setIdentifierValue(suiteHostIdentifierValue),
      };
      if (tenantDisabled && organizationControllerSdk) {
        try {
          await profiler.run('cleanup-purge-tenant-after-failure', () => organizationControllerSdk.purgeTenant(
            hostCtx,
            {
              organizationEditor: new OrganizationLifecycleEditor()
                .setIdentifierValue(controllerOrganizationTaxId)
                .setTaxId(controllerOrganizationTaxId),
            },
            pollOptions,
          ));
        } catch (error) {
          debug.record('cleanup-purge-tenant-after-failure-error', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      try {
        const disableHost = await profiler.run('cleanup-disable-host', () => hostSdk.disableHost(
          hostCtx,
          hostLifecycleInput,
          pollOptions,
        ));
        debug.record('cleanup-disable-host', { response: disableHost });
        assert.equal(disableHost.poll.status, 200);
      } catch (error) {
        debug.record('cleanup-disable-host-error', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      try {
        const purgeHost = await profiler.run('cleanup-purge-host', () => hostSdk.purgeHost(
          hostCtx,
          hostLifecycleInput,
          pollOptions,
        ));
        debug.record('cleanup-purge-host', { response: purgeHost });
        assert.equal(purgeHost.poll.status, 200);
      } catch (error) {
        debug.record('cleanup-purge-host-error', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    profiler.flush();
  }
});

import fs from 'node:fs';
import path from 'node:path';
import {
  EXAMPLE_EMPLOYEE_DEVICE_ACTIVATION_INPUT,
  EXAMPLE_HOST_ROUTE_CONTEXT,
  EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE,
  EXAMPLE_TENANT_ROUTE_CONTEXT,
  cloneExample,
} from 'gdc-common-utils-ts/examples';

import {
  NodeHttpClient,
  OrganizationControllerSdk,
  recoverOrganizationControllerWithIssueWithDeps,
} from '../dist/index.js';

const cwd = process.cwd();
const defaultPdfPath = path.resolve(cwd, '..', 'examples', 'TEST-A4-Antifraud.pdf');
const pdfPath = process.env.PDF_PATH || defaultPdfPath;
const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:3000';
const hostJurisdiction = String(process.env.HOST_JURISDICTION || 'ES');
const hostNetwork = String(process.env.HOST_NETWORK || 'test');
const tenantId = String(process.env.TENANT_ID || 'acme-id');
const tenantJurisdiction = String(process.env.TENANT_JURISDICTION || hostJurisdiction);
const sector = String(process.env.SECTOR || 'health-care');
const controllerEmail = String(process.env.CONTROLLER_EMAIL || 'admin1@acme.org');
const controllerRole = String(process.env.CONTROLLER_ROLE || 'ISCO-08|1120');
const pollTimeoutMs = Number(process.env.POLL_TIMEOUT_MS || 20000);
const pollIntervalMs = Number(process.env.POLL_INTERVAL_MS || 1000);

async function buildDefaultDcrPayload() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  return {
    application_type: 'native',
    client_name: process.env.DCR_CLIENT_NAME || 'Issue Recovery Demo Client',
    redirect_uris: [process.env.DCR_REDIRECT_URI || 'https://app.example.org/callback'],
    jwks: {
      keys: [{
        ...publicJwk,
        use: 'sig',
        alg: 'ES256',
        kid: process.env.DCR_JWK_KID || 'issue-recovery-dcr-key-001',
      }],
    },
    ext_device_info: {
      device_id: process.env.DCR_DEVICE_ID || 'issue-recovery-device-001',
      device_name: process.env.DCR_DEVICE_NAME || 'Issue Recovery Device',
      os: process.env.DCR_DEVICE_OS || 'macOS',
      os_version: process.env.DCR_DEVICE_OS_VERSION || 'local-demo',
    },
  };
}

function toDemoJwt(payload) {
  const header = { alg: 'RS256', typ: 'JWT' };
  return `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.demo-signature`;
}

const controllerIdToken = process.env.CONTROLLER_ID_TOKEN || toDemoJwt({
  sub: process.env.CONTROLLER_SUB || 'controller-sub-001',
  email: controllerEmail,
  tenant_id: tenantId,
  aud: process.env.CONTROLLER_AUD || 'gw-local-demo',
});

const pdfBase64 = fs.readFileSync(pdfPath).toString('base64');
const baseBundle = cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE);
const claims = {
  ...baseBundle.data[0].meta.claims,
  'org.schema.Organization.alternateName': tenantId,
  'org.schema.Organization.identifier.value': tenantId,
  'org.schema.Organization.identifier.additionalType': 'TAX',
  'org.schema.Organization.legalName': process.env.ORGANIZATION_LEGAL_NAME || 'Acme Organization SL',
  'org.schema.Organization.name': process.env.ORGANIZATION_NAME || 'Acme Org',
  'org.schema.Organization.address.addressCountry': hostJurisdiction,
  'org.schema.Person.email': controllerEmail,
  'org.schema.Person.hasOccupation': controllerRole,
  'org.schema.Service.category': sector,
  'org.schema.Service.serviceType': process.env.SERVICE_TYPE || 'organization/Composition.cruds,organization/ResearchSubject.rs',
};

const client = new NodeHttpClient({ baseUrl });
const sdk = new OrganizationControllerSdk(client);
const hostCtx = {
  ...cloneExample(EXAMPLE_HOST_ROUTE_CONTEXT),
  jurisdiction: hostJurisdiction,
  hostNetwork,
};
const tenantCtx = {
  ...cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
  tenantId,
  jurisdiction: tenantJurisdiction,
  sector,
};

const dcrPayload = {
  ...cloneExample(EXAMPLE_EMPLOYEE_DEVICE_ACTIVATION_INPUT.dcrPayload),
  ...(await buildDefaultDcrPayload()),
};

const result = await recoverOrganizationControllerWithIssueWithDeps({
  hostCtx,
  tenantCtx,
  input: {
    issueInput: {
      claims,
      controller: cloneExample(baseBundle.data[0].resource.controller),
      organization: cloneExample(baseBundle.data[0].resource.organization),
      legalRepresentativePayload: cloneExample(baseBundle.data[0].resource.legalRepresentativePayload),
      verification: {
        ...(cloneExample(baseBundle.data[0].resource.verification) || {}),
        resourceType: process.env.VERIFICATION_RESOURCE_TYPE || 'contract',
      },
      attachments: [{ type: 'application/pdf', data: { base64: pdfBase64 } }],
    },
    controllerIdToken,
    dcrPayload,
    issuePollOptions: { timeoutMs: pollTimeoutMs, intervalMs: pollIntervalMs },
    activationPollOptions: { timeoutMs: pollTimeoutMs, intervalMs: pollIntervalMs },
  },
  submitLegalOrganizationIssue: sdk.submitLegalOrganizationIssue.bind(sdk),
  identityTokenExchangePath: client.identityTokenExchangePath.bind(client),
  identityTokenExchangePollPath: client.identityTokenExchangePollPath.bind(client),
  identityDeviceDcrPath: client.identityDeviceDcrPath.bind(client),
  identityDeviceDcrPollPath: client.identityDeviceDcrPollPath.bind(client),
  submitAndPollWithBearerToken: async (bearerToken, submitPath, pollPath, payload, pollOptions) => {
    const authClient = new NodeHttpClient({ baseUrl, bearerToken });
    return authClient.submitAndPoll(submitPath, pollPath, payload, pollOptions);
  },
});

console.log(JSON.stringify({
  baseUrl,
  tenantId,
  sector,
  pdfPath,
  issueSubmitStatus: result.issue.submit.status,
  issuePollStatus: result.issue.poll.status,
  activationCode: result.activationCode,
  exchangePollStatus: result.activation.exchange.poll.status,
  dcrPollStatus: result.activation.dcr.poll.status,
  initialAccessTokenPresent: Boolean(result.activation.initialAccessToken),
  dcrBody: result.activation.dcr.poll.body,
}, null, 2));

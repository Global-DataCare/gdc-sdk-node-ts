import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXAMPLE_EMPLOYEE_DEVICE_DCR_RESPONSE,
  EXAMPLE_EMPLOYEE_DEVICE_EXCHANGE_RESPONSE,
  EXAMPLE_EMPLOYEE_DEVICE_ACTIVATION_INPUT,
  EXAMPLE_HOST_ROUTE_CONTEXT,
  EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE,
  EXAMPLE_TENANT_ROUTE_CONTEXT,
  cloneExample,
} from 'gdc-common-utils-ts/examples';

import { recoverOrganizationControllerWithIssueWithDeps } from '../dist/index.js';

test('recoverOrganizationControllerWithIssueWithDeps performs Organization/_issue then exchange then dcr', async () => {
  const calls = [];

  const result = await recoverOrganizationControllerWithIssueWithDeps({
    hostCtx: cloneExample(EXAMPLE_HOST_ROUTE_CONTEXT),
    tenantCtx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    input: {
      issueInput: {
        claims: cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.data[0].meta.claims),
        controller: cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.data[0].resource.controller),
        organization: cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.data[0].resource.organization),
        legalRepresentativePayload: cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.data[0].resource.legalRepresentativePayload),
        verification: cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.data[0].resource.verification),
        attachments: cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.attachments),
      },
      controllerIdToken: 'controller-id-token-001',
      dcrPayload: cloneExample(EXAMPLE_EMPLOYEE_DEVICE_ACTIVATION_INPUT.dcrPayload),
      issuePollOptions: { timeoutMs: 30_000, intervalMs: 2_000 },
      activationPollOptions: { timeoutMs: 10_000, intervalMs: 500 },
    },
    submitLegalOrganizationIssue: async (...args) => {
      calls.push(['submitLegalOrganizationIssue', args]);
      return {
        submit: { status: 202, body: {} },
        poll: {
          status: 200,
          attempts: 1,
          body: {
            data: [{
              meta: {
                claims: {
                  'org.schema.IndividualProduct.serialNumber': 'lic-reactivation-001',
                },
              },
            }],
          },
        },
      };
    },
    identityTokenExchangePath: () => '/exchange',
    identityTokenExchangePollPath: () => '/exchange-response',
    identityDeviceDcrPath: () => '/dcr',
    identityDeviceDcrPollPath: () => '/dcr-response',
    submitAndPollWithBearerToken: async (bearerToken, submitPath, pollPath, payload) => {
      calls.push(['submitAndPollWithBearerToken', { bearerToken, submitPath, pollPath, payload }]);
      if (submitPath === '/exchange') {
        return cloneExample(EXAMPLE_EMPLOYEE_DEVICE_EXCHANGE_RESPONSE);
      }
      return cloneExample(EXAMPLE_EMPLOYEE_DEVICE_DCR_RESPONSE);
    },
  });

  assert.equal(calls.length, 3);
  assert.equal(calls[0][0], 'submitLegalOrganizationIssue');
  assert.equal(calls[1][1].bearerToken, 'controller-id-token-001');
  assert.equal(calls[1][1].payload.subject_token, 'lic-reactivation-001');
  assert.equal(calls[2][1].bearerToken, 'initial-access-001');
  assert.equal(result.activationCode, 'lic-reactivation-001');
  assert.equal(result.activation.initialAccessToken, 'initial-access-001');
});

test('recoverOrganizationControllerWithIssueWithDeps rejects Organization/_issue responses without an activation code', async () => {
  await assert.rejects(
    recoverOrganizationControllerWithIssueWithDeps({
      hostCtx: cloneExample(EXAMPLE_HOST_ROUTE_CONTEXT),
      tenantCtx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
      input: {
        issueInput: {
          claims: cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.data[0].meta.claims),
          controller: cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.data[0].resource.controller),
        },
        controllerIdToken: 'controller-id-token-001',
        dcrPayload: cloneExample(EXAMPLE_EMPLOYEE_DEVICE_ACTIVATION_INPUT.dcrPayload),
      },
      submitLegalOrganizationIssue: async () => ({
        submit: { status: 202, body: {} },
        poll: {
          status: 200,
          attempts: 1,
          body: { data: [{ meta: { claims: {} } }] },
        },
      }),
      identityTokenExchangePath: () => '/exchange',
      identityTokenExchangePollPath: () => '/exchange-response',
      identityDeviceDcrPath: () => '/dcr',
      identityDeviceDcrPollPath: () => '/dcr-response',
      submitAndPollWithBearerToken: async () => {
        throw new Error('should not reach exchange/dcr when activation code is missing');
      },
    }),
    /missing org\.schema\.IndividualProduct\.serialNumber/,
  );
});

test('recoverOrganizationControllerWithIssueWithDeps surfaces Organization/_issue OperationOutcome diagnostics', async () => {
  await assert.rejects(
    recoverOrganizationControllerWithIssueWithDeps({
      hostCtx: cloneExample(EXAMPLE_HOST_ROUTE_CONTEXT),
      tenantCtx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
      input: {
        issueInput: {
          claims: cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.data[0].meta.claims),
          controller: cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.data[0].resource.controller),
        },
        controllerIdToken: 'controller-id-token-001',
        dcrPayload: cloneExample(EXAMPLE_EMPLOYEE_DEVICE_ACTIVATION_INPUT.dcrPayload),
      },
      submitLegalOrganizationIssue: async () => ({
        submit: { status: 202, body: {} },
        poll: {
          status: 200,
          attempts: 1,
          body: {
            data: [{
              response: {
                status: '400',
                outcome: {
                  issue: [{ diagnostics: 'PDF is missing signed organization legalName.' }],
                },
              },
            }],
          },
        },
      }),
      identityTokenExchangePath: () => '/exchange',
      identityTokenExchangePollPath: () => '/exchange-response',
      identityDeviceDcrPath: () => '/dcr',
      identityDeviceDcrPollPath: () => '/dcr-response',
      submitAndPollWithBearerToken: async () => {
        throw new Error('should not reach exchange/dcr when _issue failed');
      },
    }),
    /Organization\/_issue failed: PDF is missing signed organization legalName\./,
  );
});

// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
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

import {
  readLegalOrganizationCredentialReissuanceActivationCode,
  recoverOrganizationControllerWithCredentialReissuanceWithDeps,
} from '../dist/index.js';

test('readLegalOrganizationCredentialReissuanceActivationCode reads the governed reissue result', () => {
  assert.equal(readLegalOrganizationCredentialReissuanceActivationCode({
    poll: { body: { body: { data: [{ resource: { meta: { claims: {
      'org.schema.IndividualProduct.serialNumber': 'lic-controller-code',
    } } } }] } } },
  }), 'lic-controller-code');
});

test('readLegalOrganizationCredentialReissuanceActivationCode still reads deprecated entry.meta claims', () => {
  assert.equal(readLegalOrganizationCredentialReissuanceActivationCode({
    poll: { body: { data: [{ meta: { claims: {
      'org.schema.IndividualProduct.serialNumber': 'legacy-entry-meta-code',
    } } }] } },
  }), 'legacy-entry-meta-code');
});

test('readLegalOrganizationCredentialReissuanceActivationCode prefers canonical claims when both placements exist', () => {
  assert.equal(readLegalOrganizationCredentialReissuanceActivationCode({
    poll: { body: { data: [{
      meta: { claims: { 'org.schema.IndividualProduct.serialNumber': 'legacy-code' } },
      resource: { meta: { claims: { 'org.schema.IndividualProduct.serialNumber': 'canonical-code' } } },
    }] } },
  }), 'canonical-code');
});

test('readLegalOrganizationCredentialReissuanceActivationCode accepts a wrapped legacy License response claim', () => {
  assert.equal(readLegalOrganizationCredentialReissuanceActivationCode({
    poll: { body: { body: { result: { data: [
      { type: 'OperationOutcome', id: 'unrelated-job-id' },
      { type: 'License:Issued', meta: { claims: {
        'org.schema.IndividualProduct.serialNumber': 'lic-wrapped-controller-code',
      } } },
    ] } } } },
  }), 'lic-wrapped-controller-code');
});

test('readLegalOrganizationCredentialReissuanceActivationCode accepts only a typed legacy License issued id fallback', () => {
  assert.equal(readLegalOrganizationCredentialReissuanceActivationCode({
    poll: { body: { response: { body: { data: [
      { type: 'OperationOutcome', id: 'unrelated-job-id' },
      { type: 'License:Issued', id: 'lic-issued-entry-id' },
    ] } } } },
  }), 'lic-issued-entry-id');
});

test('recoverOrganizationControllerWithCredentialReissuanceWithDeps performs credential reissuance then exchange then dcr', async () => {
  const calls = [];

  const result = await recoverOrganizationControllerWithCredentialReissuanceWithDeps({
    hostCtx: cloneExample(EXAMPLE_HOST_ROUTE_CONTEXT),
    tenantCtx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    input: {
      credentialReissuanceInput: {
        claims: cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.data[0].resource.meta.claims),
        controller: cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.data[0].resource.controller),
        organization: cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.data[0].resource.organization),
        legalRepresentativePayload: cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.data[0].resource.legalRepresentativePayload),
        verification: cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.data[0].resource.verification),
        attachments: cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.attachments),
      },
      controllerIdToken: 'controller-id-token-001',
      dcrPayload: cloneExample(EXAMPLE_EMPLOYEE_DEVICE_ACTIVATION_INPUT.dcrPayload),
      credentialReissuancePollOptions: { timeoutMs: 30_000, intervalMs: 2_000 },
      activationPollOptions: { timeoutMs: 10_000, intervalMs: 500 },
    },
    submitLegalOrganizationCredentialReissuance: async (...args) => {
      calls.push(['submitLegalOrganizationCredentialReissuance', args]);
      return {
        submit: { status: 202, body: {} },
        poll: {
          status: 200,
          attempts: 1,
          body: {
            data: [{
              resource: {
                meta: {
                  claims: {
                    'org.schema.IndividualProduct.serialNumber': 'lic-reactivation-001',
                  },
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
  assert.equal(calls[0][0], 'submitLegalOrganizationCredentialReissuance');
  assert.equal(calls[1][1].bearerToken, 'controller-id-token-001');
  assert.equal(calls[1][1].payload.body.subject_token, 'lic-reactivation-001');
  assert.equal(calls[2][1].bearerToken, 'initial-access-001');
  assert.equal(result.activationCode, 'lic-reactivation-001');
  assert.equal(result.activation.initialAccessToken, 'initial-access-001');
});

test('recoverOrganizationControllerWithCredentialReissuanceWithDeps rejects responses without an activation code', async () => {
  await assert.rejects(
    recoverOrganizationControllerWithCredentialReissuanceWithDeps({
      hostCtx: cloneExample(EXAMPLE_HOST_ROUTE_CONTEXT),
      tenantCtx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
      input: {
        issueInput: {
          claims: cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.data[0].resource.meta.claims),
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

test('recoverOrganizationControllerWithCredentialReissuanceWithDeps surfaces Organization/_issue diagnostics', async () => {
  await assert.rejects(
    recoverOrganizationControllerWithCredentialReissuanceWithDeps({
      hostCtx: cloneExample(EXAMPLE_HOST_ROUTE_CONTEXT),
      tenantCtx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
      input: {
        issueInput: {
          claims: cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE.data[0].resource.meta.claims),
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

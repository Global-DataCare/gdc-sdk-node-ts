import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OrganizationControllerSdk,
  HostOnboardingSdk,
  recoverOrganizationControllerWithIssueWithDeps,
} from '../dist/index.js';
import {
  OrganizationLifecycleEditor,
  readLicenseListRecords,
  summarizeLicenseListRecords,
} from 'gdc-common-utils-ts';
import { ActorCapabilities } from 'gdc-common-utils-ts/constants/actor-session';
import {
  ClaimsIndividualProductSchemaorg,
  ClaimsOrganizationSchemaorg,
} from 'gdc-common-utils-ts/constants/schemaorg';
import {
  EXAMPLE_ACTIVATE_ORGANIZATION_FROM_ICA_PROOF_INPUT,
  EXAMPLE_EMPLOYEE_DEVICE_ACTIVATION_INPUT,
  EXAMPLE_EMPLOYEE_DEVICE_DCR_RESPONSE,
  EXAMPLE_EMPLOYEE_DEVICE_EXCHANGE_RESPONSE,
  EXAMPLE_GW_ORGANIZATION_ACTIVATE_ACCEPTED_RESPONSE,
  EXAMPLE_HOST_ROUTE_CONTEXT,
  EXAMPLE_LEGAL_ORGANIZATION_ORDER_INPUT,
  EXAMPLE_LEGAL_ORGANIZATION_ORDER_RESPONSE,
  EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE,
  EXAMPLE_LICENSE_ACCEPTED_OFFER_ID,
  EXAMPLE_LICENSE_ACTIVE_RECORD,
  EXAMPLE_LICENSE_LIST_RESPONSE_BODY,
  EXAMPLE_LICENSE_SEAT_UUID_SECONDARY,
  EXAMPLE_TENANT_ROUTE_CONTEXT,
  cloneExample,
} from 'gdc-common-utils-ts/examples';

/**
 * This 101 intentionally stays narrow.
 *
 * It is the canonical controller lifecycle contract for Node/BFF integrators:
 * - onboard the organization (new `_transaction` or legacy `_activate`)
 * - optionally materialize additional purchased seats
 * - prove `Organization/_issue` can rebind the current controller device
 * - prove `_issue` reuses the already-assigned controller seat
 * - prove seats bought after the original registration remain untouched
 * - only then disable and purge the tenant
 *
 * It does not cover employees, SMART, dialogue, or clinical flows.
 */
test('101: organization controller lifecycle preserves contracted seats across Organization/_issue before disable and purge', async (t) => {
  await t.test('new Organization/_transaction lifecycle', async () => {
    await exerciseOrganizationControllerLifecycle({ mode: 'transaction' });
  });

  await t.test('legacy ICA _verify -> Organization/_activate lifecycle', async () => {
    await exerciseOrganizationControllerLifecycle({ mode: 'legacy-activate' });
  });
});

/**
 * Runs the canonical controller-only lifecycle against one mocked runtime
 * client while still exercising the public SDK surface.
 */
async function exerciseOrganizationControllerLifecycle({ mode }) {
  const hostCtx = cloneExample(EXAMPLE_HOST_ROUTE_CONTEXT);
  const tenantCtx = cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT);
  const issueInput = buildIssueInput();
  const tenantLifecycleInput = buildTenantLifecycleInput(issueInput.claims);
  const expandedLicenseListBody = buildExpandedLicenseListResponseBody();
  const controllerSeatSerial = String(
    EXAMPLE_LICENSE_ACTIVE_RECORD.claims[ClaimsIndividualProductSchemaorg.serialNumber],
  );
  const expectedAdditionalSummary = summarizeLicenseListRecords(expandedLicenseListBody);
  const expectedAdditionalRecords = readLicenseListRecords(expandedLicenseListBody);
  const operations = [];

  let currentLicenseListBody = cloneExample(EXAMPLE_LICENSE_LIST_RESPONSE_BODY);

  const runtimeClient = {
    async submitLegalOrganizationVerificationTransaction(ctx, input) {
      operations.push('organization-transaction');
      assert.deepEqual(ctx, hostCtx);
      assert.deepEqual(input, issueInput);
      return buildAcceptedLifecycleResponse();
    },
    async activateOrganizationInGatewayFromIcaProof(ctx, input) {
      operations.push('organization-activate');
      assert.deepEqual(ctx, hostCtx);
      assert.deepEqual(input, cloneExample(EXAMPLE_ACTIVATE_ORGANIZATION_FROM_ICA_PROOF_INPUT));
      return cloneExample(EXAMPLE_GW_ORGANIZATION_ACTIVATE_ACCEPTED_RESPONSE);
    },
    async confirmOrganizationLicenseOrder(ctx, input) {
      operations.push('organization-confirm-order');
      assert.deepEqual(ctx, tenantCtx);
      assert.equal(input.offerId, EXAMPLE_LICENSE_ACCEPTED_OFFER_ID);
      currentLicenseListBody = cloneExample(expandedLicenseListBody);
      return cloneExample(EXAMPLE_LEGAL_ORGANIZATION_ORDER_RESPONSE);
    },
    async listOrganizationLicenses(ctx, input) {
      operations.push('organization-list-licenses');
      assert.deepEqual(ctx, tenantCtx);
      assert.deepEqual(input, {});
      return {
        submit: { status: 202, body: {} },
        poll: {
          status: 200,
          attempts: 1,
          body: cloneExample(currentLicenseListBody),
        },
      };
    },
    async submitLegalOrganizationIssue(ctx, input) {
      operations.push('organization-issue');
      assert.deepEqual(ctx, hostCtx);
      assert.deepEqual(input, issueInput);
      return {
        submit: { status: 202, body: {} },
        poll: {
          status: 200,
          attempts: 1,
          body: {
            data: [{
              meta: {
                claims: {
                  [ClaimsIndividualProductSchemaorg.serialNumber]: controllerSeatSerial,
                },
              },
            }],
          },
        },
      };
    },
    async disableTenant(ctx, input) {
      operations.push('organization-disable-tenant');
      assert.deepEqual(ctx, hostCtx);
      assert.equal(
        input.organizationEditor.getState().identifierValue,
        tenantLifecycleInput.organizationEditor.getState().identifierValue,
      );
      return buildAcceptedLifecycleResponse({ status: 'disabled' });
    },
    async purgeTenant(ctx, input) {
      operations.push('organization-purge-tenant');
      assert.deepEqual(ctx, hostCtx);
      assert.equal(
        input.organizationEditor.getState().identifierValue,
        tenantLifecycleInput.organizationEditor.getState().identifierValue,
      );
      return buildAcceptedLifecycleResponse({ status: 'purged' });
    },
  };

  const organizationControllerSdk = new OrganizationControllerSdk(runtimeClient, [
    ActorCapabilities.OrganizationDisableTenant,
    ActorCapabilities.OrganizationPurgeTenant,
  ]);
  const hostOnboardingSdk = new HostOnboardingSdk(runtimeClient, [
    ActorCapabilities.HostingActivateOrganization,
  ]);

  if (mode === 'transaction') {
    const verification = await organizationControllerSdk.submitLegalOrganizationVerificationTransaction(hostCtx, issueInput);
    assert.equal(verification.poll.status, 200);
  } else {
    const activation = await hostOnboardingSdk.activateOrganizationInGatewayFromIcaProof(
      hostCtx,
      cloneExample(EXAMPLE_ACTIVATE_ORGANIZATION_FROM_ICA_PROOF_INPUT),
    );
    assert.equal(activation.poll.status, 200);
  }

  const initialLicenses = await organizationControllerSdk.listLicenses(tenantCtx);
  assert.deepEqual(
    summarizeLicenseListRecords(initialLicenses.poll.body),
    summarizeLicenseListRecords(EXAMPLE_LICENSE_LIST_RESPONSE_BODY),
    'Initial tenant seats must match the baseline contracted organization state before any extra order is confirmed.',
  );

  const orderInput = cloneExample(EXAMPLE_LEGAL_ORGANIZATION_ORDER_INPUT);
  orderInput.offerId = EXAMPLE_LICENSE_ACCEPTED_OFFER_ID;
  const confirmedOrder = await organizationControllerSdk.confirmOrganizationLicenseOrder(tenantCtx, orderInput);
  assert.equal(confirmedOrder.poll.status, 200);

  const expandedLicenses = await organizationControllerSdk.listLicenses(tenantCtx);
  assert.deepEqual(
    summarizeLicenseListRecords(expandedLicenses.poll.body),
    expectedAdditionalSummary,
    'Confirming an already-accepted organization order must materialize the additional contracted seats.',
  );

  const recovery = await recoverOrganizationControllerWithIssueWithDeps({
    hostCtx,
    tenantCtx,
    input: {
      issueInput,
      controllerIdToken: EXAMPLE_EMPLOYEE_DEVICE_ACTIVATION_INPUT.idToken,
      dcrPayload: cloneExample(EXAMPLE_EMPLOYEE_DEVICE_ACTIVATION_INPUT.dcrPayload),
    },
    submitLegalOrganizationIssue: organizationControllerSdk.submitLegalOrganizationIssue.bind(organizationControllerSdk),
    identityTokenExchangePath: () => '/auth/_exchange',
    identityTokenExchangePollPath: () => '/auth/_exchange-response',
    identityDeviceDcrPath: () => '/auth/_dcr',
    identityDeviceDcrPollPath: () => '/auth/_dcr-response',
    submitAndPollWithBearerToken: async (bearerToken, submitPath, pollPath, payload) => {
      if (submitPath.endsWith('_exchange')) {
        operations.push('organization-issue-exchange');
        assert.equal(bearerToken, EXAMPLE_EMPLOYEE_DEVICE_ACTIVATION_INPUT.idToken);
        assert.equal(payload.subject_token, controllerSeatSerial);
        assert.equal(pollPath, '/auth/_exchange-response');
        return cloneExample(EXAMPLE_EMPLOYEE_DEVICE_EXCHANGE_RESPONSE);
      }

      operations.push('organization-issue-dcr');
      assert.equal(bearerToken, EXAMPLE_EMPLOYEE_DEVICE_EXCHANGE_RESPONSE.poll.body.body.initial_access_token);
      assert.equal(payload.code, controllerSeatSerial);
      assert.equal(pollPath, '/auth/_dcr-response');
      return cloneExample(EXAMPLE_EMPLOYEE_DEVICE_DCR_RESPONSE);
    },
  });

  assert.equal(
    recovery.activationCode,
    controllerSeatSerial,
    'Organization/_issue must reissue the current controller seat instead of consuming one newly expanded seat.',
  );
  assert.equal(recovery.activation.exchange.poll.status, 200);
  assert.equal(recovery.activation.dcr.poll.status, 200);

  const postIssueLicenses = await organizationControllerSdk.listLicenses(tenantCtx);
  assert.deepEqual(
    summarizeLicenseListRecords(postIssueLicenses.poll.body),
    expectedAdditionalSummary,
    'Organization/_issue must not reduce or consume seats that were bought after the original registration.',
  );
  assert.deepEqual(
    readLicenseListRecords(postIssueLicenses.poll.body),
    expectedAdditionalRecords,
    'Organization/_issue must preserve the expanded seat inventory exactly while the controller rebinds the current device.',
  );

  const disabledTenant = await organizationControllerSdk.disableTenant(hostCtx, tenantLifecycleInput);
  assert.equal(disabledTenant.poll.status, 200);

  const purgedTenant = await organizationControllerSdk.purgeTenant(hostCtx, tenantLifecycleInput);
  assert.equal(purgedTenant.poll.status, 200);

  const expectedOperations = mode === 'transaction'
    ? [
        'organization-transaction',
        'organization-list-licenses',
        'organization-confirm-order',
        'organization-list-licenses',
        'organization-issue',
        'organization-issue-exchange',
        'organization-issue-dcr',
        'organization-list-licenses',
        'organization-disable-tenant',
        'organization-purge-tenant',
      ]
    : [
        'organization-activate',
        'organization-list-licenses',
        'organization-confirm-order',
        'organization-list-licenses',
        'organization-issue',
        'organization-issue-exchange',
        'organization-issue-dcr',
        'organization-list-licenses',
        'organization-disable-tenant',
        'organization-purge-tenant',
      ];

  assert.deepEqual(
    operations,
    expectedOperations,
    'The canonical controller lifecycle must always reissue/rebind before disable and purge, and it must never run the host activation paths in parallel.',
  );
}

/**
 * Normalizes the host-side `_transaction` / `_issue` payload from the shared
 * verification bundle so the test stays aligned with `common-utils`.
 */
function buildIssueInput() {
  const bundle = cloneExample(EXAMPLE_LEGAL_ORGANIZATION_VERIFICATION_TRANSACTION_BUNDLE);
  return {
    claims: bundle.data[0].meta.claims,
    controller: bundle.data[0].resource.controller,
    organization: bundle.data[0].resource.organization,
    legalRepresentativePayload: bundle.data[0].resource.legalRepresentativePayload,
    verification: bundle.data[0].resource.verification,
    attachments: bundle.attachments,
  };
}

/**
 * Uses the canonical lifecycle editor instead of raw ad hoc objects, because
 * disable/purge must stay aligned with the shared tenant lifecycle contract.
 */
function buildTenantLifecycleInput(claims) {
  return {
    organizationEditor: new OrganizationLifecycleEditor()
      .setIdentifierValue(String(claims[ClaimsOrganizationSchemaorg.identifierValue]))
      .setTaxId(String(claims[ClaimsOrganizationSchemaorg.taxId])),
  };
}

/**
 * Simulates one post-registration seat expansion while preserving the example
 * vocabulary and shape from `gdc-common-utils-ts`.
 */
function buildExpandedLicenseListResponseBody() {
  const expanded = cloneExample(EXAMPLE_LICENSE_LIST_RESPONSE_BODY);
  const additionalSeat = cloneExample(expanded.data[expanded.data.length - 1]);
  additionalSeat.meta.claims[ClaimsIndividualProductSchemaorg.serialNumber] = EXAMPLE_LICENSE_SEAT_UUID_SECONDARY;
  expanded.data.push(additionalSeat);
  return expanded;
}

function buildAcceptedLifecycleResponse(body = {}) {
  return {
    submit: { status: 202, body: {} },
    poll: { status: 200, body, attempts: 1 },
  };
}

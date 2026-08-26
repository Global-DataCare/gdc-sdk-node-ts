/**
 * 101 note:
 * - `gdc-common-utils-ts` owns the canonical step-by-step editors/readers and payload examples.
 * - This file starts after that shared authoring step and teaches the highest-level `sdk-node` runtime surface for this topic.
 * - Reuse `sdk-core` and `common-utils` contracts instead of re-teaching raw claims or low-level editors here.
 * - Read `docs/101-README.md` for the ordered path and keep actor role plus submit/poll explicit.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OrganizationControllerSdk,
  HostOnboardingSdk,
  recoverOrganizationControllerWithCredentialReissuanceWithDeps,
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
 * 101 boundary:
 * - this test teaches the highest-level controller/runtime lifecycle surface
 *   currently owned by `gdc-sdk-node-ts`
 * - it assumes lower layers already defined the shared employee/editor and
 *   communication semantics in `gdc-common-utils-ts`
 * - continue downward when you need those lower layers:
 *   - `gdc-sdk-core-ts/tests/101-employees.test.mjs`
 *   - `gdc-common-utils-ts/__tests__/101-employee-examples.test.ts`
 *   - `gdc-common-utils-ts/__tests__/101-communication-profile-wallet-e2e.test.ts`
 *
 * This 101 intentionally stays narrow.
 *
 * It is the canonical controller lifecycle contract for Node/BFF integrators:
 * - onboard the organization (new `_transaction` or legacy `_activate`)
 * - optionally materialize additional purchased seats
 * - prove `Organization/_issue` refreshes the ICA organization credentials and
 *   exposes activation material for the already-assigned controller seat
 * - prove `Token/_exchange -> Device/_dcr` rebinds the controller device
 * - prove seats bought after the original registration remain untouched
 * - only then disable and purge the tenant
 *
 * It does not cover employees, SMART, dialogue, or clinical flows.
 *
 * Current canonical controller-teaching rule:
 * - treat the controller/responsible-party role as the current canonical
 *   beginner identity narrative
 * - do not force older executive-director examples into new 101 flows
 */
test('101: organization credential reissuance preserves controller seats before device DCR and tenant teardown', async (t) => {
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
    async submitLegalOrganizationCredentialReissuance(ctx, input) {
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
    async getTenantLifecycleStatus(ctx) {
      operations.push('organization-tenant-status');
      assert.deepEqual(ctx, hostCtx);
      return buildAcceptedLifecycleResponse({ status: 'active', activeEmployees: 0 });
    },
    async disableTenantDescendants(ctx, input) {
      operations.push(`organization-disable-${input.descendantKind}`);
      assert.deepEqual(ctx, hostCtx);
      return buildAcceptedLifecycleResponse({ status: 'disabled' });
    },
    async purgeTenantDescendants(ctx, input) {
      operations.push(`organization-purge-${input.descendantKind}`);
      assert.deepEqual(ctx, hostCtx);
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

  const recovery = await recoverOrganizationControllerWithCredentialReissuanceWithDeps({
    hostCtx,
    tenantCtx,
    input: {
      credentialReissuanceInput: issueInput,
      controllerIdToken: EXAMPLE_EMPLOYEE_DEVICE_ACTIVATION_INPUT.idToken,
      dcrPayload: cloneExample(EXAMPLE_EMPLOYEE_DEVICE_ACTIVATION_INPUT.dcrPayload),
    },
    submitLegalOrganizationCredentialReissuance:
      organizationControllerSdk.submitLegalOrganizationCredentialReissuance.bind(organizationControllerSdk),
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
    'Organization/_issue must expose activation material for the current controller seat instead of consuming one newly expanded seat.',
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
    'Organization/_issue must preserve the expanded seat inventory; the later Device/_dcr operation performs the device rebind.',
  );

  const disabledTenant = await organizationControllerSdk.disableTenant(hostCtx, tenantLifecycleInput);
  assert.equal(disabledTenant.poll.status, 200);

  const tenantStatus = await organizationControllerSdk.getTenantLifecycleStatus(hostCtx, tenantLifecycleInput);
  assert.equal(tenantStatus.poll.status, 200);
  await organizationControllerSdk.disableTenantDescendants(hostCtx, { ...tenantLifecycleInput, descendantKind: 'employees' });
  await organizationControllerSdk.purgeTenantDescendants(hostCtx, { ...tenantLifecycleInput, descendantKind: 'employees' });

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
        'organization-tenant-status',
        'organization-disable-employees',
        'organization-purge-employees',
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
        'organization-tenant-status',
        'organization-disable-employees',
        'organization-purge-employees',
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
    claims: bundle.data[0].resource.meta.claims,
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

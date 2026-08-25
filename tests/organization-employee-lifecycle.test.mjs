import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * Flow contract: interactive provisioning is never left half-created. A
 * no-seat response must complete Offer/Order, retry Employee creation and only
 * then issue the activation credential; batch callers may omit continuation.
 */
import {
  EXAMPLE_ACCOUNT_OWNER_ID,
  EXAMPLE_ACTIVATION_GRANT_CREATED_AT,
  EXAMPLE_ACTIVATION_GRANT_EXPIRES_AT,
  EXAMPLE_DEMO_PORTAL_ID_TOKEN,
  EXAMPLE_DCR_REDIRECT_URI,
  EXAMPLE_CLIENT_INSTANCE_UUID,
  EXAMPLE_EMAIL_CONTROLLER_ORG,
  EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE,
  EXAMPLE_EMPLOYEE_ACTIVATION_CODE,
  EXAMPLE_EMPLOYEE_DCR_CLIENT_NAME,
  EXAMPLE_EMPLOYEE_LIFECYCLE_RECORD,
  EXAMPLE_EMPLOYEE_SEARCH_RESPONSE_BODY,
  EXAMPLE_LICENSE_ISSUE_INPUT,
  EXAMPLE_LICENSE_ISSUE_RESPONSE_BODY,
  EXAMPLE_LICENSE_LIST_RESPONSE_BODY_WITH_DEVICES,
  EXAMPLE_PROFILE_PIN,
  EXAMPLE_PROVIDER_ORGANIZATION_DID,
  EXAMPLE_TENANT_ROUTE_CONTEXT,
  buildExampleEmployeeClaims,
  buildExampleSubmitAndPollResult,
} from 'gdc-common-utils-ts/examples';
import {
  createEmployeeActivationGrant,
  enrollInvitedOrganizationEmployeeWithDeps,
  listOrganizationEmployeeLifecycleWithDeps,
  provisionOrganizationEmployeeWithDeps,
  readEmployeeLicenseMaxDevices,
  readEmployeeLicenseOfferId,
} from '../dist/index.js';

test('readEmployeeLicenseOfferId exposes the asynchronous payment continuation without issuing a seat', () => {
  const offerId = 'urn:cds:ES:v1:health-care:product:org.schema:Offer:employee-seat-async';
  const response = buildExampleSubmitAndPollResult({
    resourceType: 'Bundle',
    type: 'batch-response',
    data: [{
      type: 'Employee-license-offer-v1.0',
      meta: { claims: { 'org.schema.Offer.identifier': offerId } },
      response: { status: '200' },
    }],
  });
  assert.equal(readEmployeeLicenseOfferId(response.poll.body), offerId);
});

test('provisionOrganizationEmployeeWithDeps owns create plus license issue orchestration', async () => {
  const result = await provisionOrganizationEmployeeWithDeps(
    EXAMPLE_TENANT_ROUTE_CONTEXT,
    {
      creation: { employeeClaims: buildExampleEmployeeClaims(EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE) },
      invitation: {
        ...EXAMPLE_LICENSE_ISSUE_INPUT,
        subjectDid: EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE.identifier,
      },
    },
    {
      createEmployee: async () => buildExampleSubmitAndPollResult(EXAMPLE_EMPLOYEE_SEARCH_RESPONSE_BODY),
      issueLicense: async () => buildExampleSubmitAndPollResult(EXAMPLE_LICENSE_ISSUE_RESPONSE_BODY),
    },
  );
  assert.equal(result.activationCode, EXAMPLE_EMPLOYEE_ACTIVATION_CODE);
});

test('provisionOrganizationEmployeeWithDeps exposes the allowance persisted by License/_issue', async () => {
  const issued = {
    resourceType: 'Bundle',
    type: 'batch-response',
    data: [{
      type: 'License:Issued',
      id: EXAMPLE_EMPLOYEE_ACTIVATION_CODE,
      meta: { maxDevices: 5 },
      response: { status: '201' },
    }],
  };
  const result = await provisionOrganizationEmployeeWithDeps(
    EXAMPLE_TENANT_ROUTE_CONTEXT,
    {
      creation: { employeeClaims: buildExampleEmployeeClaims(EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE) },
      invitation: {
        ...EXAMPLE_LICENSE_ISSUE_INPUT,
        subjectDid: EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE.identifier,
      },
    },
    {
      createEmployee: async () => buildExampleSubmitAndPollResult(EXAMPLE_EMPLOYEE_SEARCH_RESPONSE_BODY),
      issueLicense: async () => buildExampleSubmitAndPollResult(issued),
    },
  );
  assert.equal(result.maxDevices, 5);
  assert.equal(readEmployeeLicenseMaxDevices(issued), 5);
});

test('provisionOrganizationEmployeeWithDeps closes an employee Offer through Order before retrying creation', async () => {
  const offerId = 'urn:cds:ES:v1:health-care:product:org.schema:Offer:employee-seat-1';
  let createCalls = 0;
  const orderCalls = [];
  const result = await provisionOrganizationEmployeeWithDeps(
    EXAMPLE_TENANT_ROUTE_CONTEXT,
    {
      creation: { employeeClaims: buildExampleEmployeeClaims(EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE) },
      invitation: {
        ...EXAMPLE_LICENSE_ISSUE_INPUT,
        subjectDid: EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE.identifier,
      },
      licenseOrder: {
        hostNetwork: 'test',
        additionalClaims: {
          'Order.paymentMethod': 'Stripe',
          'Order.partOfInvoice': 'in_test_employee_seat_1',
        },
      },
    },
    {
      createEmployee: async (_ctx, creation) => {
        createCalls += 1;
        assert.equal(Object.keys(creation.employeeClaims).some(key => key.startsWith('gdc.')), false);
        if (createCalls === 1) {
          return buildExampleSubmitAndPollResult({
            resourceType: 'Bundle',
            type: 'batch-response',
            data: [{
              type: 'Employee-license-offer-v1.0',
              meta: { claims: { 'org.schema.Offer.identifier': offerId } },
              response: { status: '200' },
            }],
          });
        }
        return buildExampleSubmitAndPollResult(EXAMPLE_EMPLOYEE_SEARCH_RESPONSE_BODY);
      },
      confirmLicenseOrder: async (ctx, input) => {
        orderCalls.push([ctx, input]);
        return buildExampleSubmitAndPollResult({ resourceType: 'Bundle', type: 'batch-response', data: [] });
      },
      issueLicense: async () => buildExampleSubmitAndPollResult(EXAMPLE_LICENSE_ISSUE_RESPONSE_BODY),
    },
  );

  assert.equal(createCalls, 2);
  assert.equal(orderCalls.length, 1);
  assert.equal(orderCalls[0][1].offerId, offerId);
  assert.equal(orderCalls[0][1].additionalClaims['Order.partOfInvoice'], 'in_test_employee_seat_1');
  assert.equal(result.activationCode, EXAMPLE_EMPLOYEE_ACTIVATION_CODE);
  assert.ok(result.licenseOrder);
});

test('provisionOrganizationEmployeeWithDeps refuses to leave an employee Offer unresolved', async () => {
  await assert.rejects(
    provisionOrganizationEmployeeWithDeps(
      EXAMPLE_TENANT_ROUTE_CONTEXT,
      {
        creation: { employeeClaims: buildExampleEmployeeClaims(EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE) },
        invitation: {
          ...EXAMPLE_LICENSE_ISSUE_INPUT,
          subjectDid: EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE.identifier,
        },
      },
      {
        createEmployee: async () => buildExampleSubmitAndPollResult({
          resourceType: 'Bundle',
          type: 'batch-response',
          data: [{
            type: 'Employee-license-offer-v1.0',
            meta: { claims: { 'org.schema.Offer.identifier': 'urn:offer:unresolved' } },
            response: { status: '200' },
          }],
        }),
        issueLicense: async () => buildExampleSubmitAndPollResult(EXAMPLE_LICENSE_ISSUE_RESPONSE_BODY),
      },
    ),
    /requires Offer\/Order confirmation before licence issue/,
  );
});

test('provisionOrganizationEmployeeWithDeps stops before license issue when employee creation fails', async () => {
  let licenseIssueCalls = 0;
  await assert.rejects(
    provisionOrganizationEmployeeWithDeps(
      EXAMPLE_TENANT_ROUTE_CONTEXT,
      {
        creation: { employeeClaims: buildExampleEmployeeClaims(EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE) },
        invitation: {
          ...EXAMPLE_LICENSE_ISSUE_INPUT,
          subjectDid: EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE.identifier,
        },
      },
      {
        createEmployee: async () => ({
          submit: { status: 401, body: {
            resourceType: 'OperationOutcome',
            issue: [{ severity: 'error', code: 'security', diagnostics: 'Controller proof is invalid.' }],
          } },
          poll: { status: 400, body: {
            resourceType: 'OperationOutcome',
            issue: [{ severity: 'error', code: 'security', diagnostics: 'Secure request could not be decoded.' }],
          } },
        }),
        issueLicense: async () => {
          licenseIssueCalls += 1;
          return buildExampleSubmitAndPollResult(EXAMPLE_LICENSE_ISSUE_RESPONSE_BODY);
        },
      },
    ),
    /employee creation failed \(HTTP 401\): Controller proof is invalid\./,
  );
  assert.equal(licenseIssueCalls, 0);
});

test('provisionOrganizationEmployeeWithDeps surfaces nested license OperationOutcome diagnostics', async () => {
  await assert.rejects(
    provisionOrganizationEmployeeWithDeps(
      EXAMPLE_TENANT_ROUTE_CONTEXT,
      {
        creation: { employeeClaims: buildExampleEmployeeClaims(EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE) },
        invitation: {
          ...EXAMPLE_LICENSE_ISSUE_INPUT,
          subjectDid: EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE.identifier,
        },
      },
      {
        createEmployee: async () => buildExampleSubmitAndPollResult(EXAMPLE_EMPLOYEE_SEARCH_RESPONSE_BODY),
        issueLicense: async () => ({
          submit: { status: 202, body: {} },
          poll: { status: 200, body: {
            resourceType: 'Bundle',
            type: 'batch-response',
            data: [{
              type: 'License:Issued',
              response: {
                status: '409',
                outcome: {
                  resourceType: 'OperationOutcome',
                  issue: [{ severity: 'error', code: 'conflict', diagnostics: 'No employee licence is available.' }],
                },
              },
            }],
          } },
        }),
      },
    ),
    /licence issue failed \(HTTP 409\): No employee licence is available\./,
  );
});

test('listOrganizationEmployeeLifecycleWithDeps returns the shared typed projection', async () => {
  const result = await listOrganizationEmployeeLifecycleWithDeps(EXAMPLE_TENANT_ROUTE_CONTEXT, {
    searchEmployees: async () => buildExampleSubmitAndPollResult(EXAMPLE_EMPLOYEE_SEARCH_RESPONSE_BODY),
    listLicenses: async () => buildExampleSubmitAndPollResult(EXAMPLE_LICENSE_LIST_RESPONSE_BODY_WITH_DEVICES),
  });
  assert.deepEqual(result[0], EXAMPLE_EMPLOYEE_LIFECYCLE_RECORD);
});

test('enrollInvitedOrganizationEmployeeWithDeps reuses a product-neutral routing grant', async () => {
  const grant = createEmployeeActivationGrant({
    email: EXAMPLE_EMAIL_CONTROLLER_ORG,
    employeeDid: EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE.identifier,
    employeeRoleCode: EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE.role,
    providerDid: EXAMPLE_PROVIDER_ORGANIZATION_DID,
    routeContext: EXAMPLE_TENANT_ROUTE_CONTEXT,
    createdAt: new Date(EXAMPLE_ACTIVATION_GRANT_CREATED_AT),
    expiresAt: new Date(EXAMPLE_ACTIVATION_GRANT_EXPIRES_AT),
  });
  let enrollment;
  const profile = await enrollInvitedOrganizationEmployeeWithDeps({
    ownerId: EXAMPLE_ACCOUNT_OWNER_ID,
    idToken: EXAMPLE_DEMO_PORTAL_ID_TOKEN,
    activationCode: EXAMPLE_LICENSE_ISSUE_RESPONSE_BODY.body.data[0].resource.data[0].id,
    pin: EXAMPLE_PROFILE_PIN,
    grant,
    dcrRedirectUris: [EXAMPLE_DCR_REDIRECT_URI],
    dcrClientName: EXAMPLE_EMPLOYEE_DCR_CLIENT_NAME,
    clientInstanceId: EXAMPLE_CLIENT_INSTANCE_UUID,
  }, {
    enroll: async (value) => {
      enrollment = value;
      return value;
    },
  });
  assert.equal(profile.actorDid, EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE.identifier);
  assert.deepEqual(enrollment.routeContext, EXAMPLE_TENANT_ROUTE_CONTEXT);
});

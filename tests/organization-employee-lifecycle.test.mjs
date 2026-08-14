import assert from 'node:assert/strict';
import test from 'node:test';
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
} from '../dist/index.js';

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

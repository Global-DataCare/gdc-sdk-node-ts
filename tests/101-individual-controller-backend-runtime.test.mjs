import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Repo convention reminder:
 * read `ARCHITECTURE.md` and `CONTRIBUTING.md` before reshaping this test.
 *
 * Non-negotiable here:
 * - no ad hoc literals when one shared fixture/type already exists
 * - prefer reusable examples from `gdc-common-utils-ts`
 * - keep the flow step by step and didactic
 */
import {
  EXAMPLE_CLINICAL_BUNDLE_SEARCH_INPUT,
  EXAMPLE_INDIVIDUAL_ORGANIZATION_ORDER_INPUT,
  EXAMPLE_INDIVIDUAL_ORGANIZATION_ORDER_RESPONSE,
  EXAMPLE_INDIVIDUAL_ORGANIZATION_START_INPUT,
  EXAMPLE_INDIVIDUAL_ORGANIZATION_START_RESPONSE,
  EXAMPLE_ORGANIZATION_CONTROLLER_ROLE,
  EXAMPLE_PROFILE_EMAIL,
  EXAMPLE_PROFILE_ID,
  EXAMPLE_PROFILE_APP_TYPE_FAMILY,
  EXAMPLE_PROFILE_KEY_ACCESS_MODE_SERVER,
  EXAMPLE_PROFILE_LOCAL_PIN_PASSWORD_BACKEND,
  EXAMPLE_PROFILE_PROVIDER_DID,
  EXAMPLE_PROFILE_RUNTIME_CLASS_SERVER,
  EXAMPLE_SUBJECT_DID,
  EXAMPLE_TENANT_ROUTE_CONTEXT,
} from 'gdc-common-utils-ts';
import {
  ActorKinds,
  DirectBackendProfileRuntime,
  IndividualControllerBackendRuntime,
  prepareLoadProfile,
} from '../dist/index.js';

/**
 * Teaching goal:
 * show the first pragmatic backend use-case wrapper on top of the generic v2
 * profile runtime:
 * 1. load the backend individual-controller profile,
 * 2. start individual registration,
 * 3. confirm the returned order,
 * 4. read the subject clinical index.
 */
test('101: backend individual-controller runtime wraps the current CORE baseline', async () => {
  const loadRequest = prepareLoadProfile({
    actorKind: ActorKinds.IndividualController,
    providerDid: EXAMPLE_PROFILE_PROVIDER_DID,
    runtimeClass: EXAMPLE_PROFILE_RUNTIME_CLASS_SERVER,
    keyAccessMode: EXAMPLE_PROFILE_KEY_ACCESS_MODE_SERVER,
    actorRole: EXAMPLE_ORGANIZATION_CONTROLLER_ROLE,
    profileId: EXAMPLE_PROFILE_ID,
    profileDid: EXAMPLE_PROFILE_PROVIDER_DID,
    subjectDid: EXAMPLE_SUBJECT_DID,
    email: EXAMPLE_PROFILE_EMAIL,
    appType: EXAMPLE_PROFILE_APP_TYPE_FAMILY,
    localPinPassword: EXAMPLE_PROFILE_LOCAL_PIN_PASSWORD_BACKEND,
  });
  const backendProfileRuntime = new DirectBackendProfileRuntime({
    defaultRouteContext: EXAMPLE_TENANT_ROUTE_CONTEXT,
    facadeClient: {
      async startIndividualOrganization(input) {
        assert.equal(input.alternateName, EXAMPLE_INDIVIDUAL_ORGANIZATION_START_INPUT.alternateName);
        return EXAMPLE_INDIVIDUAL_ORGANIZATION_START_RESPONSE;
      },
      async confirmIndividualOrganizationOrder(input) {
        assert.equal(input.offerId, EXAMPLE_INDIVIDUAL_ORGANIZATION_ORDER_INPUT.offerId);
        return EXAMPLE_INDIVIDUAL_ORGANIZATION_ORDER_RESPONSE;
      },
      async searchClinicalBundle(ctx, input) {
        assert.equal(ctx.tenantId, EXAMPLE_TENANT_ROUTE_CONTEXT.tenantId);
        assert.equal(input.subject, EXAMPLE_CLINICAL_BUNDLE_SEARCH_INPUT.subject);
        return {
          submit: { status: 202, body: { accepted: true } },
          poll: { status: 200, body: { data: [{ resourceType: 'Bundle', id: 'clinical-index-1' }] }, attempts: 1 },
        };
      },
      async getLatestIps(ctx, input) {
        assert.equal(ctx.tenantId, EXAMPLE_TENANT_ROUTE_CONTEXT.tenantId);
        assert.equal(input.subject, EXAMPLE_SUBJECT_DID);
        return {
          submit: { status: 202, body: { accepted: true } },
          poll: { status: 200, body: { data: [{ resourceType: 'Bundle', id: 'latest-ips-1' }] }, attempts: 1 },
        };
      },
    },
  });

  const runtime = new IndividualControllerBackendRuntime(backendProfileRuntime);

  const profile = await runtime.loadProfile(loadRequest);
  const startResult = await runtime.startIndividualOrganization(
    profile,
    EXAMPLE_INDIVIDUAL_ORGANIZATION_START_INPUT,
  );
  const orderResult = await runtime.confirmIndividualOrganizationOrder(
    profile,
    EXAMPLE_INDIVIDUAL_ORGANIZATION_ORDER_INPUT,
  );
  const clinicalBundle = await runtime.searchClinicalBundle(
    profile,
    EXAMPLE_TENANT_ROUTE_CONTEXT,
    EXAMPLE_CLINICAL_BUNDLE_SEARCH_INPUT,
  );
  const latestIps = await runtime.getLatestIps(
    profile,
    EXAMPLE_TENANT_ROUTE_CONTEXT,
    { subject: EXAMPLE_SUBJECT_DID },
  );

  assert.equal(profile.session.actorKind, ActorKinds.IndividualController);
  assert.equal(startResult.offerId, EXAMPLE_INDIVIDUAL_ORGANIZATION_START_RESPONSE.offerId);
  assert.equal(orderResult.poll.status, EXAMPLE_INDIVIDUAL_ORGANIZATION_ORDER_RESPONSE.poll.status);
  assert.equal(clinicalBundle.poll.body.data[0].id, 'clinical-index-1');
  assert.equal(latestIps.poll.body.data[0].id, 'latest-ips-1');
});

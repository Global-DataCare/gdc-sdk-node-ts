/**
 * 101 note:
 * - `gdc-common-utils-ts` owns the canonical step-by-step editors/readers and payload examples.
 * - This file starts after that shared authoring step and teaches the highest-level `sdk-node` runtime surface for this topic.
 * - Reuse `sdk-core` and `common-utils` contracts instead of re-teaching raw claims or low-level editors here.
 * - Read `docs/101-README.md` for the ordered path and keep actor role plus submit/poll explicit.
 */

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
 * - start from `ProfileRuntime -> loadProfile(...) -> workspace/session -> actor facade`
 */
import {
  EXAMPLE_FAMILY_ORGANIZATION_SEARCH_INPUT,
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
  BundleReader,
} from 'gdc-common-utils-ts';
import {
  ActorKinds,
  createCommunicationFacade,
  IndividualControllerBackendRuntime,
  createBackendProfileRuntime,
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
  const protectedProfileLoadRequest = prepareLoadProfile({
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
  const backendProfileRuntime = createBackendProfileRuntime({
    defaultRouteContext: EXAMPLE_TENANT_ROUTE_CONTEXT,
    facadeClient: {
      async startIndividualOrganization(input) {
        assert.equal(input.alternateName, EXAMPLE_INDIVIDUAL_ORGANIZATION_START_INPUT.alternateName);
        return EXAMPLE_INDIVIDUAL_ORGANIZATION_START_RESPONSE;
      },
      async ensureFamilyOrganizationRegistration(_ctx, input) {
        assert.equal(input.controllerPhone, EXAMPLE_FAMILY_ORGANIZATION_SEARCH_INPUT.controllerPhone);
        return {
          status: 'already_exists',
          summary: {
            status: 'already_exists',
            organizationId: 'org-uuid-001',
            subjectInfo: {
              alternateName: EXAMPLE_FAMILY_ORGANIZATION_SEARCH_INPUT.usualname,
            },
          },
        };
      },
      async confirmIndividualOrganizationOrder(input) {
        assert.equal(input.offerId, EXAMPLE_INDIVIDUAL_ORGANIZATION_ORDER_INPUT.offerId);
        return EXAMPLE_INDIVIDUAL_ORGANIZATION_ORDER_RESPONSE;
      },
      async requestClinicalSummary(ctx, input) {
        assert.equal(ctx.tenantId, EXAMPLE_TENANT_ROUTE_CONTEXT.tenantId);
        assert.equal(input.subjectId, EXAMPLE_SUBJECT_DID);
        const bundle = {
          resourceType: 'Bundle',
          type: 'document',
          id: 'clinical-summary-1',
          entry: [],
        };
        return {
          operation: {
            submit: { status: 202, body: { accepted: true } },
            poll: { status: 200, body: {}, attempts: 1 },
          },
          bundle,
          reader: new BundleReader(bundle),
          document: createCommunicationFacade().getFhirDocument(bundle),
        };
      },
    },
  });

  const runtime = new IndividualControllerBackendRuntime(backendProfileRuntime);

  const profile = await runtime.loadProfile(protectedProfileLoadRequest);
  const familyRegistration = await runtime.ensureFamilyOrganizationRegistration(
    profile,
    EXAMPLE_TENANT_ROUTE_CONTEXT,
    EXAMPLE_FAMILY_ORGANIZATION_SEARCH_INPUT,
  );
  const orderResult = await runtime.confirmIndividualOrganizationOrder(
    profile,
    EXAMPLE_INDIVIDUAL_ORGANIZATION_ORDER_INPUT,
  );
  const clinicalSummary = await runtime.requestClinicalSummary(
    profile,
    EXAMPLE_TENANT_ROUTE_CONTEXT,
    {
      subjectId: EXAMPLE_SUBJECT_DID,
      requesterId: EXAMPLE_SUBJECT_DID,
    },
  );

  assert.equal(profile.session.actorKind, ActorKinds.IndividualController);
  assert.equal(familyRegistration.status, 'already_exists');
  assert.equal(familyRegistration.summary?.subjectInfo?.alternateName, EXAMPLE_FAMILY_ORGANIZATION_SEARCH_INPUT.usualname);
  assert.equal(orderResult.poll.status, EXAMPLE_INDIVIDUAL_ORGANIZATION_ORDER_RESPONSE.poll.status);
  assert.equal(clinicalSummary.bundle.id, 'clinical-summary-1');
});

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
  EXAMPLE_COMMUNICATION_INGESTION_PAYLOAD,
  EXAMPLE_DEVICE_CLIENT_ID,
  EXAMPLE_INDIVIDUAL_ORGANIZATION_START_INPUT,
  EXAMPLE_INDIVIDUAL_ORGANIZATION_START_RESPONSE,
  EXAMPLE_OTP_CODE,
  EXAMPLE_ORGANIZATION_CONTROLLER_ROLE,
  EXAMPLE_PROFILE_EMAIL,
  EXAMPLE_PROFILE_ID,
  EXAMPLE_PROFILE_APP_TYPE_FAMILY,
  EXAMPLE_PROFILE_CONNECTION_PIN_PASSWORD,
  EXAMPLE_PROFILE_CONNECTION_SECRET_KIND_PIN_PASSWORD,
  EXAMPLE_PROFILE_KEY_ACCESS_MODE_SERVER,
  EXAMPLE_PROFILE_LOCAL_PIN_PASSWORD_BACKEND,
  EXAMPLE_PROFILE_PROVIDER_DID,
  EXAMPLE_PROFILE_RUNTIME_CLASS_SERVER,
  EXAMPLE_SUBJECT_DID,
  EXAMPLE_TENANT_ROUTE_CONTEXT,
} from 'gdc-common-utils-ts';
import {
  ActorKinds,
  BackendSubjectIndexReadModes,
  closeBackendProfile,
  connectBackendToSubjectIndex,
  DirectBackendProfileRuntime,
  getBackendSubjectIndexComposition,
  loadBackendIndividualControllerProfile,
  loadBackendProfile,
  prepareConnectToSubjectIndex,
  prepareGetSubjectIndexComposition,
  prepareLoadProfile,
  prepareRegisterTrustedDevice,
  registerBackendTrustedDevice,
} from '../dist/index.js';

/**
 * Teaching goal:
 * show the backend-generic runtime flow for:
 * 1. loading one actor profile after authentication,
 * 2. registering one trusted device/runtime context,
 * 3. connecting that actor to one subject index, and
 * 4. reading the resulting subject index composition, and
 * 5. closing the loaded profile after the backend session finishes.
 */
test('101: backend profile runtime stays generic across backend consumers', async () => {
  // Step 1. Prepare the backend profile-load request.
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

  // Step 2. Prepare trusted-device registration after the backend profile is loaded.
  const trustedDeviceRequest = prepareRegisterTrustedDevice({
    userId: loadRequest.profileDid,
    userRoleCode: loadRequest.actorRole,
    deviceDid: EXAMPLE_DEVICE_CLIENT_ID,
    providerDid: loadRequest.providerDid,
    otpCode: EXAMPLE_OTP_CODE,
  });

  // Step 3. Prepare the subject-index connection request.
  const subjectConnectionRequest = prepareConnectToSubjectIndex({
    subjectId: loadRequest.subjectDid,
    userId: loadRequest.profileDid,
    userRoleCode: loadRequest.actorRole,
    secretKind: EXAMPLE_PROFILE_CONNECTION_SECRET_KIND_PIN_PASSWORD,
    connectionPinPassword: EXAMPLE_PROFILE_CONNECTION_PIN_PASSWORD,
  });

  // Step 4. Prepare the subject-index composition request.
  const compositionRequest = prepareGetSubjectIndexComposition({
    subjectId: loadRequest.subjectDid,
    userId: loadRequest.profileDid,
    userRoleCode: loadRequest.actorRole,
  });

  const runtimeClient = new DirectBackendProfileRuntime({
    defaultRouteContext: EXAMPLE_TENANT_ROUTE_CONTEXT,
    subjectIndexReadMode: BackendSubjectIndexReadModes.LatestIps,
    facadeClient: {
      async startIndividualOrganization(input) {
        return {
          submit: { status: 202, body: { accepted: true, input } },
          poll: { status: 200, body: { accepted: true }, attempts: 1 },
          offerId: EXAMPLE_INDIVIDUAL_ORGANIZATION_START_RESPONSE.offerId,
          offerPreview: EXAMPLE_INDIVIDUAL_ORGANIZATION_START_RESPONSE.offerPreview,
        };
      },
      async getLatestIps(ctx, input) {
        assert.equal(ctx.tenantId, EXAMPLE_TENANT_ROUTE_CONTEXT.tenantId);
        return {
          submit: { status: 202, body: { accepted: true, input } },
          poll: {
            status: 200,
            body: {
              resourceType: 'Composition',
              id: input.subject,
            },
            attempts: 1,
          },
        };
      },
    },
  });

  const actualLoadedProfile = await loadBackendProfile(runtimeClient, loadRequest);
  const individualControllerProfile = await loadBackendIndividualControllerProfile(runtimeClient, loadRequest);
  const trustedDevice = await registerBackendTrustedDevice(runtimeClient, trustedDeviceRequest);
  const connection = await connectBackendToSubjectIndex(runtimeClient, subjectConnectionRequest);
  const composition = await getBackendSubjectIndexComposition(runtimeClient, compositionRequest);
  const bootstrapResult = await individualControllerProfile.sdk
    .startIndividualOrganization(EXAMPLE_INDIVIDUAL_ORGANIZATION_START_INPUT);
  const draftJob = await actualLoadedProfile.jobManager.createJob(
    EXAMPLE_COMMUNICATION_INGESTION_PAYLOAD,
    {
      section: 'individual',
      format: 'org.schema',
      resourceType: 'Organization',
      action: '_batch',
      sector: EXAMPLE_TENANT_ROUTE_CONTEXT.sector,
    },
  );
  const queriedJobs = await actualLoadedProfile.jobManager.queryJobs({
    where: [{ attribute: 'status', equals: 'DRAFT' }],
  });
  await closeBackendProfile(runtimeClient, loadRequest.profileDid);

  assert.equal(actualLoadedProfile.descriptor.profileId, EXAMPLE_PROFILE_ID);
  assert.equal(actualLoadedProfile.jobManager.generateId().length > 0, true);
  assert.equal(actualLoadedProfile.actorSessions.length, 1);
  assert.equal(actualLoadedProfile.actorSessions[0].actorKind, ActorKinds.IndividualController);
  assert.equal(individualControllerProfile.session.actorKind, ActorKinds.IndividualController);
  assert.equal(trustedDevice.status, 'already-trusted');
  assert.equal(trustedDevice.trustedDeviceId, EXAMPLE_DEVICE_CLIENT_ID);
  assert.equal(connection.status, 'already-connected');
  assert.equal(bootstrapResult.offerId, EXAMPLE_INDIVIDUAL_ORGANIZATION_START_RESPONSE.offerId);
  assert.equal(draftJob.status, 'DRAFT');
  assert.equal(queriedJobs.length, 1);
  assert.equal(queriedJobs[0].id, draftJob.id);
  await assert.rejects(
    () => getBackendSubjectIndexComposition(runtimeClient, compositionRequest),
    /has not loaded one backend profile/i,
  );
  assert.deepEqual(composition.composition, {
    resourceType: 'Composition',
    id: EXAMPLE_SUBJECT_DID,
  });
});

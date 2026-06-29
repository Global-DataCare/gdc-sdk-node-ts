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
 *
 * Teaching map:
 * - orchestration and actor chaining live here in `sdk-node`
 * - the high-level editors/readers themselves are taught in:
 *   `docs/101-PROFILE-ORCHESTRATION.md`
 * - public app-facing actor SDKs are still the first surface to teach:
 *   `HostOnboardingSdk`, `OrganizationControllerSdk`,
 *   `IndividualControllerSdk`, `ProfessionalSdk`
 * - do not duplicate those lower-layer 101s here unless the runtime story
 *   needs to show how several protected profiles depend on each other
 */
import {
  ActorKinds,
  CommunicationAttachedBundleSession,
  EXAMPLE_CLINICAL_BUNDLE_SEARCH_INPUT,
  EXAMPLE_CONSENT_ACCESS_RULES,
  EXAMPLE_DEVICE_CLIENT_ID,
  EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE,
  EXAMPLE_EMPLOYEE_DIRECTORY_RECORDS,
  EXAMPLE_EMPLOYEE_DOCTOR_ACTIVE,
  EXAMPLE_EMPLOYEE_SEARCH_RESPONSE_BODY,
  EXAMPLE_FAMILY_ORGANIZATION_SEARCH_INPUT,
  EXAMPLE_FAMILY_ORGANIZATION_SEARCH_RESPONSE_BODY,
  EXAMPLE_HOST_ROUTE_CONTEXT,
  EXAMPLE_LICENSE_ACCEPTED_OFFER_ID,
  EXAMPLE_LICENSE_LIST_RESPONSE_BODY,
  EXAMPLE_LICENSE_OFFER_LIST_RESPONSE_BODY,
  EXAMPLE_LICENSE_ORDER_LIST_RESPONSE_BODY,
  EXAMPLE_ORGANIZATION_CONTROLLER_ROLE,
  EXAMPLE_ORGANIZATION_EMPLOYEE_INPUT,
  EXAMPLE_OTP_CODE,
  EXAMPLE_PROFESSIONAL_CONSENT_SCENARIOS,
  EXAMPLE_PROFILE_APP_TYPE_FAMILY,
  EXAMPLE_PROFILE_CONNECTION_PIN_PASSWORD,
  EXAMPLE_PROFILE_CONNECTION_SECRET_KIND_PIN_PASSWORD,
  EXAMPLE_PROFILE_EMAIL,
  EXAMPLE_PROFILE_ID,
  EXAMPLE_PROFILE_KEY_ACCESS_MODE_SERVER,
  EXAMPLE_PROFILE_LOCAL_PIN_PASSWORD_BACKEND,
  EXAMPLE_PROFILE_PROVIDER_DID,
  EXAMPLE_PROFILE_RUNTIME_CLASS_SERVER,
  EXAMPLE_RELATED_PERSON_ACTIVE_NAME,
  EXAMPLE_RELATED_PERSON_IDENTIFIER,
  EXAMPLE_RELATED_PERSON_LIST_RESPONSE_BODY,
  EXAMPLE_SUBJECT_DID,
  EXAMPLE_TENANT_ROUTE_CONTEXT,
  buildConsentPermissionTemplateImportExportSessionExample,
  buildExampleEmployeeClaims,
  buildIpsClinicalHistoryBundleExample,
  buildUnsignedProfessionalSmartVpJwt,
  buildVitalSignObservationClaims,
  readEmployeeSearchResults,
  readFamilyOrganizationSummaryFromResponseBody,
  readRelatedPersonListRecords,
  selectRelatedPersonListRecord,
  summarizeClinicalBundle,
  summarizeLicenseListRecords,
  toClinicalResourceExpandedViews,
} from 'gdc-common-utils-ts';
import {
  BackendSubjectIndexReadModes,
  IndividualControllerBackendRuntime,
  OrganizationControllerBackendRuntime,
  ProfessionalBackendRuntime,
  closeBackendProfile,
  connectBackendToSubjectIndex,
  createBackendProfileRuntime,
  getBackendSubjectIndexComposition,
  prepareLoadProfile,
  registerBackendTrustedDevice,
} from '../dist/index.js';

/**
 * Teaching goal:
 * show the full high-level backend story that a web/expo frontend, one BFF,
 * and one voice system should all share:
 * 1. load one protected profile and unlock it with the local PIN,
 * 2. resolve the actor facade for the current role,
 * 3. contract seats and manage employees as organization controller,
 * 4. resume or create one individual registration as individual controller,
 * 5. list consent and clinical views for menus,
 * 6. add one new clinical item through shared bundle helpers,
 * 7. let one professional obtain SMART + IPS when consent matches,
 * 8. deny another professional role when consent does not match,
 * 9. disable/purge employees, individual, and tenant during cleanup.
 */
test('101: backend profile runtime tells the complete high-level story for app, BFF, and voice integrations', async () => {
  const consentBundleExample = buildConsentPermissionTemplateImportExportSessionExample();
  const ipsBundleExample = buildIpsClinicalHistoryBundleExample();
  const familyOrganizationSummary =
    readFamilyOrganizationSummaryFromResponseBody(EXAMPLE_FAMILY_ORGANIZATION_SEARCH_RESPONSE_BODY);
  const activeEmployeeSearchResponseBody = {
    data: EXAMPLE_EMPLOYEE_DIRECTORY_RECORDS
      .filter(record => record.status !== 'purged')
      .map(record => ({
        id: record.resourceId,
        meta: {
          status: record.status,
          claims: buildExampleEmployeeClaims(record),
        },
      })),
  };

  const organizationControllerLoadRequest = prepareLoadProfile({
    actorKind: ActorKinds.OrganizationController,
    providerDid: EXAMPLE_PROFILE_PROVIDER_DID,
    runtimeClass: EXAMPLE_PROFILE_RUNTIME_CLASS_SERVER,
    keyAccessMode: EXAMPLE_PROFILE_KEY_ACCESS_MODE_SERVER,
    actorRole: EXAMPLE_ORGANIZATION_CONTROLLER_ROLE,
    profileId: `${EXAMPLE_PROFILE_ID}-organization-controller`,
    profileDid: `${EXAMPLE_PROFILE_PROVIDER_DID}:organization-controller`,
    subjectDid: EXAMPLE_SUBJECT_DID,
    email: EXAMPLE_PROFILE_EMAIL,
    appType: EXAMPLE_PROFILE_APP_TYPE_FAMILY,
    localPinPassword: EXAMPLE_PROFILE_LOCAL_PIN_PASSWORD_BACKEND,
  });
  const individualControllerLoadRequest = prepareLoadProfile({
    actorKind: ActorKinds.IndividualController,
    providerDid: EXAMPLE_PROFILE_PROVIDER_DID,
    runtimeClass: EXAMPLE_PROFILE_RUNTIME_CLASS_SERVER,
    keyAccessMode: EXAMPLE_PROFILE_KEY_ACCESS_MODE_SERVER,
    actorRole: EXAMPLE_ORGANIZATION_CONTROLLER_ROLE,
    profileId: `${EXAMPLE_PROFILE_ID}-individual-controller`,
    profileDid: `${EXAMPLE_PROFILE_PROVIDER_DID}:individual-controller`,
    subjectDid: EXAMPLE_SUBJECT_DID,
    email: EXAMPLE_PROFILE_EMAIL,
    appType: EXAMPLE_PROFILE_APP_TYPE_FAMILY,
    localPinPassword: EXAMPLE_PROFILE_LOCAL_PIN_PASSWORD_BACKEND,
  });
  const professionalLoadRequest = prepareLoadProfile({
    actorKind: ActorKinds.Professional,
    providerDid: EXAMPLE_PROFILE_PROVIDER_DID,
    runtimeClass: EXAMPLE_PROFILE_RUNTIME_CLASS_SERVER,
    keyAccessMode: EXAMPLE_PROFILE_KEY_ACCESS_MODE_SERVER,
    actorRole: EXAMPLE_EMPLOYEE_DOCTOR_ACTIVE.role,
    profileId: `${EXAMPLE_PROFILE_ID}-professional`,
    profileDid: `${EXAMPLE_PROFILE_PROVIDER_DID}:professional`,
    subjectDid: EXAMPLE_SUBJECT_DID,
    email: EXAMPLE_EMPLOYEE_DOCTOR_ACTIVE.email,
    appType: EXAMPLE_PROFILE_APP_TYPE_FAMILY,
    localPinPassword: EXAMPLE_PROFILE_LOCAL_PIN_PASSWORD_BACKEND,
  });
  const deniedProfessionalLoadRequest = prepareLoadProfile({
    actorKind: ActorKinds.Professional,
    providerDid: EXAMPLE_PROFILE_PROVIDER_DID,
    runtimeClass: EXAMPLE_PROFILE_RUNTIME_CLASS_SERVER,
    keyAccessMode: EXAMPLE_PROFILE_KEY_ACCESS_MODE_SERVER,
    actorRole: EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE.role,
    profileId: `${EXAMPLE_PROFILE_ID}-controller-role-professional`,
    profileDid: `${EXAMPLE_PROFILE_PROVIDER_DID}:controller-role-professional`,
    subjectDid: EXAMPLE_SUBJECT_DID,
    email: EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE.email,
    appType: EXAMPLE_PROFILE_APP_TYPE_FAMILY,
    localPinPassword: EXAMPLE_PROFILE_LOCAL_PIN_PASSWORD_BACKEND,
  });

  const profileRuntime = createBackendProfileRuntime({
    defaultRouteContext: EXAMPLE_TENANT_ROUTE_CONTEXT,
    subjectIndexReadMode: BackendSubjectIndexReadModes.LatestIps,
    facadeClient: {
      async listOrganizationLicenses(ctx, input) {
        assert.equal(ctx.tenantId, EXAMPLE_TENANT_ROUTE_CONTEXT.tenantId);
        assert.deepEqual(input, {});
        return {
          submit: { status: 202, body: { accepted: true } },
          poll: { status: 200, body: EXAMPLE_LICENSE_LIST_RESPONSE_BODY, attempts: 1 },
        };
      },
      async listOrganizationLicenseOffers(ctx, input) {
        assert.equal(ctx.tenantId, EXAMPLE_TENANT_ROUTE_CONTEXT.tenantId);
        assert.deepEqual(input, {});
        return {
          submit: { status: 202, body: { accepted: true } },
          poll: { status: 200, body: EXAMPLE_LICENSE_OFFER_LIST_RESPONSE_BODY, attempts: 1 },
        };
      },
      async listOrganizationLicenseOrders(ctx, input) {
        assert.equal(ctx.tenantId, EXAMPLE_TENANT_ROUTE_CONTEXT.tenantId);
        assert.deepEqual(input, {});
        return {
          submit: { status: 202, body: { accepted: true } },
          poll: { status: 200, body: EXAMPLE_LICENSE_ORDER_LIST_RESPONSE_BODY, attempts: 1 },
        };
      },
      async confirmOrganizationLicenseOrder(ctx, input) {
        assert.equal(ctx.tenantId, EXAMPLE_TENANT_ROUTE_CONTEXT.tenantId);
        assert.equal(input.orderId, EXAMPLE_LICENSE_ACCEPTED_OFFER_ID);
        return {
          submit: { status: 202, body: { accepted: true, orderId: input.orderId } },
          poll: { status: 200, body: { orderId: input.orderId, status: 'activated' }, attempts: 1 },
        };
      },
      async createOrganizationEmployee(ctx, input) {
        assert.equal(ctx.tenantId, EXAMPLE_TENANT_ROUTE_CONTEXT.tenantId);
        return {
          submit: { status: 202, body: { accepted: true, claims: input.employeeClaims } },
          poll: { status: 200, body: { data: [{ meta: { claims: input.employeeClaims } }] }, attempts: 1 },
        };
      },
      async searchOrganizationEmployees(ctx) {
        assert.equal(ctx.tenantId, EXAMPLE_TENANT_ROUTE_CONTEXT.tenantId);
        return {
          submit: { status: 202, body: { accepted: true } },
          poll: { status: 200, body: activeEmployeeSearchResponseBody, attempts: 1 },
        };
      },
      async disableEmployee(ctx, input) {
        assert.equal(ctx.tenantId, EXAMPLE_TENANT_ROUTE_CONTEXT.tenantId);
        assert.equal(input.resourceId, EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE.resourceId);
        return {
          submit: { status: 202, body: { accepted: true, resourceId: input.resourceId, identifier: input.employeeClaims?.['org.schema.Person.identifier'] } },
          poll: { status: 200, body: { status: 'disabled', resourceId: input.resourceId, identifier: input.employeeClaims?.['org.schema.Person.identifier'] }, attempts: 1 },
        };
      },
      async purgeEmployee(ctx, input) {
        assert.equal(ctx.tenantId, EXAMPLE_TENANT_ROUTE_CONTEXT.tenantId);
        assert.equal(input.resourceId, EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE.resourceId);
        return {
          submit: { status: 202, body: { accepted: true, resourceId: input.resourceId, identifier: input.employeeClaims?.['org.schema.Person.identifier'] } },
          poll: { status: 200, body: { status: 'purged', resourceId: input.resourceId, identifier: input.employeeClaims?.['org.schema.Person.identifier'] }, attempts: 1 },
        };
      },
      async disableTenant(hostCtx, input) {
        assert.equal(hostCtx.jurisdiction, EXAMPLE_HOST_ROUTE_CONTEXT.jurisdiction);
        return {
          submit: { status: 202, body: { accepted: true, tenantId: input.tenantId } },
          poll: { status: 200, body: { status: 'disabled', tenantId: input.tenantId }, attempts: 1 },
        };
      },
      async purgeTenant(hostCtx, input) {
        assert.equal(hostCtx.jurisdiction, EXAMPLE_HOST_ROUTE_CONTEXT.jurisdiction);
        return {
          submit: { status: 202, body: { accepted: true, tenantId: input.tenantId } },
          poll: { status: 200, body: { status: 'purged', tenantId: input.tenantId }, attempts: 1 },
        };
      },
      async ensureFamilyOrganizationRegistration(_ctx, input) {
        assert.equal(input.controllerPhone, EXAMPLE_FAMILY_ORGANIZATION_SEARCH_INPUT.controllerPhone);
        assert.equal(input.usualname, EXAMPLE_FAMILY_ORGANIZATION_SEARCH_INPUT.usualname);
        return {
          status: 'already_exists',
          summary: familyOrganizationSummary || undefined,
        };
      },
      async grantProfessionalAccess(ctx, input) {
        assert.equal(ctx.tenantId, EXAMPLE_TENANT_ROUTE_CONTEXT.tenantId);
        return {
          submit: { status: 202, body: { accepted: true, input } },
          poll: {
            status: 200,
            body: {
              data: [{
                resource: {
                  resourceType: 'Consent',
                  meta: {
                    claims: EXAMPLE_CONSENT_ACCESS_RULES.physicianByEmailContinuousCare,
                  },
                },
              }],
            },
            attempts: 1,
          },
        };
      },
      async revokeProfessionalAccess(ctx, input) {
        assert.equal(ctx.tenantId, EXAMPLE_TENANT_ROUTE_CONTEXT.tenantId);
        return {
          submit: { status: 202, body: { accepted: true, input } },
          poll: {
            status: 200,
            body: {
              data: [{
                resource: {
                  resourceType: 'Consent',
                  meta: {
                    claims: EXAMPLE_CONSENT_ACCESS_RULES.revokedPhysicianEmailConsent,
                  },
                },
              }],
            },
            attempts: 1,
          },
        };
      },
      async searchClinicalBundle(ctx, input) {
        assert.equal(ctx.tenantId, EXAMPLE_TENANT_ROUTE_CONTEXT.tenantId);
        assert.equal(input.subject, EXAMPLE_SUBJECT_DID);
        return {
          submit: { status: 202, body: { accepted: true, input } },
          poll: {
            status: 200,
            body: ipsBundleExample.bundleInMemory,
            attempts: 1,
          },
        };
      },
      async getLatestIps(ctx, input) {
        assert.equal(ctx.tenantId, EXAMPLE_TENANT_ROUTE_CONTEXT.tenantId);
        assert.equal(input.subject, EXAMPLE_SUBJECT_DID);
        return {
          submit: { status: 202, body: { accepted: true, input } },
          poll: {
            status: 200,
            body: ipsBundleExample.bundleInMemory,
            attempts: 1,
          },
        };
      },
      async requestSmartToken(input) {
        if (input.actorDid?.includes('controller-role-professional')) {
          throw new Error(EXAMPLE_PROFESSIONAL_CONSENT_SCENARIOS.physicianObstetricianDeniedWhenOnlyAllergiesConsent.reason);
        }
        return {
          submit: { status: 202, body: { accepted: true, input } },
          poll: {
        status: 200,
        body: {
          access_token: 'smart-token-openid-001',
              token_type: 'Bearer',
              scope: input.scopes.join(' '),
              expires_in: 3600,
            },
            attempts: 1,
          },
        };
      },
      async disableIndividual(ctx, input) {
        assert.equal(ctx.tenantId, EXAMPLE_TENANT_ROUTE_CONTEXT.tenantId);
        return {
          submit: { status: 202, body: { accepted: true, identifier: input.identifier } },
          poll: { status: 200, body: { status: 'disabled', identifier: input.identifier }, attempts: 1 },
        };
      },
      async purgeIndividual(ctx, input) {
        assert.equal(ctx.tenantId, EXAMPLE_TENANT_ROUTE_CONTEXT.tenantId);
        return {
          submit: { status: 202, body: { accepted: true, identifier: input.identifier } },
          poll: { status: 200, body: { status: 'purged', identifier: input.identifier }, attempts: 1 },
        };
      },
    },
  });

  const organizationControllerRuntime = new OrganizationControllerBackendRuntime(profileRuntime);
  const individualControllerRuntime = new IndividualControllerBackendRuntime(profileRuntime);
  const professionalRuntime = new ProfessionalBackendRuntime(profileRuntime);

  // Step 1. Front/app/voice captures one protected profile id and PIN, then the
  // backend runtime loads the actor facade for the organization controller.
  const organizationControllerProfile = await organizationControllerRuntime.loadProfile(
    organizationControllerLoadRequest,
  );

  // Step 2. Organization controller checks contracted seats, offers, and orders.
  const licenseList = await organizationControllerRuntime.listLicenses(
    organizationControllerProfile,
    EXAMPLE_TENANT_ROUTE_CONTEXT,
  );
  const licenseOffers = await organizationControllerRuntime.listLicenseOffers(
    organizationControllerProfile,
    EXAMPLE_TENANT_ROUTE_CONTEXT,
  );
  const licenseOrders = await organizationControllerRuntime.listLicenseOrders(
    organizationControllerProfile,
    EXAMPLE_TENANT_ROUTE_CONTEXT,
  );
  const confirmedLicenseOrder = await organizationControllerRuntime.confirmOrganizationLicenseOrder(
    organizationControllerProfile,
    EXAMPLE_TENANT_ROUTE_CONTEXT,
    { orderId: EXAMPLE_LICENSE_ACCEPTED_OFFER_ID },
  );
  const licenseSummary = summarizeLicenseListRecords(licenseList.poll.body);

  // Step 3. Organization controller provisions two employees and lists them.
  const controllerEmployeeCreation = await organizationControllerRuntime.createEmployee(
    organizationControllerProfile,
    EXAMPLE_TENANT_ROUTE_CONTEXT,
    EXAMPLE_ORGANIZATION_EMPLOYEE_INPUT,
  );
  const doctorEmployeeCreation = await organizationControllerRuntime.createEmployee(
    organizationControllerProfile,
    EXAMPLE_TENANT_ROUTE_CONTEXT,
    {
      employeeClaims: buildExampleEmployeeClaims(EXAMPLE_EMPLOYEE_DOCTOR_ACTIVE),
    },
  );
  const employeeDirectory = await organizationControllerRuntime.searchEmployees(
    organizationControllerProfile,
    EXAMPLE_TENANT_ROUTE_CONTEXT,
    {},
  );
  const employeeRows = readEmployeeSearchResults(employeeDirectory.poll.body);

  // Step 4. The BFF/voice controller flow loads the individual-controller
  // profile, registers the trusted device, and connects to the subject index.
  const individualControllerProfile = await individualControllerRuntime.loadProfile(
    individualControllerLoadRequest,
  );
  const trustedDevice = await registerBackendTrustedDevice(profileRuntime, {
    userId: individualControllerLoadRequest.profileDid,
    userRoleCode: individualControllerLoadRequest.actorRole,
    deviceDid: EXAMPLE_DEVICE_CLIENT_ID,
    providerDid: individualControllerLoadRequest.providerDid,
    otpCode: EXAMPLE_OTP_CODE,
  });
  const connectedSubjectIndex = await connectBackendToSubjectIndex(profileRuntime, {
    subjectId: individualControllerLoadRequest.subjectDid,
    userId: individualControllerLoadRequest.profileDid,
    userRoleCode: individualControllerLoadRequest.actorRole,
    secretKind: EXAMPLE_PROFILE_CONNECTION_SECRET_KIND_PIN_PASSWORD,
    connectionPinPassword: EXAMPLE_PROFILE_CONNECTION_PIN_PASSWORD,
  });
  const subjectComposition = await getBackendSubjectIndexComposition(profileRuntime, {
    subjectId: individualControllerLoadRequest.subjectDid,
    userId: individualControllerLoadRequest.profileDid,
    userRoleCode: individualControllerLoadRequest.actorRole,
  });

  // Step 5. Controller resumes or creates the individual, then chooses one
  // managed profile from the neutral menu list.
  const familyRegistration = await individualControllerRuntime.ensureFamilyOrganizationRegistration(
    individualControllerProfile,
    EXAMPLE_TENANT_ROUTE_CONTEXT,
    EXAMPLE_FAMILY_ORGANIZATION_SEARCH_INPUT,
  );
  const managedProfiles = readRelatedPersonListRecords(EXAMPLE_RELATED_PERSON_LIST_RESPONSE_BODY);
  const selectedManagedProfile = selectRelatedPersonListRecord(
    EXAMPLE_RELATED_PERSON_LIST_RESPONSE_BODY,
    { name: EXAMPLE_RELATED_PERSON_ACTIVE_NAME },
  );

  // Step 6. Controller lists consent and clinical data with shared viewers.
  const grantedProfessionalAccess = await individualControllerProfile.sdk.grantProfessionalAccess(
    EXAMPLE_TENANT_ROUTE_CONTEXT,
    EXAMPLE_PROFESSIONAL_CONSENT_SCENARIOS.physicianByEmailContinuousCareAllergiesAllowed,
  );
  const latestIps = await individualControllerRuntime.getLatestIps(
    individualControllerProfile,
    EXAMPLE_TENANT_ROUTE_CONTEXT,
    { subject: EXAMPLE_SUBJECT_DID },
  );
  const consentViews = toClinicalResourceExpandedViews(consentBundleExample.bundleInMemory);
  const initialClinicalSummary = summarizeClinicalBundle(latestIps.poll.body);
  const initialClinicalViews = toClinicalResourceExpandedViews(latestIps.poll.body);

  // Step 7. Controller adds one new clinical item in one new section through
  // shared bundle helpers instead of editing raw entries.
  const bundleEditor = new CommunicationAttachedBundleSession({
    communicationClaims: ipsBundleExample.communicationClaims,
    initialBundle: structuredClone(ipsBundleExample.bundleInMemory),
  });
  bundleEditor.upsertActiveObservationEntry({
    claims: buildVitalSignObservationClaims({
      identifier: 'observation-vital-sign-001',
      subject: EXAMPLE_SUBJECT_DID,
      effectiveDateTime: '2026-06-18T10:00:00Z',
      code: {
        system: 'http://loinc.org',
        code: '8480-6',
        display: 'Systolic blood pressure',
        claim: 'http://loinc.org|8480-6',
      },
      valueQuantity: {
        value: 120,
        unit: 'mm[Hg]',
        system: 'http://unitsofmeasure.org',
        code: 'mm[Hg]',
      },
    }),
    fullUrl: 'urn:uuid:observation-vital-sign-001',
  });
  bundleEditor.saveAndReleaseActiveEntry();
  const enrichedClinicalBundle = bundleEditor.getBundleInMemory();
  const enrichedClinicalSummary = summarizeClinicalBundle(enrichedClinicalBundle);
  const enrichedClinicalViews = toClinicalResourceExpandedViews(enrichedClinicalBundle);

  // Step 8. Professional with matching role obtains SMART and reads the IPS.
  const professionalProfile = await professionalRuntime.loadProfile(professionalLoadRequest);
  const professionalVpToken = buildUnsignedProfessionalSmartVpJwt({
    clientId: EXAMPLE_DEVICE_CLIENT_ID,
    actorDid: professionalLoadRequest.profileDid,
    role: EXAMPLE_EMPLOYEE_DOCTOR_ACTIVE.role,
  });
  const smartToken = await professionalRuntime.requestSmartToken(professionalProfile, {
    actorDid: professionalLoadRequest.profileDid,
    subjectDid: EXAMPLE_SUBJECT_DID,
    clientId: EXAMPLE_DEVICE_CLIENT_ID,
    smartTokenKind: 'openid-smart',
    vpToken: professionalVpToken,
    scopes: [
      ...EXAMPLE_PROFESSIONAL_CONSENT_SCENARIOS.physicianByEmailContinuousCareAllergiesAllowed.smartScopes,
    ],
  });
  const professionalIps = await professionalRuntime.getLatestIps(
    professionalProfile,
    EXAMPLE_TENANT_ROUTE_CONTEXT,
    { subject: EXAMPLE_SUBJECT_DID },
  );
  const professionalClinicalSummary = summarizeClinicalBundle(professionalIps.poll.body);

  // Step 9. Another employee role is denied because active consent does not
  // match the requested SMART scope/role.
  const deniedProfessionalProfile = await professionalRuntime.loadProfile(deniedProfessionalLoadRequest);
  const deniedProfessionalVpToken = buildUnsignedProfessionalSmartVpJwt({
    clientId: EXAMPLE_DEVICE_CLIENT_ID,
    actorDid: deniedProfessionalLoadRequest.profileDid,
    role: EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE.role,
  });

  // Step 10. Cleanup disables/purges the denied employee, then the individual,
  // and finally the tenant once dependent actors are already gone.
  const disabledEmployee = await organizationControllerRuntime.disableEmployee(
    organizationControllerProfile,
    EXAMPLE_TENANT_ROUTE_CONTEXT,
    {
      employeeClaims: buildExampleEmployeeClaims(EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE),
      resourceId: EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE.resourceId,
    },
  );
  const purgedEmployee = await organizationControllerRuntime.purgeEmployee(
    organizationControllerProfile,
    EXAMPLE_TENANT_ROUTE_CONTEXT,
    {
      employeeClaims: buildExampleEmployeeClaims(EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE),
      resourceId: EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE.resourceId,
    },
  );
  const revokedProfessionalAccess = await individualControllerProfile.sdk.revokeProfessionalAccess(
    EXAMPLE_TENANT_ROUTE_CONTEXT,
    EXAMPLE_PROFESSIONAL_CONSENT_SCENARIOS.physicianByEmailContinuousCareAllergiesAllowed,
  );
  const disabledIndividual = await individualControllerProfile.sdk.disableIndividual(
    EXAMPLE_TENANT_ROUTE_CONTEXT,
    { identifier: familyRegistration.summary?.organizationId || EXAMPLE_RELATED_PERSON_IDENTIFIER },
  );
  const purgedIndividual = await individualControllerProfile.sdk.purgeIndividual(
    EXAMPLE_TENANT_ROUTE_CONTEXT,
    { identifier: familyRegistration.summary?.organizationId || EXAMPLE_RELATED_PERSON_IDENTIFIER },
  );
  const disabledTenant = await organizationControllerRuntime.disableTenant(
    organizationControllerProfile,
    EXAMPLE_HOST_ROUTE_CONTEXT,
    { tenantId: EXAMPLE_TENANT_ROUTE_CONTEXT.tenantId },
  );
  const purgedTenant = await organizationControllerRuntime.purgeTenant(
    organizationControllerProfile,
    EXAMPLE_HOST_ROUTE_CONTEXT,
    { tenantId: EXAMPLE_TENANT_ROUTE_CONTEXT.tenantId },
  );

  await closeBackendProfile(profileRuntime, organizationControllerLoadRequest.profileDid);
  await closeBackendProfile(profileRuntime, individualControllerLoadRequest.profileDid);
  await closeBackendProfile(profileRuntime, professionalLoadRequest.profileDid);
  await closeBackendProfile(profileRuntime, deniedProfessionalLoadRequest.profileDid);

  assert.equal(organizationControllerProfile.session.actorKind, ActorKinds.OrganizationController);
  assert.equal(individualControllerProfile.session.actorKind, ActorKinds.IndividualController);
  assert.equal(professionalProfile.session.actorKind, ActorKinds.Professional);
  assert.equal(licenseSummary.contracted, 2);
  assert.equal(licenseSummary.free, 1);
  assert.equal(licenseSummary.used, 1);
  assert.equal(licenseOffers.poll.body.data[0].resource.total, 1);
  assert.equal(licenseOrders.poll.body.data[0].resource.total, 1);
  assert.equal(confirmedLicenseOrder.poll.body.status, 'activated');
  assert.deepEqual(
    controllerEmployeeCreation.poll.body.data[0].meta.claims,
    EXAMPLE_ORGANIZATION_EMPLOYEE_INPUT.employeeClaims,
  );
  assert.equal(doctorEmployeeCreation.poll.body.data[0].meta.claims['org.schema.Person.identifier'], EXAMPLE_EMPLOYEE_DOCTOR_ACTIVE.identifier);
  assert.equal(employeeRows.length, 2);
  assert.equal(employeeRows[0].identifier, EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE.identifier);
  assert.equal(employeeRows[1].identifier, EXAMPLE_EMPLOYEE_DOCTOR_ACTIVE.identifier);
  assert.equal(readEmployeeSearchResults(EXAMPLE_EMPLOYEE_SEARCH_RESPONSE_BODY).length, 3);
  assert.equal(disabledEmployee.poll.body.resourceId, EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE.resourceId);
  assert.equal(disabledEmployee.poll.body.identifier, EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE.identifier);
  assert.equal(purgedEmployee.poll.body.resourceId, EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE.resourceId);
  assert.equal(purgedEmployee.poll.body.identifier, EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE.identifier);
  assert.equal(trustedDevice.status, 'already-trusted');
  assert.equal(connectedSubjectIndex.status, 'already-connected');
  assert.equal(subjectComposition.composition.resourceType, 'Bundle');
  assert.equal(familyRegistration.status, 'already_exists');
  assert.equal(familyRegistration.summary?.subjectInfo?.alternateName, EXAMPLE_FAMILY_ORGANIZATION_SEARCH_INPUT.usualname);
  assert.equal(managedProfiles.length, 2);
  assert.equal(selectedManagedProfile?.identifier, EXAMPLE_RELATED_PERSON_IDENTIFIER);
  assert.equal(selectedManagedProfile?.name, EXAMPLE_RELATED_PERSON_ACTIVE_NAME);
  assert.equal(grantedProfessionalAccess.poll.body.data[0].resource.resourceType, 'Consent');
  assert.equal(consentViews.length > 0, true);
  assert.equal(consentViews[0].common.resourceType.includes('DocumentReference'), true);
  assert.equal(initialClinicalSummary.totalEntries, 4);
  assert.equal(
    initialClinicalSummary.resourceTypes.find(item => item.resourceType === 'MedicationStatement')?.count,
    1,
  );
  assert.equal(initialClinicalViews.length, 4);
  assert.equal(enrichedClinicalSummary.totalEntries, 5);
  assert.equal(
    enrichedClinicalSummary.resourceTypes.find(item => item.resourceType === 'Observation')?.count,
    1,
  );
  assert.equal(enrichedClinicalViews.length, 5);
  assert.equal(smartToken.poll.body.access_token, 'smart-token-openid-001');
  assert.equal(professionalClinicalSummary.totalEntries, 4);
  await assert.rejects(
    () => professionalRuntime.requestSmartToken(deniedProfessionalProfile, {
      actorDid: deniedProfessionalLoadRequest.profileDid,
      subjectDid: EXAMPLE_SUBJECT_DID,
      clientId: EXAMPLE_DEVICE_CLIENT_ID,
      smartTokenKind: 'openid-smart',
      vpToken: deniedProfessionalVpToken,
      scopes: [
        ...EXAMPLE_PROFESSIONAL_CONSENT_SCENARIOS.physicianObstetricianDeniedWhenOnlyAllergiesConsent.smartScopes,
      ],
    }),
    new RegExp(EXAMPLE_PROFESSIONAL_CONSENT_SCENARIOS.physicianObstetricianDeniedWhenOnlyAllergiesConsent.reason, 'i'),
  );
  assert.equal(disabledEmployee.poll.body.status, 'disabled');
  assert.equal(purgedEmployee.poll.body.status, 'purged');
  assert.deepEqual(
    revokedProfessionalAccess.poll.body.data[0].resource.meta.claims,
    EXAMPLE_CONSENT_ACCESS_RULES.revokedPhysicianEmailConsent,
  );
  assert.equal(disabledIndividual.poll.body.status, 'disabled');
  assert.equal(purgedIndividual.poll.body.status, 'purged');
  assert.equal(disabledTenant.poll.body.status, 'disabled');
  assert.equal(purgedTenant.poll.body.status, 'purged');
  await assert.rejects(
    () => getBackendSubjectIndexComposition(profileRuntime, {
      subjectId: individualControllerLoadRequest.subjectDid,
      userId: individualControllerLoadRequest.profileDid,
      userRoleCode: individualControllerLoadRequest.actorRole,
    }),
    /has not loaded one backend profile/i,
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ActorKinds,
  EXAMPLE_CLINICAL_SECTION_ALLERGIES,
  EXAMPLE_CLINICAL_SECTION_HISTORY_MEDICATION,
  EXAMPLE_EMPLOYEE_DOCTOR_ACTIVE,
  EXAMPLE_EMAIL_PROFESSIONAL,
  EXAMPLE_LICENSE_LIST_RESPONSE_BODY,
  EXAMPLE_ORGANIZATION_CONTROLLER_ROLE,
  EXAMPLE_PROFILE_APP_TYPE_FAMILY,
  EXAMPLE_PROFILE_EMAIL,
  EXAMPLE_PROFILE_ID,
  EXAMPLE_PROFILE_KEY_ACCESS_MODE_SERVER,
  EXAMPLE_PROFILE_LOCAL_PIN_PASSWORD_BACKEND,
  EXAMPLE_PROFILE_PROVIDER_DID,
  EXAMPLE_PROFILE_RUNTIME_CLASS_SERVER,
  EXAMPLE_SUBJECT_DID,
  HealthcareBasicSections,
  buildConsentPermissionTemplateImportExportSessionExample,
  buildIpsClinicalHistoryBundleExample,
} from 'gdc-common-utils-ts';
import {
  createBackendProfileRuntime,
  createOrganizationControllerProfileWorkspace,
  createProfessionalProfileWorkspace,
  prepareLoadProfile,
} from '../dist/index.js';

test('101: profile workspace exposes the chainable high-level surface for organization and professional flows', async () => {
  const backendProfileRuntime = createBackendProfileRuntime({
    facadeClient: {},
  });

  const organizationControllerProfile = await backendProfileRuntime.loadProfile(
    prepareLoadProfile({
      actorKind: ActorKinds.OrganizationController,
      providerDid: EXAMPLE_PROFILE_PROVIDER_DID,
      runtimeClass: EXAMPLE_PROFILE_RUNTIME_CLASS_SERVER,
      keyAccessMode: EXAMPLE_PROFILE_KEY_ACCESS_MODE_SERVER,
      actorRole: EXAMPLE_ORGANIZATION_CONTROLLER_ROLE,
      profileId: `${EXAMPLE_PROFILE_ID}-organization-workspace`,
      profileDid: `${EXAMPLE_PROFILE_PROVIDER_DID}:organization-workspace`,
      subjectDid: EXAMPLE_SUBJECT_DID,
      email: EXAMPLE_PROFILE_EMAIL,
      appType: EXAMPLE_PROFILE_APP_TYPE_FAMILY,
      localPinPassword: EXAMPLE_PROFILE_LOCAL_PIN_PASSWORD_BACKEND,
    }),
  );
  const professionalProfile = await backendProfileRuntime.loadProfile(
    prepareLoadProfile({
      actorKind: ActorKinds.Professional,
      providerDid: EXAMPLE_PROFILE_PROVIDER_DID,
      runtimeClass: EXAMPLE_PROFILE_RUNTIME_CLASS_SERVER,
      keyAccessMode: EXAMPLE_PROFILE_KEY_ACCESS_MODE_SERVER,
      actorRole: EXAMPLE_EMPLOYEE_DOCTOR_ACTIVE.role,
      profileId: `${EXAMPLE_PROFILE_ID}-professional-workspace`,
      profileDid: `${EXAMPLE_PROFILE_PROVIDER_DID}:professional-workspace`,
      subjectDid: EXAMPLE_SUBJECT_DID,
      email: EXAMPLE_EMAIL_PROFESSIONAL,
      appType: EXAMPLE_PROFILE_APP_TYPE_FAMILY,
      localPinPassword: EXAMPLE_PROFILE_LOCAL_PIN_PASSWORD_BACKEND,
    }),
  );

  const profileOrgController = createOrganizationControllerProfileWorkspace({
    ...organizationControllerProfile,
    sdk: organizationControllerProfile.actorSessions[0].asOrganizationController(),
  });
  const profileHealthcareProfessional = createProfessionalProfileWorkspace({
    ...professionalProfile,
    sdk: professionalProfile.actorSessions[0].asProfessional(),
  });

  const invoiceEditor = profileOrgController.organization.bundleEditor.invoice()
    .setInvoiceId('invoice-001')
    .setSubjectReference(EXAMPLE_SUBJECT_DID);
  const consentEditor = profileOrgController.organization.bundleEditor.consentTemplate(
    buildConsentPermissionTemplateImportExportSessionExample().bundleInMemory,
  );
  const licenseSummary = profileOrgController.organization.license.processResponseList(
    EXAMPLE_LICENSE_LIST_RESPONSE_BODY,
  );

  const professionalSubject = await profileHealthcareProfessional.subject.use(EXAMPLE_SUBJECT_DID);
  const preparedIpsRequest = professionalSubject.prepareRequestBundleIps.new(
    [EXAMPLE_CLINICAL_SECTION_ALLERGIES],
    'treatment',
  );
  const ipsBundle = buildIpsClinicalHistoryBundleExample().bundleInMemory;
  const processedIpsResponse = professionalSubject.processResponseBundleIps(ipsBundle);
  await professionalSubject.rememberResponseBundleIps(ipsBundle);
  await professionalSubject.addVitalSign({
    identifier: 'vs-001',
    subject: EXAMPLE_SUBJECT_DID,
    effectiveDateTime: '2026-06-18T10:00:00Z',
    code: {
      system: 'http://loinc.org',
      code: '8867-4',
      display: 'Heart rate',
      claim: 'http://loinc.org|8867-4',
    },
    unit: {
      system: 'http://unitsofmeasure.org',
      code: '/min',
      display: 'beats/minute',
      claim: 'http://unitsofmeasure.org|/min',
    },
    valueQuantity: 72,
  });
  const cachedVitalSigns = await professionalSubject.cache.getDisplayableVitalSignResourceIds();

  assert.equal(typeof invoiceEditor.buildInvoiceClaims, 'function');
  assert.equal(typeof consentEditor.getBundleInMemory, 'function');
  assert.equal(licenseSummary.contracted, 2);
  assert.equal(preparedIpsRequest.subjectId, EXAMPLE_SUBJECT_DID);
  assert.equal(preparedIpsRequest.sectionList[0], EXAMPLE_CLINICAL_SECTION_ALLERGIES);
  assert.equal(preparedIpsRequest.summaryOperationRequestReferencePath.includes('composition.subject='), true);
  assert.equal(processedIpsResponse.totalErrors, 0);
  assert.equal(processedIpsResponse.totalResources, 4);
  assert.equal(Array.isArray(processedIpsResponse.views), true);
  assert.equal(Array.isArray(processedIpsResponse.getSections()), true);
  assert.equal(processedIpsResponse.sectionSummary.totalResources, 3);
  assert.equal(processedIpsResponse.getSectionSummary({ sections: [] }).totalResources, 3);
  assert.equal(processedIpsResponse.getSectionSummary().countsBySection[EXAMPLE_CLINICAL_SECTION_ALLERGIES], 1);
  assert.equal(
    processedIpsResponse.getSectionSummary().countsBySection[HealthcareBasicSections.ProblemList.attributeValue],
    1,
  );
  assert.equal(
    processedIpsResponse.getSectionSummary().countsBySection[EXAMPLE_CLINICAL_SECTION_HISTORY_MEDICATION],
    1,
  );
  assert.equal(
    processedIpsResponse.reader
      .inSections([EXAMPLE_CLINICAL_SECTION_ALLERGIES])
      .getAllergies({ clinicalStatus: ['active'] }).length,
    1,
  );
  assert.equal(
    processedIpsResponse.reader
      .inSections([])
      .matchingText('active')
      .paginate({ count: 2, page: 1 })
      .getResources().length,
    2,
  );
  assert.equal(
    processedIpsResponse.reader
      .inSections([EXAMPLE_CLINICAL_SECTION_HISTORY_MEDICATION, EXAMPLE_CLINICAL_SECTION_ALLERGIES])
      .paginate({ count: 1, offset: 1 })
      .getResources().length,
    1,
  );
  assert.equal(
    processedIpsResponse.getMedications({
      sections: [EXAMPLE_CLINICAL_SECTION_HISTORY_MEDICATION],
      status: ['active'],
      count: 1,
      page: 1,
    }).length,
    1,
  );
  assert.equal(
    processedIpsResponse.getConditions({
      sections: [HealthcareBasicSections.ProblemList.attributeValue],
      clinicalStatus: ['active'],
      count: 1,
      page: 1,
    }).length,
    1,
  );
  const firstMedication = processedIpsResponse.getMedications({
    sections: [EXAMPLE_CLINICAL_SECTION_HISTORY_MEDICATION],
    count: 1,
    page: 1,
  })[0];
  assert.equal(
    processedIpsResponse.getLocalTextAndIntDisplay(firstMedication).combined,
    'atorvastatin 20 mg oral tablet',
  );
  assert.match(
    processedIpsResponse.getNarrative(firstMedication).xhtml || '',
    /atorvastatin 20 mg oral tablet/i,
  );
  assert.equal(cachedVitalSigns.length >= 1, true);
});

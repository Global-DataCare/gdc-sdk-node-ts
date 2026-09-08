import {
  ActorKinds,
  BundleEditor,
  BundleEditableResourceTypes,
  BundleTypes,
  CompositionAttesterModes,
  HealthcareActorRoleCodes,
  HL7_CODING_SYSTEM_V3_ROLE_CODE,
  SecureIdTypesIndividual,
  buildIndividualMemberDidWebFromPrivateIdentifiers,
  buildOrganizationAuthorizationUrnCds,
  readRelatedPersonListRecords,
  type OrganizationAuthorizationUrnCdsInput,
  type RelatedPersonListSelection,
} from 'gdc-common-utils-ts';
import {
  buildProfileAttester,
  buildRelatedPersonProfileAttester,
  readEmployeeProfessionalAssignmentIdentifier,
  type IndividualControllerSdk,
  type OrganizationControllerSdk,
  type RouteContext,
  type ServerProfileSessionManager,
  type SubjectSectionUpdateInput,
} from 'gdc-sdk-node-ts';

/** Canonical author for content authored by a professional organization. */
export function buildProfessionalDataAuthorReference(
  input: OrganizationAuthorizationUrnCdsInput,
) {
  return buildOrganizationAuthorizationUrnCds(input);
}

type IndividualControllerEnrollmentInput = Readonly<{
  individualSdk: IndividualControllerSdk;
  profileSessionManager: ServerProfileSessionManager;
  tenantContext: RouteContext;
  registration: Parameters<IndividualControllerSdk['registerIndividualOrganization']>[0];
  /** Exact body returned by the existing RelatedPerson/_search contact/member query. */
  relatedPersonSearchResponseBody: unknown;
  /** Server-side selection using a verified name, telecom, identifier, or patient. */
  relatedPersonSelection: RelatedPersonListSelection;
  verifiedControllerEmail: string;
  ownerId: string;
  profileId: string;
  profilePin: string;
  idToken: string;
  redirectUris: string[];
  clientName: string;
  scopes: string[];
}>;

/**
 * Registers and unlocks an individual-controller profile without inventing
 * person or relationship identifiers. The RelatedPerson comes from the same
 * real contact/member search already used by telephone assistants.
 */
export async function enrollAndOpenIndividualController(
  input: IndividualControllerEnrollmentInput,
) {
  const registration = await input.individualSdk.registerIndividualOrganization(
    input.registration,
  );
  if (!registration.identity) {
    throw new Error('GW registration did not return the individual identity.');
  }

  const order = await input.individualSdk.confirmIndividualOrganizationOrder({
    ...input.tenantContext,
    offerId: registration.offerId,
  });

  // This validates that the selector matched one actual directory row. The
  // returned identifier is the RelatedPerson assignment, not the subject.
  const selectedRelatedPerson = readRelatedPersonListRecords(
    input.relatedPersonSearchResponseBody,
  );
  if (selectedRelatedPerson.length === 0) {
    throw new Error('RelatedPerson/_search returned no controller/member rows.');
  }
  const attester = buildRelatedPersonProfileAttester(
    input.relatedPersonSearchResponseBody,
    input.relatedPersonSelection,
  );

  const actorDid = buildIndividualMemberDidWebFromPrivateIdentifiers({
    providerDidWeb: registration.identity.providerDidWeb,
    secureIdTypeIndividual: SecureIdTypesIndividual.Uuid,
    privateIdValueIndividual: registration.identity.resourceId,
    secureIdTypeMember: SecureIdTypesIndividual.Email,
    privateIdValueMember: input.verifiedControllerEmail,
    roleType: HL7_CODING_SYSTEM_V3_ROLE_CODE,
    roleValue: HealthcareActorRoleCodes.Controller,
  });

  const enrolled = await input.profileSessionManager.enroll({
    ownerId: input.ownerId,
    profileId: input.profileId,
    actorKind: ActorKinds.IndividualController,
    actorMode: 'controller',
    actorDid,
    profileDid: actorDid,
    providerDid: registration.identity.providerDidWeb,
    routeContext: input.tenantContext,
    allowedSubjectDids: [registration.identity.subjectDid],
    pin: input.profilePin,
    idToken: input.idToken,
    activationCode: order.activationCode,
    attester,
    redirectUris: input.redirectUris,
    clientName: input.clientName,
  });

  const session = await input.profileSessionManager.unlock({
    ownerId: input.ownerId,
    profileId: enrolled.profileId,
    subjectDid: registration.identity.subjectDid,
    scopes: input.scopes,
    pin: input.profilePin,
    idToken: input.idToken,
  });
  if (!session.attester) {
    throw new Error('The unlocked profile has no RelatedPerson attester.');
  }

  return input.profileSessionManager.openIndividualController({
    ownerId: input.ownerId,
    sessionId: session.sessionId,
  });
}

type OpenedSubjectSectionWriter = Readonly<{
  profile: Readonly<{
    actorDid: string;
    attester?: SubjectSectionUpdateInput['attester'];
  }>;
  sdk: Readonly<{
    updateSubjectSection: IndividualControllerSdk['updateSubjectSection'];
  }>;
}>;

/**
 * Writes any supported subject section with independent author and attester.
 * `input.dataAuthorReference` identifies the author/source of this write;
 * the unlocked profile contributes the stable attester and authenticated sender.
 */
export async function updateSubjectSection(
  openedProfile: OpenedSubjectSectionWriter,
  tenantContext: RouteContext,
  input: Omit<SubjectSectionUpdateInput, 'sender' | 'attester'>,
) {
  if (!openedProfile.profile.attester) {
    throw new Error('The unlocked profile has no attester assignment.');
  }
  return openedProfile.sdk.updateSubjectSection(tenantContext, {
    ...input,
    sender: openedProfile.profile.actorDid,
    attester: openedProfile.profile.attester,
  });
}

/** Copyable CREATE example. All identifiers and data are caller inputs. */
export function buildAllergyCreate(input: Readonly<{
  resourceId: string;
  identifier: string;
  subjectDid: string;
  code: string;
}>) {
  const editor = new BundleEditor().setBundleType(BundleTypes.batch);
  editor
    .newEntryAs(BundleEditableResourceTypes.allergyIntolerance, input.resourceId)
    .create()
    .setIdentifier(input.identifier)
    .setSubject(input.subjectDid)
    .setCode(input.code);
  return editor.build();
}

/** Copyable UPDATE example with optimistic concurrency. */
export function buildAllergyUpdate(input: Readonly<{
  resourceId: string;
  currentVersionId: string;
  identifier: string;
  subjectDid: string;
  code: string;
}>) {
  const editor = new BundleEditor().setBundleType(BundleTypes.batch);
  editor
    .newEntryAs(BundleEditableResourceTypes.allergyIntolerance, input.resourceId)
    .update()
    .ifMatch(input.currentVersionId)
    .setIdentifier(input.identifier)
    .setSubject(input.subjectDid)
    .setCode(input.code);
  return editor.build();
}

/** Copyable DELETE example; DELETE carries no resource body. */
export function buildAllergyDelete(input: Readonly<{
  resourceId: string;
  currentVersionId: string;
}>) {
  const editor = new BundleEditor().setBundleType(BundleTypes.batch);
  editor
    .newEntryAs(BundleEditableResourceTypes.allergyIntolerance, input.resourceId)
    .delete()
    .ifMatch(input.currentVersionId);
  return editor.build();
}

type ProfessionalEnrollmentInput = Readonly<{
  organizationControllerSdk: OrganizationControllerSdk;
  profileSessionManager: ServerProfileSessionManager;
  tenantContext: RouteContext;
  provisioning: Parameters<OrganizationControllerSdk['provisionOrganizationEmployee']>[1];
  ownerId: string;
  profileId: string;
  actorDid: string;
  providerDid: string;
  allowedSubjectDids: string[];
  profilePin: string;
  idToken: string;
  professionalProof: NonNullable<Parameters<ServerProfileSessionManager['enroll']>[0]['professionalProof']>;
  redirectUris: string[];
  clientName: string;
}>;

/** Professional equivalent: PractitionerRole comes from the real Employee receipt. */
export async function enrollAndOpenProfessional(input: ProfessionalEnrollmentInput) {
  const provisioning = await input.organizationControllerSdk.provisionOrganizationEmployee(
    input.tenantContext,
    input.provisioning,
  );
  const assignmentIdentifier = readEmployeeProfessionalAssignmentIdentifier(
    provisioning.employee.poll.body,
  );
  if (!assignmentIdentifier) {
    throw new Error('Employee creation did not return its contained PractitionerRole.');
  }
  const enrolled = await input.profileSessionManager.enroll({
    ownerId: input.ownerId,
    profileId: input.profileId,
    actorKind: ActorKinds.OrganizationEmployee,
    actorMode: 'member',
    actorDid: input.actorDid,
    profileDid: input.actorDid,
    providerDid: input.providerDid,
    routeContext: input.tenantContext,
    allowedSubjectDids: input.allowedSubjectDids,
    pin: input.profilePin,
    idToken: input.idToken,
    activationCode: provisioning.activationCode,
    attester: buildProfileAttester({
      assignmentIdentifier,
      mode: CompositionAttesterModes.Professional,
    }),
    professionalProof: input.professionalProof,
    redirectUris: input.redirectUris,
    clientName: input.clientName,
  });
  return input.profileSessionManager.openProfessional({
    ownerId: input.ownerId,
    profileId: enrolled.profileId,
    idToken: input.idToken,
    professionalProof: input.professionalProof,
    pin: input.profilePin,
  });
}

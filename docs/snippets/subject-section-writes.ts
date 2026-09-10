import {
  ActorKinds,
  BundleEditor,
  BundleEditableResourceTypes,
  BundleTypes,
  CompositionAttesterModes,
  HealthcareSummarySections,
  buildOrganizationAuthorizationUrnCds,
  type OrganizationAuthorizationUrnCdsInput,
} from 'gdc-common-utils-ts';
import {
  buildProfileAttester,
  readEmployeeProfessionalAssignmentIdentifier,
  type IndividualControllerSdk,
  type IndividualControllerSubjectSectionUpdateInput,
  type OrganizationControllerSdk,
  type OpenedServerIndividualController,
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
  ownerId: string;
  profileId: string;
  profilePin: string;
  idToken: string;
  redirectUris: string[];
  clientName: string;
}>;

/**
 * Enrolls, but does not open, an individual-controller profile. GW derives the
 * principal controller from Organization.owner, issues its RESPRSN licence
 * and automatically materializes the RelatedPerson assignment.
 * When `input.registration.controllerIdentifier` is absent, the SDK creates
 * the canonical UUID once and sends it as Organization.owner.identifier.value;
 * email/telephone are contact and notification channels, never creator identity.
 */
export async function enrollIndividualControllerProfile(
  input: IndividualControllerEnrollmentInput,
) {
  const registration = await input.individualSdk.registerIndividualOrganization(
    input.registration,
  );
  if (!registration.identity) {
    throw new Error('GW registration did not return the individual identity.');
  }
  // Example shapes returned by GW:
  // registration.offerId: "urn:offer:family-003"
  // registration.identity.resourceId: "a87e5b15-aea4-4475-9c7c-40aa88354b6f"
  // registration.identity.providerDidWeb:
  // "did:web:host.example.com:health-care:organization:taxid:ES-B00112233"
  // registration.identity.subjectDid:
  // "did:web:host.example.com:health-care:organization:taxid:ES-B00112233:individual:multibase:zMomQqDS8U8M8MxEbzn7gjG"

  const order = await input.individualSdk.confirmIndividualOrganizationOrder({
    ...input.tenantContext,
    offerId: registration.offerId,
  });
  // Application code passes both typed SDK results unchanged. It does not
  // extract IndividualProduct.serialNumber, Organization.owner.identifier,
  // RelatedPerson.identifier or construct document-attester metadata.
  const enrolled = await input.profileSessionManager.enrollSelfIndividualController({
    ownerId: input.ownerId,
    profileId: input.profileId,
    registration,
    order,
    routeContext: input.tenantContext,
    pin: input.profilePin,
    idToken: input.idToken,
    redirectUris: input.redirectUris,
    clientName: input.clientName,
  });

  // Example enrolled.profileId: "individual-controller-profile-001".
  // Enrollment consumed the activation code and persisted the protected
  // wallet/DCR profile. It did not open a normal SMART working session.
  return {
    registration,
    order,
    enrolled,
  };
}

type IndividualControllerOpenInput = Readonly<{
  profileSessionManager: ServerProfileSessionManager;
  ownerId: string;
  profileId: string;
  subjectDid: string;
  scopes: string[];
  profilePin: string;
  idToken: string;
}>;

/** Opens a previously enrolled individual-controller profile. */
export async function openIndividualControllerProfile(
  input: IndividualControllerOpenInput,
) {
  const session = await input.profileSessionManager.unlock({
    ownerId: input.ownerId,
    profileId: input.profileId,
    subjectDid: input.subjectDid,
    scopes: input.scopes,
    pin: input.profilePin,
    idToken: input.idToken,
  });
  // Example shape: Fm8EpxJg0S6gHh8mL4q2KcXvB7aN9tRyUw3dZi1oP5Q
  // session.sessionId is a short-lived, random base64url handle. It is not the
  // RelatedPerson URN, profileId, DID, activation code, or SMART access token.
  const openedProfile = await input.profileSessionManager.openIndividualController({
    ownerId: input.ownerId,
    sessionId: session.sessionId,
  });
  // Only a later document write or demo clone asks the SDK for this URI.
  // Example: urn:uuid:033ceb35-2528-402e-8385-f22e12f57805
  openedProfile.getAttesterUriForDocs();
  // No Order is involved in this or any subsequent login. The source may be
  // any supported FHIR Bundle/document; it does not have to be an IPS.
  return openedProfile;
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
  input: IndividualControllerSubjectSectionUpdateInput,
) {
  // openIndividualController() binds the protected RESPRSN attester to this
  // facade. Application code does not repeat it on each section mutation.
  return openedProfile.sdk.updateSubjectSection(tenantContext, input);
}

/**
 * Self-authored allergy mutation after a normal profile open.
 * The same protected RESPRSN UUID is the data author and default attester.
 */
export async function updateSelfAuthoredAllergySection(
  openedProfile: OpenedServerIndividualController,
  tenantContext: RouteContext,
  allergyCreateBundle: Record<string, unknown>,
) {
  const controllerReference = openedProfile.getAttesterUriForDocs();
  // Example controllerReference:
  // "urn:uuid:033ceb35-2528-402e-8385-f22e12f57805".
  return openedProfile.sdk.updateSubjectSection(tenantContext, {
    subject: openedProfile.profile.profileDid,
    section: HealthcareSummarySections.AllergiesAndIntolerances.attributeValue,
    dataAuthorReference: controllerReference,
    // `attester` is omitted: the opened facade supplies profile.attester.
    bundle: allergyCreateBundle,
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

/** Enrolls, but does not open, a professional profile from the real Employee receipt. */
export async function enrollProfessionalProfile(input: ProfessionalEnrollmentInput) {
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
  return input.profileSessionManager.enroll({
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
}

type ProfessionalOpenInput = Readonly<{
  profileSessionManager: ServerProfileSessionManager;
  ownerId: string;
  profileId: string;
  profilePin: string;
  idToken: string;
  professionalProof: ProfessionalEnrollmentInput['professionalProof'];
}>;

/** Opens an already enrolled professional profile during this or a later login. */
export async function openProfessionalProfile(input: ProfessionalOpenInput) {
  return input.profileSessionManager.openProfessional({
    ownerId: input.ownerId,
    profileId: input.profileId,
    idToken: input.idToken,
    professionalProof: input.professionalProof,
    pin: input.profilePin,
  });
}

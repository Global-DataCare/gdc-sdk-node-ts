// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import {
  ClinicalSourceAuthorSelections,
  cloneImportedClinicalDocumentForDemo,
  loadBackendIndividualControllerProfile,
  loadBackendIndividualMemberProfile,
  loadBackendProfessionalProfile,
  type BackendProfileRuntimeClient,
  type ClinicalSourceAuthorSelection,
  type ProfileLoadRequest,
  type RouteContext,
  type ServerProfileSessionManager,
} from 'gdc-sdk-node-ts';

/** Closed BFF choice; no browser-supplied FHIR reference is accepted. */
export const PersonalContentOrigins = Object.freeze({
  Individual: ClinicalSourceAuthorSelections.Owner,
  Member: ClinicalSourceAuthorSelections.Creator,
});

type ClinicalCreatorProfileManager = Pick<
  ServerProfileSessionManager,
  'exportClinicalCreatorIps'
>;

/**
 * Identities selected before either actor-specific journey starts.
 *
 * The individual owns the clinical data and is the FHIR subject. The index
 * provider hosts that individual's index and receives the operation. Neither
 * value identifies the professional organization that may author new data.
 */
export type AuthorizedIndividualIndex = Readonly<{
  individualDid: string;
  indexProviderDid: string;
  indexProviderRouteContext: RouteContext;
}>;

/**
 * Server-owned selection of one protected profile. `profileAccountId` is the
 * BFF account that owns the encrypted profile/wallet record; it is not the
 * owner of the individual's clinical data and it is never sent to GW.
 */
export type ProtectedProfileSelection = Readonly<{
  profileAccountId: string;
  loadRequest: ProfileLoadRequest;
}>;

type HighLevelClinicalDependencies = Readonly<{
  profileRuntime: BackendProfileRuntimeClient;
  profileManager: ClinicalCreatorProfileManager;
}>;

function loadRequestForIndex(
  loadRequest: ProfileLoadRequest,
  indexProviderDid: string,
): ProfileLoadRequest {
  return {
    ...loadRequest,
    // Public ProfileLoadRequest calls this property `providerDid`. Here its
    // value is specifically the index provider selected for the individual.
    providerDid: indexProviderDid,
  };
}

function requireActorDid(actorDid: string | undefined): string {
  if (!actorDid) {
    throw new Error('The loaded profile did not provide its operational actor DID.');
  }
  return actorDid;
}

/**
 * Professional flow: load the professional profile and create/update one
 * editable multi-section document in an individual's index.
 *
 * The sender is the professional actor DID. The recipient is the index
 * provider. The professional organization author and PractitionerRole
 * attester come from the protected creator export, never from browser input.
 */
export async function updateEditableSummaryAsProfessional(input: Readonly<{
  dependencies: HighLevelClinicalDependencies;
  profile: ProtectedProfileSelection;
  index: AuthorizedIndividualIndex;
  sourceDocument: Record<string, unknown>;
}>) {
  const { profileRuntime, profileManager } = input.dependencies;
  const { profileAccountId, loadRequest } = input.profile;
  const { individualDid, indexProviderDid, indexProviderRouteContext } = input.index;

  const professionalProfile = await loadBackendProfessionalProfile(
    profileRuntime,
    loadRequestForIndex(loadRequest, indexProviderDid),
  );
  const professionalActorDid = requireActorDid(professionalProfile.session.actorDid);
  const professionalCreator = await profileManager.exportClinicalCreatorIps({
    ownerId: profileAccountId,
    profileId: professionalProfile.profile.descriptor.profileId,
  });

  // This creates a separate editable local document. It never mutates the
  // imported source and never turns professionalProfile.session.actorDid into
  // Composition.author.
  const editableCopy = cloneImportedClinicalDocumentForDemo({
    bundle: input.sourceDocument,
    clinicalCreator: professionalCreator,
  });

  const write = await professionalProfile.sdk.updateClinicalSummary(
    indexProviderRouteContext,
    {
      subject: individualDid,
      sender: professionalActorDid,
      recipient: indexProviderDid,
      bundle: editableCopy,
      clinicalFormat: 'r4',
    },
  );

  // Read back the authoritative document instead of treating an optimistic UI
  // update or an accepted asynchronous request as proof of persistence.
  const readback = await professionalProfile.sdk.requestClinicalSummary(
    indexProviderRouteContext,
    {
      subjectId: individualDid,
      requesterId: professionalActorDid,
    },
  );
  return { write, readback };
}

/**
 * Individual-controller flow: load the controller profile and create/update
 * one editable multi-section document. `sourceAuthor` selects whether the
 * individual originated/dictated the content or the controller originated it;
 * the registered RelatedPerson remains the attester. No professional
 * organization participates in this authorship path.
 */
export async function updateEditableSummaryAsIndividualController(input: Readonly<{
  dependencies: HighLevelClinicalDependencies;
  profile: ProtectedProfileSelection;
  index: AuthorizedIndividualIndex;
  sourceDocument: Record<string, unknown>;
  sourceAuthor: ClinicalSourceAuthorSelection;
}>) {
  const { profileRuntime, profileManager } = input.dependencies;
  const { profileAccountId, loadRequest } = input.profile;
  const { individualDid, indexProviderDid, indexProviderRouteContext } = input.index;

  const individualControllerProfile = await loadBackendIndividualControllerProfile(
    profileRuntime,
    loadRequestForIndex(loadRequest, indexProviderDid),
  );
  const controllerActorDid = requireActorDid(
    individualControllerProfile.session.actorDid,
  );
  const individualCreator = await profileManager.exportClinicalCreatorIps({
    ownerId: profileAccountId,
    profileId: individualControllerProfile.profile.descriptor.profileId,
    sourceAuthor: input.sourceAuthor,
  });
  const editableCopy = cloneImportedClinicalDocumentForDemo({
    bundle: input.sourceDocument,
    clinicalCreator: individualCreator,
  });

  const write = await individualControllerProfile.sdk.updateClinicalSummary(
    indexProviderRouteContext,
    {
      subject: individualDid,
      sender: controllerActorDid,
      recipient: indexProviderDid,
      bundle: editableCopy,
      clinicalFormat: 'r4',
    },
  );
  const readback = await individualControllerProfile.sdk.requestClinicalSummary(
    indexProviderRouteContext,
    {
      subjectId: individualDid,
      requesterId: controllerActorDid,
    },
  );
  return { write, readback };
}

/**
 * Individual-member/caregiver flow: it has the same index destination as the
 * controller flow but loads the accepted RelatedPerson role-specific facade.
 * Its explicit `sourceAuthor` distinguishes individual-originated/dictated
 * content from member-originated content without changing the sender.
 * This facade may create or update authorized data; it does not expose the
 * external IPS import operation.
 */
export async function updateEditableSummaryAsIndividualMember(input: Readonly<{
  dependencies: HighLevelClinicalDependencies;
  profile: ProtectedProfileSelection;
  index: AuthorizedIndividualIndex;
  sourceDocument: Record<string, unknown>;
  sourceAuthor: ClinicalSourceAuthorSelection;
}>) {
  const { profileRuntime, profileManager } = input.dependencies;
  const { profileAccountId, loadRequest } = input.profile;
  const { individualDid, indexProviderDid, indexProviderRouteContext } = input.index;

  const individualMemberProfile = await loadBackendIndividualMemberProfile(
    profileRuntime,
    loadRequestForIndex(loadRequest, indexProviderDid),
  );
  const memberActorDid = requireActorDid(individualMemberProfile.session.actorDid);
  const individualCreator = await profileManager.exportClinicalCreatorIps({
    ownerId: profileAccountId,
    profileId: individualMemberProfile.profile.descriptor.profileId,
    sourceAuthor: input.sourceAuthor,
  });
  const editableCopy = cloneImportedClinicalDocumentForDemo({
    bundle: input.sourceDocument,
    clinicalCreator: individualCreator,
  });

  const write = await individualMemberProfile.sdk.updateClinicalSummary(
    indexProviderRouteContext,
    {
      subject: individualDid,
      sender: memberActorDid,
      recipient: indexProviderDid,
      bundle: editableCopy,
      clinicalFormat: 'r4',
    },
  );
  const readback = await individualMemberProfile.sdk.requestClinicalSummary(
    indexProviderRouteContext,
    {
      subjectId: individualDid,
      requesterId: memberActorDid,
    },
  );
  return { write, readback };
}

/**
 * External import flow: only the individual-controller facade currently
 * exposes the high-level IPS/FHIR import operation. The source document is
 * submitted unchanged so its original author and attesters are preserved.
 */
export async function importExternalIpsAsIndividualController(input: Readonly<{
  profileRuntime: BackendProfileRuntimeClient;
  profile: ProtectedProfileSelection;
  index: AuthorizedIndividualIndex;
  externalIpsDocument: Record<string, unknown>;
}>) {
  const { individualDid, indexProviderDid, indexProviderRouteContext } = input.index;
  const individualControllerProfile = await loadBackendIndividualControllerProfile(
    input.profileRuntime,
    loadRequestForIndex(input.profile.loadRequest, indexProviderDid),
  );
  const controllerActorDid = requireActorDid(
    individualControllerProfile.session.actorDid,
  );

  // Do not call cloneImportedClinicalDocumentForDemo here. A normal import
  // preserves the external Composition.author and Composition.attester values.
  const imported = await individualControllerProfile.sdk.importIpsOrFhirAndUpdateIndex(
    indexProviderRouteContext,
    {
      compositionPayload: input.externalIpsDocument,
      format: 'r4',
    },
  );
  const readback = await individualControllerProfile.sdk.requestClinicalSummary(
    indexProviderRouteContext,
    {
      subjectId: individualDid,
      requesterId: controllerActorDid,
    },
  );
  return { imported, readback };
}

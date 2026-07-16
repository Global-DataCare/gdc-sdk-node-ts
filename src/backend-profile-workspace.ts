// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import { ActorKinds } from 'gdc-common-utils-ts/constants/actor-session';
import type {
  ProfileLoadRequest,
  SubjectIndexCompositionRequest,
  SubjectIndexConnectionRequest,
  TrustedDeviceRegistrationRequest,
} from 'gdc-sdk-core-ts';
import type {
  BackendLoadedActorProfile,
  BackendProfileRuntimeClient,
  BackendSubjectIndexCompositionResult,
  BackendSubjectIndexConnectionResult,
  BackendTrustedDeviceRegistrationResult,
} from './backend-profile-runtime.js';
import {
  closeBackendProfile,
  connectBackendToSubjectIndex,
  getBackendSubjectIndexComposition,
  registerBackendTrustedDevice,
} from './backend-profile-runtime.js';
import {
  createOrganizationControllerProfileWorkspace,
  createProfessionalProfileWorkspace,
  type OrganizationControllerProfileWorkspace,
  type ProfessionalProfileWorkspace,
} from './profile-workspace.js';
import type { ActorSession } from './session.js';
import { HostOnboardingSdk } from './orchestration/host-onboarding-sdk.js';
import { IndividualControllerSdk } from './orchestration/individual-controller-sdk.js';
import { IndividualMemberSdk } from './orchestration/individual-member-sdk.js';
import { OrganizationControllerSdk } from './orchestration/organization-controller-sdk.js';
import { OrganizationEmployeeSdk } from './orchestration/organization-employee-sdk.js';
import { ProfessionalSdk } from './orchestration/professional-sdk.js';

function requireActorSession(
  profile: BackendLoadedActorProfile,
  actorKind: string,
): ActorSession {
  const session = profile.actorSessions.find((candidate) => candidate.actorKind === actorKind);
  if (!session) {
    throw new Error(`Loaded backend profile does not expose actor kind '${actorKind}'.`);
  }
  return session;
}

/**
 * Backend loaded-profile workspace that keeps the canonical
 * `loadProfile -> workspace/session -> actor facade` story explicit.
 */
export class LoadedProfileWorkspace {
  constructor(
    private readonly profileRuntime: BackendProfileRuntimeClient,
    public readonly profile: BackendLoadedActorProfile,
  ) {}

  public close(): Promise<void> {
    return closeBackendProfile(
      this.profileRuntime,
      String(this.profile.descriptor.profileDid || this.profile.descriptor.profileId),
    );
  }

  public registerTrustedDevice(
    input: TrustedDeviceRegistrationRequest,
  ): Promise<BackendTrustedDeviceRegistrationResult> {
    return registerBackendTrustedDevice(this.profileRuntime, input);
  }

  public connectToSubjectIndex(
    input: SubjectIndexConnectionRequest,
  ): Promise<BackendSubjectIndexConnectionResult> {
    return connectBackendToSubjectIndex(this.profileRuntime, input);
  }

  public getSubjectIndexComposition(
    input: SubjectIndexCompositionRequest,
  ): Promise<BackendSubjectIndexCompositionResult> {
    return getBackendSubjectIndexComposition(this.profileRuntime, input);
  }

  public asHostOnboarding(): HostOnboardingSdk {
    return requireActorSession(this.profile, ActorKinds.HostOnboarding).asHostOnboarding();
  }

  public asOrganizationController(): OrganizationControllerSdk {
    return requireActorSession(this.profile, ActorKinds.OrganizationController).asOrganizationController();
  }

  public asOrganizationEmployee(): OrganizationEmployeeSdk {
    return requireActorSession(this.profile, ActorKinds.OrganizationEmployee).asOrganizationEmployee();
  }

  public asIndividualController(): IndividualControllerSdk {
    return requireActorSession(this.profile, ActorKinds.IndividualController).asIndividualController();
  }

  public asIndividualMember(): IndividualMemberSdk {
    return requireActorSession(this.profile, ActorKinds.IndividualMember).asIndividualMember();
  }

  public asProfessional(): ProfessionalSdk {
    return requireActorSession(this.profile, ActorKinds.Professional).asProfessional();
  }

  public createOrganizationControllerWorkspace(): OrganizationControllerProfileWorkspace {
    const session = requireActorSession(this.profile, ActorKinds.OrganizationController);
    return createOrganizationControllerProfileWorkspace({
      profile: this.profile,
      session,
      sdk: this.asOrganizationController(),
    });
  }

  public createProfessionalWorkspace(): ProfessionalProfileWorkspace {
    const session = requireActorSession(this.profile, ActorKinds.Professional);
    return createProfessionalProfileWorkspace({
      profile: this.profile,
      session,
      sdk: this.asProfessional(),
    });
  }
}

export class ProfileRuntime {
  constructor(
    private readonly profileRuntime: BackendProfileRuntimeClient,
  ) {}

  public async loadProfile(
    input: ProfileLoadRequest,
  ): Promise<LoadedProfileWorkspace> {
    const profile = await this.profileRuntime.loadProfile!(input);
    return new LoadedProfileWorkspace(this.profileRuntime, profile);
  }
}

export function createLoadedProfileWorkspace(
  profileRuntime: BackendProfileRuntimeClient,
  profile: BackendLoadedActorProfile,
): LoadedProfileWorkspace {
  return new LoadedProfileWorkspace(profileRuntime, profile);
}

/**
 * @deprecated Prefer `LoadedProfileWorkspace`.
 */
export { LoadedProfileWorkspace as BackendProfileWorkspace };

/**
 * @deprecated Prefer `ProfileRuntime`.
 */
export { ProfileRuntime as BackendProfileWorkspaceRuntime };

/**
 * @deprecated Prefer `createLoadedProfileWorkspace`.
 */
export { createLoadedProfileWorkspace as createBackendProfileWorkspace };

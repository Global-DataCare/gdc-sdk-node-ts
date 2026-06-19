// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import { ActorKinds } from 'gdc-common-utils-ts/constants/actor-session';
import { ProfileAppTypes } from 'gdc-common-utils-ts/constants';
import { JobStatus, type JobRequest } from 'gdc-common-utils-ts/models/confidential-job';
import type { IDecodedDidcommPayload } from 'gdc-common-utils-ts/models/confidential-message';
import type { ServiceEndpointSelector } from 'gdc-common-utils-ts/models/did';
import type {
  ActorProfileDescriptor,
  IJobManager,
  ActorKind,
  LoadedActorProfile,
  ProfileLoadRequest,
  SubjectIndexCompositionRequest,
  SubjectIndexConnectionRequest,
  TrustedDeviceRegistrationRequest,
  VaultQuery,
} from 'gdc-sdk-core-ts';
import {
  buildActorSessionDescriptorForActorKind,
  expandActorSessionDescriptorToFacades,
  prepareLoadedActorProfile,
  prepareLoadProfile,
} from 'gdc-sdk-core-ts';
import { createActorSessionsFromFacades } from './gdc-session-bridge.js';
import type { ActorSession } from './session.js';
import type { RuntimeClient } from './orchestration/client-port.js';
import { IndividualControllerSdk } from './orchestration/individual-controller-sdk.js';
import { OrganizationControllerSdk } from './orchestration/organization-controller-sdk.js';
import { ProfessionalSdk } from './orchestration/professional-sdk.js';
import type { RouteContext } from './individual-onboarding.js';

/**
 * Result of registering one trusted backend runtime device/profile context.
 *
 * This is intentionally backend-generic. It does not describe one concrete
 * channel or product flow.
 */
export type BackendTrustedDeviceRegistrationResult = {
  trustedDeviceId: string;
  status: 'registered' | 'already-trusted';
};

/**
 * Result of connecting one loaded actor profile to one subject index.
 */
export type BackendSubjectIndexConnectionResult = {
  subjectId: string;
  userId: string;
  userRoleCode: string;
  status: 'connected' | 'already-connected';
};

/**
 * Result of reading one subject index composition after the relationship is
 * already established.
 */
export type BackendSubjectIndexCompositionResult = {
  subjectId: string;
  userId: string;
  userRoleCode: string;
  composition: unknown;
};

export const BackendSubjectIndexReadModes = Object.freeze({
  LatestIps: 'latest-ips',
  ClinicalBundle: 'clinical-bundle',
});

export type BackendSubjectIndexReadMode =
  typeof BackendSubjectIndexReadModes[keyof typeof BackendSubjectIndexReadModes];

/**
 * Backend materialization of one loaded actor profile with runtime sessions
 * ready to expose actor-scoped facades.
 */
export type BackendLoadedActorProfile = LoadedActorProfile & {
  actorSessions: ActorSession[];
};

export type BackendIndividualControllerProfile = {
  profile: BackendLoadedActorProfile;
  session: ActorSession;
  sdk: IndividualControllerSdk;
};

export type BackendOrganizationControllerProfile = {
  profile: BackendLoadedActorProfile;
  session: ActorSession;
  sdk: OrganizationControllerSdk;
};

export type BackendProfessionalProfile = {
  profile: BackendLoadedActorProfile;
  session: ActorSession;
  sdk: ProfessionalSdk;
};

/**
 * Canonical backend runtime contract for loading one actor profile after
 * authentication and then working with trusted device registration and subject
 * index access.
 *
 * This surface is intentionally generic for BFF or other backend runtimes.
 * It does not encode one product-specific interaction channel.
 */
export type BackendProfileRuntimeClient = {
  loadProfile?: (input: ProfileLoadRequest) => Promise<BackendLoadedActorProfile>;
  closeProfile?: (profileKey: string) => Promise<void>;
  registerTrustedDevice?: (
    input: TrustedDeviceRegistrationRequest,
  ) => Promise<BackendTrustedDeviceRegistrationResult>;
  connectToSubjectIndex?: (
    input: SubjectIndexConnectionRequest,
  ) => Promise<BackendSubjectIndexConnectionResult>;
  getSubjectIndexComposition?: (
    input: SubjectIndexCompositionRequest,
  ) => Promise<BackendSubjectIndexCompositionResult>;
};

export type BackendProfileRuntimeAdapters = {
  loadProfile(input: ProfileLoadRequest): Promise<LoadedActorProfile>;
  registerTrustedDevice(
    input: TrustedDeviceRegistrationRequest,
  ): Promise<BackendTrustedDeviceRegistrationResult>;
  connectToSubjectIndex(
    input: SubjectIndexConnectionRequest,
  ): Promise<BackendSubjectIndexConnectionResult>;
  getSubjectIndexComposition(
    input: SubjectIndexCompositionRequest,
  ): Promise<BackendSubjectIndexCompositionResult>;
};

export type BackendProfileRuntimeOptions = {
  /**
   * Runtime client injected into the materialized actor sessions so backend
   * consumers can immediately call `asIndividualController()`,
   * `asProfessional()`, and the other actor-specific facades after
   * `loadProfile(...)`.
   */
  facadeClient?: RuntimeClient;
};

export type BackendLoadedProfileKey = string;

export type DirectBackendProfileRuntimeOptions = BackendProfileRuntimeOptions & {
  /**
   * Default route context reused by the current GW CORE subject-index fallback.
   *
   * This is intentionally optional because some integrators only need
   * `loadProfile(...)` plus explicit actor facades first.
   */
  defaultRouteContext?: RouteContext;
  /**
   * Current temporary CORE-facing index read helper to use when the caller asks
   * for one subject index composition through the profile runtime.
   *
   * Until GW CORE freezes one canonical public profile-runtime read contract,
   * keep this selectable instead of hardcoding one final wording.
   */
  subjectIndexReadMode?: BackendSubjectIndexReadMode;
  /**
   * Optional override for trusted-device registration while GW CORE finalizes
   * the backend runtime contract for that step.
   */
  registerTrustedDevice?: (
    input: TrustedDeviceRegistrationRequest,
  ) => Promise<BackendTrustedDeviceRegistrationResult>;
  /**
   * Optional override for backend subject-index connection while GW CORE
   * finalizes the stable contract for that step.
   */
  connectToSubjectIndex?: (
    input: SubjectIndexConnectionRequest,
  ) => Promise<BackendSubjectIndexConnectionResult>;
  /**
   * Optional override for reading the subject index after connection.
   */
  getSubjectIndexComposition?: (
    input: SubjectIndexCompositionRequest,
  ) => Promise<BackendSubjectIndexCompositionResult>;
  /**
   * Optional custom job-manager factory. When omitted, the backend runtime
   * creates one in-memory job manager so `loadProfile(...)` returns one
   * complete v2 profile object immediately.
   */
  createJobManager?: (
    descriptor: ActorProfileDescriptor,
    input: ProfileLoadRequest,
  ) => IJobManager;
};

/**
 * Default backend-generic runtime implementation backed by injected adapters.
 *
 * This class is the first concrete v2 slice intended for backend consumers that
 * need one reusable actor-aware profile runtime after authentication.
 */
export class BackendProfileRuntime implements BackendProfileRuntimeClient {
  private readonly adapters: BackendProfileRuntimeAdapters;
  private readonly options: BackendProfileRuntimeOptions;

  constructor(adapters: BackendProfileRuntimeAdapters, options: BackendProfileRuntimeOptions = {}) {
    this.adapters = adapters;
    this.options = options;
  }

  async loadProfile(input: ProfileLoadRequest): Promise<BackendLoadedActorProfile> {
    const loadedProfile = await this.adapters.loadProfile(input);
    return {
      ...loadedProfile,
      actorSessions: createActorSessionsFromFacades(
        loadedProfile.facades,
        this.options.facadeClient,
      ),
    };
  }

  async closeProfile(_profileKey: string): Promise<void> {}

  async registerTrustedDevice(
    input: TrustedDeviceRegistrationRequest,
  ): Promise<BackendTrustedDeviceRegistrationResult> {
    return this.adapters.registerTrustedDevice(input);
  }

  async connectToSubjectIndex(
    input: SubjectIndexConnectionRequest,
  ): Promise<BackendSubjectIndexConnectionResult> {
    return this.adapters.connectToSubjectIndex(input);
  }

  async getSubjectIndexComposition(
    input: SubjectIndexCompositionRequest,
  ): Promise<BackendSubjectIndexCompositionResult> {
    return this.adapters.getSubjectIndexComposition(input);
  }
}

/**
 * Current concrete backend profile runtime over one injected runtime client.
 *
 * This is the pragmatic v2 bridge for backend consumers that already possess
 * an authenticated `RuntimeClient` and need `loadProfile(...)` to materialize
 * actor facades immediately against the current GW CORE contract.
 */
export class DirectBackendProfileRuntime implements BackendProfileRuntimeClient {
  private readonly loadedProfiles = new Map<BackendLoadedProfileKey, BackendLoadedActorProfile>();
  private readonly options: DirectBackendProfileRuntimeOptions;

  constructor(options: DirectBackendProfileRuntimeOptions) {
    this.options = options;
  }

  async loadProfile(input: ProfileLoadRequest): Promise<BackendLoadedActorProfile> {
    const normalized = prepareLoadProfile(input);
    const profileId = String(
      normalized.profileId
      || normalized.profileDid
      || normalized.subjectDid
      || normalized.providerDid,
    ).trim();
    const resolvedAppType = normalized.appType || ProfileAppTypes.Family;
    const descriptor: ActorProfileDescriptor = {
      profileId,
      actorKind: normalized.actorKind,
      actorRole: normalized.actorRole,
      providerDid: normalized.providerDid,
      runtimeClass: normalized.runtimeClass,
      profileDid: normalized.profileDid,
      subjectDid: normalized.subjectDid,
      email: normalized.email,
      phone: normalized.phone,
      deviceDid: normalized.deviceDid,
      appType: resolvedAppType,
    };
    const session = buildActorSessionDescriptorForActorKind({
      actorKind: normalized.actorKind,
      appType: resolvedAppType,
      profileId: descriptor.profileId,
      profileDid: descriptor.profileDid,
      role: descriptor.actorRole,
    });
    const facades = expandActorSessionDescriptorToFacades(session);
    const jobManager = this.options.createJobManager
      ? this.options.createJobManager(descriptor, normalized)
      : createJobManagerInMemory(descriptor);
    const loadedProfile = prepareLoadedActorProfile({
      descriptor,
      session,
      facades,
      jobManager,
    });
    const backendProfile: BackendLoadedActorProfile = {
      ...loadedProfile,
      actorSessions: createActorSessionsFromFacades(
        loadedProfile.facades,
        this.options.facadeClient,
      ),
    };
    this.rememberLoadedProfile(backendProfile);
    return backendProfile;
  }

  async closeProfile(profileKey: string): Promise<void> {
    const profile = this.resolveLoadedProfile(profileKey);
    profile.jobManager.shutdown();
    this.forgetLoadedProfile(profile);
  }

  async registerTrustedDevice(
    input: TrustedDeviceRegistrationRequest,
  ): Promise<BackendTrustedDeviceRegistrationResult> {
    if (this.options.registerTrustedDevice) {
      return this.options.registerTrustedDevice(input);
    }
    return {
      trustedDeviceId: input.deviceDid,
      status: 'already-trusted',
    };
  }

  async connectToSubjectIndex(
    input: SubjectIndexConnectionRequest,
  ): Promise<BackendSubjectIndexConnectionResult> {
    if (this.options.connectToSubjectIndex) {
      return this.options.connectToSubjectIndex(input);
    }
    return {
      subjectId: input.subjectId,
      userId: input.userId,
      userRoleCode: input.userRoleCode,
      status: 'already-connected',
    };
  }

  async getSubjectIndexComposition(
    input: SubjectIndexCompositionRequest,
  ): Promise<BackendSubjectIndexCompositionResult> {
    if (this.options.getSubjectIndexComposition) {
      return this.options.getSubjectIndexComposition(input);
    }
    const routeContext = this.options.defaultRouteContext;
    if (!routeContext) {
      throw new Error('DirectBackendProfileRuntime requires defaultRouteContext to read subject index data.');
    }
    const profile = this.resolveLoadedProfile(input.userId);
    if (profile.descriptor.actorKind !== ActorKinds.IndividualController) {
      throw new Error(
        `DirectBackendProfileRuntime currently resolves subject index reads through IndividualController only, not '${profile.descriptor.actorKind}'.`,
      );
    }
    const sdk = requireBackendIndividualControllerSdk(profile);
    if (this.options.subjectIndexReadMode === BackendSubjectIndexReadModes.ClinicalBundle) {
      const searchResult = await sdk.searchClinicalBundle(routeContext, {
        subject: input.subjectId,
      });
      return {
        subjectId: input.subjectId,
        userId: input.userId,
        userRoleCode: input.userRoleCode,
        composition: searchResult.poll.body,
      };
    }
    const latestIps = await sdk.getLatestIps(routeContext, {
      subject: input.subjectId,
    });
    return {
      subjectId: input.subjectId,
      userId: input.userId,
      userRoleCode: input.userRoleCode,
      composition: latestIps.poll.body,
    };
  }

  private rememberLoadedProfile(profile: BackendLoadedActorProfile): void {
    const keys = new Set<string>([
      profile.descriptor.profileId,
      String(profile.descriptor.profileDid || '').trim(),
      String(profile.descriptor.subjectDid || '').trim(),
      String(profile.descriptor.email || '').trim(),
      String(profile.descriptor.phone || '').trim(),
    ].filter(Boolean));
    for (const key of keys) {
      this.loadedProfiles.set(key, profile);
    }
  }

  private forgetLoadedProfile(profile: BackendLoadedActorProfile): void {
    const keys = new Set<string>([
      profile.descriptor.profileId,
      String(profile.descriptor.profileDid || '').trim(),
      String(profile.descriptor.subjectDid || '').trim(),
      String(profile.descriptor.email || '').trim(),
      String(profile.descriptor.phone || '').trim(),
    ].filter(Boolean));
    for (const key of keys) {
      this.loadedProfiles.delete(key);
    }
  }

  private resolveLoadedProfile(userId: string): BackendLoadedActorProfile {
    const normalizedUserId = String(userId || '').trim();
    const direct = this.loadedProfiles.get(normalizedUserId);
    if (direct) {
      return direct;
    }
    throw new Error(`DirectBackendProfileRuntime has not loaded one backend profile for '${normalizedUserId}'.`);
  }
}

/**
 * Preferred developer-facing factory for the current backend profile runtime.
 *
 * Use this helper in tutorials and app/BFF code when you already have one
 * configured runtime client and want the canonical
 * `loadProfile(...) -> session -> actor facade` entrypoint without exposing the
 * concrete class name in every example.
 */
export function createBackendProfileRuntime(
  options: DirectBackendProfileRuntimeOptions,
): BackendProfileRuntimeClient {
  return new DirectBackendProfileRuntime(options);
}

/**
 * Minimal in-memory `JobManager` for backend runtimes that do not need durable
 * persistence during one live session.
 */
export function createJobManagerInMemory(
  descriptor: ActorProfileDescriptor,
): IJobManager {
  let isInitialized = false;
  let sequence = 0;
  const jobs = new Map<string, JobRequest>();
  let listener: (() => void) | undefined;

  function notify(): void {
    listener?.();
  }

  function nextSequence(): number {
    sequence += 1;
    return sequence;
  }

  function inferFormType(content: IDecodedDidcommPayload | undefined): string {
    const first = Array.isArray(content?.body?.data) ? content.body.data[0] : undefined;
    return String(first?.type || content?.type || '').trim();
  }

  function cloneJob(job: JobRequest): JobRequest {
    return {
      ...job,
      indexed: job.indexed ? structuredClone(job.indexed) : job.indexed,
      content: job.content ? structuredClone(job.content) : job.content,
      jwe: job.jwe ? structuredClone(job.jwe) : job.jwe,
    };
  }

  function matchesQuery(job: JobRequest, query: VaultQuery): boolean {
    const conditions = Array.isArray(query.where) ? query.where : [];
    return conditions.every((condition) => {
      const currentValue = (job as unknown as Record<string, unknown>)[condition.attribute];
      if ('equals' in condition) {
        return currentValue === condition.equals;
      }
      if ('in' in condition) {
        return Array.isArray(condition.in) && condition.in.includes(currentValue);
      }
      return true;
    });
  }

  return {
    descriptor: { ...descriptor },
    get isInitialized() {
      return isInitialized;
    },
    async initialize() {
      isInitialized = true;
    },
    shutdown() {
      isInitialized = false;
      jobs.clear();
    },
    setListener(nextListener) {
      listener = nextListener;
    },
    async createJob(content: IDecodedDidcommPayload, selector: ServiceEndpointSelector) {
      const now = Date.now();
      const job: JobRequest = {
        id: createRuntimeUuid(),
        thid: String(content?.thid || '').trim() || undefined,
        status: JobStatus.DRAFT,
        sequence: nextSequence(),
        createdAtTimestamp: now,
        content: structuredClone(content),
        ...selector,
      };
      jobs.set(job.id, job);
      notify();
      return cloneJob(job);
    },
    async findDraftJobByFormType(formType: string) {
      const normalizedFormType = String(formType || '').trim();
      for (const job of jobs.values()) {
        if (job.status !== JobStatus.DRAFT) continue;
        if (inferFormType(job.content) === normalizedFormType) {
          return cloneJob(job);
        }
      }
      return null;
    },
    async createOrUpdateDraftJob(content: IDecodedDidcommPayload, selector: ServiceEndpointSelector) {
      const formType = inferFormType(content);
      const existing = formType ? await this.findDraftJobByFormType(formType) : null;
      if (!existing) {
        return this.createJob(content, selector);
      }
      const current = jobs.get(existing.id);
      if (!current) {
        return this.createJob(content, selector);
      }
      const updated: JobRequest = {
        ...current,
        ...selector,
        thid: String(content?.thid || '').trim() || current.thid,
        content: structuredClone(content),
        previousSequence: current.sequence,
        sequence: nextSequence(),
      };
      jobs.set(updated.id, updated);
      notify();
      return cloneJob(updated);
    },
    async sync() {},
    async queryJobs(query: VaultQuery) {
      const filtered = [...jobs.values()].filter(job => matchesQuery(job, query));
      if (query.orderBy) {
        const { attribute, direction } = query.orderBy;
        filtered.sort((left, right) => {
          const a = (left as unknown as Record<string, unknown>)[attribute];
          const b = (right as unknown as Record<string, unknown>)[attribute];
          if (a === b) return 0;
          const cmp = a! > b! ? 1 : -1;
          return direction === 'desc' ? -cmp : cmp;
        });
      }
      const offset = Math.max(0, Number(query.offset || 0));
      const limit = query.limit == null ? filtered.length : Math.max(0, Number(query.limit));
      return filtered.slice(offset, offset + limit).map(cloneJob);
    },
    async submitJob(job: JobRequest) {
      const current = jobs.get(job.id);
      if (!current) {
        throw new Error(`JobManager in-memory store cannot submit unknown job '${job.id}'.`);
      }
      jobs.set(job.id, {
        ...current,
        status: JobStatus.SENT,
        previousSequence: current.sequence,
        sequence: nextSequence(),
      });
      notify();
    },
    async sealJobWithToken(job) {
      return job;
    },
    async getJobResponseByThid(thid: string) {
      for (const job of jobs.values()) {
        if (job.thid === thid && job.responseMessageId) {
          return {
            id: job.responseMessageId,
            thid,
          };
        }
      }
      return null;
    },
    generateId() {
      return createRuntimeUuid();
    },
  };
}

/**
 * Requires one backend profile-runtime method from one runtime client.
 */
export function requireBackendProfileRuntimeMethod<
  T extends keyof BackendProfileRuntimeClient,
>(
  client: BackendProfileRuntimeClient,
  method: T,
): NonNullable<BackendProfileRuntimeClient[T]> {
  const candidate = client[method];
  if (typeof candidate !== 'function') {
    throw new Error(`BackendProfileRuntimeClient does not implement '${String(method)}'.`);
  }
  return candidate.bind(client) as NonNullable<BackendProfileRuntimeClient[T]>;
}

/**
 * Canonical backend helper for loading one actor profile after authentication.
 */
export async function loadBackendProfile(
  client: BackendProfileRuntimeClient,
  input: ProfileLoadRequest,
): Promise<BackendLoadedActorProfile> {
  return requireBackendProfileRuntimeMethod(client, 'loadProfile')(input);
}

/**
 * Canonical backend helper for closing one loaded actor profile and clearing
 * runtime-owned in-memory state.
 */
export async function closeBackendProfile(
  client: BackendProfileRuntimeClient,
  profileKey: string,
): Promise<void> {
  return requireBackendProfileRuntimeMethod(client, 'closeProfile')(profileKey);
}

/**
 * Canonical backend helper for registering one trusted device/runtime context.
 */
export async function registerBackendTrustedDevice(
  client: BackendProfileRuntimeClient,
  input: TrustedDeviceRegistrationRequest,
): Promise<BackendTrustedDeviceRegistrationResult> {
  return requireBackendProfileRuntimeMethod(client, 'registerTrustedDevice')(input);
}

/**
 * Canonical backend helper for connecting one actor profile to one subject
 * index after the profile is already loaded.
 */
export async function connectBackendToSubjectIndex(
  client: BackendProfileRuntimeClient,
  input: SubjectIndexConnectionRequest,
): Promise<BackendSubjectIndexConnectionResult> {
  return requireBackendProfileRuntimeMethod(client, 'connectToSubjectIndex')(input);
}

/**
 * Canonical backend helper for reading one subject index composition after the
 * relationship is already established.
 */
export async function getBackendSubjectIndexComposition(
  client: BackendProfileRuntimeClient,
  input: SubjectIndexCompositionRequest,
): Promise<BackendSubjectIndexCompositionResult> {
  return requireBackendProfileRuntimeMethod(client, 'getSubjectIndexComposition')(input);
}

/**
 * Returns one materialized backend actor session by actor kind.
 *
 * Backend callers should use this instead of scanning `actorSessions` manually.
 */
export function requireBackendActorSession(
  profile: BackendLoadedActorProfile,
  actorKind: ActorKind,
): ActorSession {
  const session = profile.actorSessions.find(candidate => candidate.actorKind === actorKind);
  if (!session) {
    throw new Error(`Loaded backend profile does not expose actor kind '${actorKind}'.`);
  }
  return session;
}

/**
 * Returns the individual-controller session from one loaded backend profile.
 *
 * This helper is the first concrete bridge from the generic backend runtime to
 * the current individual bootstrap/index use case.
 */
export function requireBackendIndividualControllerSession(
  profile: BackendLoadedActorProfile,
): ActorSession {
  return requireBackendActorSession(profile, ActorKinds.IndividualController);
}

/**
 * Materializes the individual-controller facade directly from one loaded
 * backend profile.
 */
export function requireBackendIndividualControllerSdk(
  profile: BackendLoadedActorProfile,
): IndividualControllerSdk {
  return requireBackendIndividualControllerSession(profile).asIndividualController();
}

/**
 * Returns the organization-controller session from one loaded backend profile.
 */
export function requireBackendOrganizationControllerSession(
  profile: BackendLoadedActorProfile,
): ActorSession {
  return requireBackendActorSession(profile, ActorKinds.OrganizationController);
}

/**
 * Materializes the organization-controller facade directly from one loaded
 * backend profile.
 */
export function requireBackendOrganizationControllerSdk(
  profile: BackendLoadedActorProfile,
): OrganizationControllerSdk {
  return requireBackendOrganizationControllerSession(profile).asOrganizationController();
}

/**
 * Returns the professional session from one loaded backend profile.
 */
export function requireBackendProfessionalSession(
  profile: BackendLoadedActorProfile,
): ActorSession {
  return requireBackendActorSession(profile, ActorKinds.Professional);
}

/**
 * Materializes the professional facade directly from one loaded backend
 * profile.
 */
export function requireBackendProfessionalSdk(
  profile: BackendLoadedActorProfile,
): ProfessionalSdk {
  return requireBackendProfessionalSession(profile).asProfessional();
}

/**
 * Loads one backend profile and resolves the individual-controller session in
 * one step.
 *
 * This is the first pragmatic use-case helper on top of the generic backend
 * profile runtime, because the current stable CORE bootstrap baseline starts
 * from the individual-controller flow.
 */
export async function loadBackendIndividualControllerProfile(
  client: BackendProfileRuntimeClient,
  input: ProfileLoadRequest,
): Promise<BackendIndividualControllerProfile> {
  const profile = await loadBackendProfile(client, input);
  const session = requireBackendIndividualControllerSession(profile);
  return {
    profile,
    session,
    sdk: session.asIndividualController(),
  };
}

/**
 * Loads one backend profile and resolves the organization-controller session in
 * one step.
 */
export async function loadBackendOrganizationControllerProfile(
  client: BackendProfileRuntimeClient,
  input: ProfileLoadRequest,
): Promise<BackendOrganizationControllerProfile> {
  const profile = await loadBackendProfile(client, input);
  const session = requireBackendOrganizationControllerSession(profile);
  return {
    profile,
    session,
    sdk: session.asOrganizationController(),
  };
}

/**
 * Loads one backend profile and resolves the professional session in one step.
 */
export async function loadBackendProfessionalProfile(
  client: BackendProfileRuntimeClient,
  input: ProfileLoadRequest,
): Promise<BackendProfessionalProfile> {
  const profile = await loadBackendProfile(client, input);
  const session = requireBackendProfessionalSession(profile);
  return {
    profile,
    session,
    sdk: session.asProfessional(),
  };
}

function createRuntimeUuid(): string {
  const fromCrypto = globalThis.crypto?.randomUUID?.();
  if (fromCrypto) {
    return fromCrypto;
  }
  return `fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

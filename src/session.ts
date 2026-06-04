// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import { ActorKinds } from 'gdc-common-utils-ts/constants/actor-session';
import type { ActorKind, Capability } from 'gdc-common-utils-ts/models/actor-session';
import { HostOnboardingSdk } from './orchestration/host-onboarding-sdk.js';
import { IndividualControllerSdk } from './orchestration/individual-controller-sdk.js';
import { IndividualMemberSdk } from './orchestration/individual-member-sdk.js';
import { OrganizationControllerSdk } from './orchestration/organization-controller-sdk.js';
import { OrganizationEmployeeSdk } from './orchestration/organization-employee-sdk.js';
import { ProfessionalSdk } from './orchestration/professional-sdk.js';
import type { RuntimeClient } from './orchestration/client-port.js';

export type NodeCapability = Capability;

export type NodeActorSessionContext = {
  actorKind: ActorKind;
  actorDid?: string;
  subjectDid?: string;
  capabilities?: NodeCapability[];
};

/**
 * Preferred neutral actor-session context contract.
 *
 * Keep `NodeActorSessionContext` only as a compatibility alias while names are
 * converged across runtimes.
 */
export type ActorSessionContext = NodeActorSessionContext;

/**
 * Preferred neutral actor session abstraction for runtime packages.
 *
 * Keep `NodeActorSession` only as a compatibility alias while package naming is
 * converged across node/front/other runtimes.
 */
export class ActorSession {
  public readonly actorKind: ActorKind;
  public readonly actorDid?: string;
  public readonly subjectDid?: string;
  public readonly capabilities: NodeCapability[];
  private readonly client?: RuntimeClient;

  constructor(context: ActorSessionContext, client?: RuntimeClient) {
    this.actorKind = context.actorKind;
    this.actorDid = context.actorDid;
    this.subjectDid = context.subjectDid;
    this.capabilities = [...new Set(context.capabilities || [])];
    this.client = client;
  }

  public is(actorKind: ActorKind): boolean {
    return this.actorKind === actorKind;
  }

  public assertActorKind(actorKind: ActorKind): void {
    if (!this.is(actorKind)) {
      throw new Error(`ActorSession is '${this.actorKind}' and cannot be used as '${actorKind}'.`);
    }
  }

  public asHostOnboarding(): HostOnboardingSdk {
    this.assertActorKind(ActorKinds.HostOnboarding);
    return new HostOnboardingSdk(this.requireClient());
  }

  public asOrganizationController(): OrganizationControllerSdk {
    this.assertActorKind(ActorKinds.OrganizationController);
    return new OrganizationControllerSdk(this.requireClient(), this.capabilities);
  }

  public asOrganizationEmployee(): OrganizationEmployeeSdk {
    this.assertActorKind(ActorKinds.OrganizationEmployee);
    return new OrganizationEmployeeSdk(this.requireClient(), this.capabilities);
  }

  public asIndividualController(): IndividualControllerSdk {
    this.assertActorKind(ActorKinds.IndividualController);
    return new IndividualControllerSdk(this.requireClient(), this.capabilities);
  }

  public asIndividualMember(): IndividualMemberSdk {
    this.assertActorKind(ActorKinds.IndividualMember);
    return new IndividualMemberSdk(this.requireClient());
  }

  public asProfessional(): ProfessionalSdk {
    this.assertActorKind(ActorKinds.Professional);
    return new ProfessionalSdk(this.requireClient());
  }

  private requireClient(): RuntimeClient {
    if (!this.client) {
      throw new Error('ActorSession requires a runtime client to materialize actor facades.');
    }
    return this.client;
  }
}

/**
 * @deprecated Prefer `ActorSessionContext`.
 */
export class NodeActorSession {
  private readonly inner: ActorSession;

  constructor(context: NodeActorSessionContext, client?: RuntimeClient) {
    this.inner = new ActorSession(context, client);
  }

  public get actorKind(): ActorKind { return this.inner.actorKind; }
  public get actorDid(): string | undefined { return this.inner.actorDid; }
  public get subjectDid(): string | undefined { return this.inner.subjectDid; }
  public get capabilities(): NodeCapability[] { return this.inner.capabilities; }
  public is(actorKind: ActorKind): boolean { return this.inner.is(actorKind); }
  public assertActorKind(actorKind: ActorKind): void { this.inner.assertActorKind(actorKind); }
  public asHostOnboarding(): HostOnboardingSdk { return this.inner.asHostOnboarding(); }
  public asOrganizationController(): OrganizationControllerSdk { return this.inner.asOrganizationController(); }
  public asOrganizationEmployee(): OrganizationEmployeeSdk { return this.inner.asOrganizationEmployee(); }
  public asIndividualController(): IndividualControllerSdk { return this.inner.asIndividualController(); }
  public asIndividualMember(): IndividualMemberSdk { return this.inner.asIndividualMember(); }
  public asProfessional(): ProfessionalSdk { return this.inner.asProfessional(); }
}

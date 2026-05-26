// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import {
  expandActorSessionDescriptorToFacades,
  filterCapabilitiesForActor,
  type ActorKind,
  type ActorFacadeDescriptor,
  type ActorSessionDescriptor,
  type Capability,
} from 'gdc-sdk-core-ts';
import { ActorSession, NodeActorSession, type NodeCapability } from './session.js';
import type { RuntimeClient } from './orchestration/client-port.js';

const capabilityMap: Record<Capability, NodeCapability> = {
  'organization.create_employee': 'organization.create_employee',
  'organization.issue_activation_code': 'organization.issue_activation_code',
  'organization.request_smart_token': 'organization.request_smart_token',
  'individual.bootstrap': 'individual.bootstrap',
  'individual.import_ips': 'individual.import_ips',
  'individual.generate_digital_twin': 'individual.generate_digital_twin',
  'consent.grant_professional_access': 'consent.grant_professional_access',
  'professional.medication': 'professional.medication',
  'professional.appointment': 'professional.appointment',
  'professional.request_smart_token': 'professional.request_smart_token',
};

function mapCapabilities(capabilities: Capability[]): NodeCapability[] {
  return [...new Set(capabilities.map(capability => capabilityMap[capability]))];
}

export function createNodeActorSessionsFromFacades(
  facades: ActorFacadeDescriptor[],
  client?: RuntimeClient,
): NodeActorSession[] {
  return facades.map(facade => new NodeActorSession({
    actorKind: facade.actorKind,
    actorDid: facade.profileDid,
    capabilities: mapCapabilities(filterCapabilitiesForActor(facade.actorKind, facade.capabilities)),
  }, client));
}

export function createNodeActorSessionFromFacade(
  facade: ActorFacadeDescriptor,
  client?: RuntimeClient,
): NodeActorSession {
  return new NodeActorSession({
    actorKind: facade.actorKind,
    actorDid: facade.profileDid,
    capabilities: mapCapabilities(filterCapabilitiesForActor(facade.actorKind, facade.capabilities)),
  }, client);
}

export function createNodeActorSessionsFromDescriptor(
  descriptor: ActorSessionDescriptor,
  client?: RuntimeClient,
): NodeActorSession[] {
  return createNodeActorSessionsFromFacades(expandActorSessionDescriptorToFacades(descriptor), client);
}

export function createNodeActorSessionFromDescriptor(
  descriptor: ActorSessionDescriptor,
  actorKind: ActorKind,
  client?: RuntimeClient,
): NodeActorSession {
  if (!descriptor.actorKinds.includes(actorKind)) {
    throw new Error(`Descriptor does not expose actor kind '${actorKind}'.`);
  }

  const facade = expandActorSessionDescriptorToFacades(descriptor)
    .find(candidate => candidate.actorKind === actorKind);
  if (!facade) {
    throw new Error(`Descriptor does not expose actor kind '${actorKind}'.`);
  }

  return createNodeActorSessionFromFacade(facade, client);
}

export function createActorSessionsFromFacades(
  facades: ActorFacadeDescriptor[],
  client?: RuntimeClient,
): ActorSession[] {
  return facades.map(facade => new ActorSession({
    actorKind: facade.actorKind,
    actorDid: facade.profileDid,
    capabilities: mapCapabilities(filterCapabilitiesForActor(facade.actorKind, facade.capabilities)),
  }, client));
}

export function createActorSessionFromFacade(
  facade: ActorFacadeDescriptor,
  client?: RuntimeClient,
): ActorSession {
  return new ActorSession({
    actorKind: facade.actorKind,
    actorDid: facade.profileDid,
    capabilities: mapCapabilities(filterCapabilitiesForActor(facade.actorKind, facade.capabilities)),
  }, client);
}

export function createActorSessionsFromDescriptor(
  descriptor: ActorSessionDescriptor,
  client?: RuntimeClient,
): ActorSession[] {
  return createActorSessionsFromFacades(expandActorSessionDescriptorToFacades(descriptor), client);
}

export function createActorSessionFromDescriptor(
  descriptor: ActorSessionDescriptor,
  actorKind: ActorKind,
  client?: RuntimeClient,
): ActorSession {
  if (!descriptor.actorKinds.includes(actorKind)) {
    throw new Error(`Descriptor does not expose actor kind '${actorKind}'.`);
  }
  const facade = expandActorSessionDescriptorToFacades(descriptor)
    .find(candidate => candidate.actorKind === actorKind);
  if (!facade) {
    throw new Error(`Descriptor does not expose actor kind '${actorKind}'.`);
  }
  return createActorSessionFromFacade(facade, client);
}

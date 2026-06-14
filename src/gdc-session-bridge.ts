// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import { ActorCapabilities } from 'gdc-common-utils-ts/constants/actor-session';
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
  [ActorCapabilities.HostingActivateOrganization]: ActorCapabilities.HostingActivateOrganization,
  [ActorCapabilities.HostingConfirmOrder]: ActorCapabilities.HostingConfirmOrder,
  [ActorCapabilities.HostingDisableHost]: ActorCapabilities.HostingDisableHost,
  [ActorCapabilities.HostingPurgeHost]: ActorCapabilities.HostingPurgeHost,
  [ActorCapabilities.OrganizationCreateEmployee]: ActorCapabilities.OrganizationCreateEmployee,
  [ActorCapabilities.OrganizationActivateDevice]: ActorCapabilities.OrganizationActivateDevice,
  [ActorCapabilities.OrganizationIssueActivationCode]: ActorCapabilities.OrganizationIssueActivationCode,
  [ActorCapabilities.OrganizationRequestSmartToken]: ActorCapabilities.OrganizationRequestSmartToken,
  [ActorCapabilities.OrganizationDisableEmployee]: ActorCapabilities.OrganizationDisableEmployee,
  [ActorCapabilities.OrganizationPurgeEmployee]: ActorCapabilities.OrganizationPurgeEmployee,
  [ActorCapabilities.OrganizationDisableTenant]: ActorCapabilities.OrganizationDisableTenant,
  [ActorCapabilities.OrganizationPurgeTenant]: ActorCapabilities.OrganizationPurgeTenant,
  [ActorCapabilities.IndividualBootstrap]: ActorCapabilities.IndividualBootstrap,
  [ActorCapabilities.IndividualDisable]: ActorCapabilities.IndividualDisable,
  [ActorCapabilities.IndividualPurge]: ActorCapabilities.IndividualPurge,
  [ActorCapabilities.IndividualImportIps]: ActorCapabilities.IndividualImportIps,
  [ActorCapabilities.IndividualGenerateDigitalTwin]: ActorCapabilities.IndividualGenerateDigitalTwin,
  [ActorCapabilities.IndividualIngestCommunication]: ActorCapabilities.IndividualIngestCommunication,
  [ActorCapabilities.IndividualUpsertRelatedPerson]: ActorCapabilities.IndividualUpsertRelatedPerson,
  [ActorCapabilities.IndividualMemberDisable]: ActorCapabilities.IndividualMemberDisable,
  [ActorCapabilities.IndividualMemberPurge]: ActorCapabilities.IndividualMemberPurge,
  [ActorCapabilities.ConsentGrantProfessionalAccess]: ActorCapabilities.ConsentGrantProfessionalAccess,
  [ActorCapabilities.ProfessionalMedication]: ActorCapabilities.ProfessionalMedication,
  [ActorCapabilities.ProfessionalAppointment]: ActorCapabilities.ProfessionalAppointment,
  [ActorCapabilities.ProfessionalRequestSmartToken]: ActorCapabilities.ProfessionalRequestSmartToken,
  [ActorCapabilities.TokenRequestSmart]: ActorCapabilities.TokenRequestSmart,
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

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ActorCapabilities,
  ActorKinds,
  createNodeActorSessionFromFacade,
  createNodeActorSessionFromDescriptor,
  createNodeActorSessionsFromDescriptor,
  NodeActorSession,
} from '../dist/index.js';

test('createNodeActorSessionsFromDescriptor expands a Family descriptor into scoped node sessions', () => {
  const sessions = createNodeActorSessionsFromDescriptor({
    actorKinds: [ActorKinds.IndividualController, ActorKinds.IndividualMember],
    capabilities: [
      ActorCapabilities.IndividualBootstrap,
      ActorCapabilities.IndividualIngestCommunication,
      ActorCapabilities.IndividualUpsertRelatedPerson,
      ActorCapabilities.IndividualImportIps,
      ActorCapabilities.IndividualGenerateDigitalTwin,
      ActorCapabilities.ConsentGrantProfessionalAccess,
    ],
    appType: 'Family',
    profileId: 'profile-family-1',
    profileDid: 'did:web:family:controller',
    role: 'controller',
  });

  assert.deepEqual(
    sessions.map(session => [session.actorKind, session.capabilities]),
    [
      [ActorKinds.IndividualController, [
        ActorCapabilities.IndividualBootstrap,
        ActorCapabilities.IndividualIngestCommunication,
        ActorCapabilities.IndividualUpsertRelatedPerson,
        ActorCapabilities.IndividualImportIps,
        ActorCapabilities.IndividualGenerateDigitalTwin,
        ActorCapabilities.ConsentGrantProfessionalAccess,
      ]],
      [ActorKinds.IndividualMember, [
        ActorCapabilities.IndividualUpsertRelatedPerson,
        ActorCapabilities.IndividualImportIps,
        ActorCapabilities.IndividualGenerateDigitalTwin,
      ]],
    ],
  );
});

test('createNodeActorSessionFromFacade preserves actor kind and identity', () => {
  const session = createNodeActorSessionFromFacade({
    actorKind: ActorKinds.OrganizationController,
    capabilities: [ActorCapabilities.OrganizationCreateEmployee, ActorCapabilities.OrganizationRequestSmartToken],
    appType: 'Organization',
    profileId: 'profile-org-1',
    profileDid: 'did:web:org:controller',
  });

  assert.ok(session instanceof NodeActorSession);
  assert.equal(session.actorKind, ActorKinds.OrganizationController);
  assert.equal(session.actorDid, 'did:web:org:controller');
  assert.deepEqual(session.capabilities, [
    ActorCapabilities.OrganizationCreateEmployee,
    ActorCapabilities.OrganizationRequestSmartToken,
  ]);
});

test('createNodeActorSessionFromDescriptor selects one actor facade explicitly', () => {
  const session = createNodeActorSessionFromDescriptor({
    actorKinds: [ActorKinds.OrganizationController],
    capabilities: [
      ActorCapabilities.OrganizationCreateEmployee,
      ActorCapabilities.OrganizationIssueActivationCode,
      ActorCapabilities.OrganizationRequestSmartToken,
    ],
    appType: 'Organization',
    profileId: 'profile-org-1',
    profileDid: 'did:web:org:controller',
  }, ActorKinds.OrganizationController);

  assert.equal(session.actorKind, ActorKinds.OrganizationController);
  assert.deepEqual(session.capabilities, [
    ActorCapabilities.OrganizationCreateEmployee,
    ActorCapabilities.OrganizationRequestSmartToken,
  ]);
});

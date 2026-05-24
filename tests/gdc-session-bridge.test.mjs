import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createNodeActorSessionFromFacade,
  createNodeActorSessionFromDescriptor,
  createNodeActorSessionsFromDescriptor,
  NodeActorSession,
} from '../dist/index.js';

test('createNodeActorSessionsFromDescriptor expands a Family descriptor into scoped node sessions', () => {
  const sessions = createNodeActorSessionsFromDescriptor({
    actorKinds: ['individual_controller', 'individual_member'],
    capabilities: [
      'individual.bootstrap',
      'individual.import_ips',
      'individual.generate_digital_twin',
      'consent.grant_professional_access',
    ],
    appType: 'Family',
    profileId: 'profile-family-1',
    profileDid: 'did:web:family:controller',
    role: 'controller',
  });

  assert.deepEqual(
    sessions.map(session => [session.actorKind, session.capabilities]),
    [
      ['individual_controller', ['individual.bootstrap', 'consent.grant_professional_access']],
      ['individual_member', ['individual.import_ips', 'individual.generate_digital_twin']],
    ],
  );
});

test('createNodeActorSessionFromFacade preserves actor kind and identity', () => {
  const session = createNodeActorSessionFromFacade({
    actorKind: 'organization_controller',
    capabilities: ['organization.create_employee', 'organization.request_smart_token'],
    appType: 'Organization',
    profileId: 'profile-org-1',
    profileDid: 'did:web:org:controller',
  });

  assert.ok(session instanceof NodeActorSession);
  assert.equal(session.actorKind, 'organization_controller');
  assert.equal(session.actorDid, 'did:web:org:controller');
  assert.deepEqual(session.capabilities, [
    'organization.create_employee',
    'organization.request_smart_token',
  ]);
});

test('createNodeActorSessionFromDescriptor selects one actor facade explicitly', () => {
  const session = createNodeActorSessionFromDescriptor({
    actorKinds: ['organization_controller'],
    capabilities: [
      'organization.create_employee',
      'organization.issue_activation_code',
      'organization.request_smart_token',
    ],
    appType: 'Organization',
    profileId: 'profile-org-1',
    profileDid: 'did:web:org:controller',
  }, 'organization_controller');

  assert.equal(session.actorKind, 'organization_controller');
  assert.deepEqual(session.capabilities, [
    'organization.create_employee',
    'organization.request_smart_token',
  ]);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ActorKinds,
  ServerProfileSessionManager,
  openServerProfileSecret,
  protectServerProfileSecret,
} from '../dist/index.js';

/**
 * Flow contract exercised by this suite:
 * 1. Registration publishes only deterministic public keys and stores the
 *    private wallet seed behind a random DEK, the host KEK and the user's PIN.
 * 2. Unlock proves that PIN locally before invoking the host/KMS boundary,
 *    then signs SMART `client_assertion` with the DCR-registered wallet key.
 * 3. A short session contains a host-sealed copy of the already-unlocked seed;
 *    the persisted profile never becomes KMS-only decryptable.
 * 4. Actor mode and allowed subjects come from the stored profile, never from
 *    a clinical request made by a portal or telephone channel.
 */
function memoryDeps() {
  const profiles = new Map();
  const sessions = new Map();
  const unsealCalls = [];
  return {
    profiles,
    sessions,
    unsealCalls,
    store: {
      async listProfiles(ownerId) { return [...profiles.values()].filter((value) => value.ownerId === ownerId); },
      async getProfile(id) { return profiles.get(id); },
      async putProfile(value) { profiles.set(value.profileId, value); },
      async getSession(id) { return sessions.get(id); },
      async putSession(value) { sessions.set(value.sessionId, value); },
      async deleteSession(id) { sessions.delete(id); },
    },
    sealer: {
      async seal(value, aad) { return `${aad}:${Buffer.from(value).toString('base64url')}`; },
      async unseal(value, aad) {
        unsealCalls.push(aad);
        assert.ok(value.startsWith(`${aad}:`));
        return Buffer.from(value.slice(aad.length + 1), 'base64url').toString();
      },
    },
  };
}

test('production profile flow enrolls DCR, unlocks with registered-key assertion and returns SMART session', async () => {
  const deps = memoryDeps();
  const calls = [];
  const responses = [
    Response.json({}, { status: 202 }),
    Response.json({ access_token: 'initial-access-token' }),
    Response.json({}, { status: 202 }),
    Response.json({ client_id: 'device-client-1', device_did: 'did:key:device-1' }),
    Response.json({}, { status: 202 }),
    Response.json({ access_token: 'smart-access-token', token_type: 'Bearer', scope: 'patient/Composition.rs' }),
  ];
  const manager = new ServerProfileSessionManager({
    ...deps,
    gatewayBaseUrl: 'https://gw.example',
    recipientDid: 'did:key:gw',
    resolveRecipientJwk: async () => ({ kty: 'EC', crv: 'P-384', x: 'x', y: 'y', use: 'enc' }),
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return responses.shift();
    },
    profileProtection: { cost: 1_024 },
  });
  const base = {
    ownerId: 'firebase-uid-1',
    profileId: 'profile-1',
    actorKind: ActorKinds.IndividualController,
    actorMode: 'self',
    actorDid: 'did:web:actor.example',
    profileDid: 'did:web:profile.example',
    providerDid: 'did:web:provider.example',
    routeContext: { tenantId: 'VATES-TEST', jurisdiction: 'ES', sector: 'health-care' },
    allowedSubjectDids: ['did:web:subject.example'],
    pin: '123456',
    idToken: 'firebase-id-token',
    activationCode: 'activation-code',
    vpToken: 'signed-vp-token',
  };
  const enrolled = await manager.enroll(base);
  assert.equal(enrolled.clientId, 'device-client-1');
  assert.equal(enrolled.deviceDid, 'did:key:device-1');
  assert.ok(enrolled.publicJwks.length >= 3);

  const unlocked = await manager.unlock({
    ownerId: base.ownerId,
    profileId: base.profileId,
    subjectDid: base.allowedSubjectDids[0],
    scopes: ['patient/Composition.rs'],
    pin: base.pin,
    idToken: base.idToken,
  });
  assert.equal(unlocked.accessToken, 'smart-access-token');
  assert.equal(unlocked.profile.actorMode, 'self');
  const smartRequest = JSON.parse(String(calls[4].init.body));
  assert.match(smartRequest.body.client_assertion, /^[^.]+\.[^.]+\.[^.]+$/);
  const claims = JSON.parse(Buffer.from(smartRequest.body.client_assertion.split('.')[1], 'base64url').toString());
  assert.equal(claims.iss, 'device-client-1');
  assert.equal(smartRequest.body.vp_token, 'signed-vp-token');
  assert.ok(deps.sessions.get(unlocked.sessionId).sealedUnlockedWalletSeed);
});

test('profile unlock rejects subjects outside the stored profile and rejects a bad PIN before host KMS', async () => {
  const deps = memoryDeps();
  const now = new Date('2026-07-16T12:00:00.000Z');
  const protectedWalletSeed = await protectServerProfileSecret('seed', '654321', 'profile-1:wallet-seed', deps.sealer, { cost: 1_024 });
  const protectedVpToken = await protectServerProfileSecret('vp', '654321', 'profile-1:vp-token', deps.sealer, { cost: 1_024 });
  deps.profiles.set('profile-1', {
    profileId: 'profile-1', ownerId: 'owner-1', actorKind: ActorKinds.IndividualController,
    actorMode: 'controller', actorDid: 'did:web:actor', profileDid: 'did:web:profile', providerDid: 'did:web:provider',
    routeContext: { tenantId: 'tenant', jurisdiction: 'ES', sector: 'health-care' }, allowedSubjectDids: ['did:web:allowed'],
    clientId: 'client', deviceDid: 'did:key:device', publicJwks: [],
    protectedWalletSeed, protectedVpToken, failedUnlocks: 0,
    createdAt: now.toISOString(), updatedAt: now.toISOString(),
  });
  const manager = new ServerProfileSessionManager({
    ...deps, gatewayBaseUrl: 'https://gw.example', recipientDid: 'did:key:gw',
    resolveRecipientJwk: async () => ({}), maxFailedUnlocks: 1, now: () => now,
  });
  await assert.rejects(manager.unlock({ ownerId: 'owner-1', profileId: 'profile-1', subjectDid: 'did:web:not-allowed', scopes: [], pin: '123456', idToken: 'id' }), /not linked/);
  const hostCallsBeforeBadPin = deps.unsealCalls.length;
  await assert.rejects(manager.unlock({ ownerId: 'owner-1', profileId: 'profile-1', subjectDid: 'did:web:allowed', scopes: [], pin: '123456', idToken: 'id' }), /PIN rejected/);
  assert.equal(deps.unsealCalls.length, hostCallsBeforeBadPin, 'wrong PIN must fail before invoking host KMS');
  assert.ok(deps.profiles.get('profile-1').lockedUntil);
});

test('profile envelope requires the same PIN, host KEK and AAD', async () => {
  const deps = memoryDeps();
  const envelope = await protectServerProfileSecret('private material', '123456', 'profile:a', deps.sealer, { cost: 1_024 });

  await assert.rejects(openServerProfileSecret(envelope, '000000', 'profile:a', deps.sealer), /PIN rejected/);
  await assert.rejects(openServerProfileSecret(envelope, '123456', 'profile:b', deps.sealer));
  assert.equal(await openServerProfileSecret(envelope, '123456', 'profile:a', deps.sealer), 'private material');
});

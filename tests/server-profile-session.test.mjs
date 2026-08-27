// Flow contract: server wallets remain open behind opaque sessions; fresh OTP recovery rotates keys, revokes prior sessions, and never needs the old PIN.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ActorKinds,
  NodeManagedWallet,
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
 * 5. Every encrypted action, including a poll containing only `thid`, is
 *    signed with the actor DID stored in the profile as its `iss` claim.
 * 6. The same protected seed deterministically restores a distinct ML-KEM
 *    document-at-rest key, while each document receives a fresh AES CEK.
 * 7. Enrollment uses two independent proofs: a trusted signed OIDC id_token
 *    binds the account/email, while the stored VP proves actor/role authority.
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
      async deleteSessionsForProfile(profileId) {
        for (const [id, session] of sessions) {
          if (session.profileId === profileId) sessions.delete(id);
        }
      },
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
  const recipientDids = [];
  const recipientWallet = new NodeManagedWallet();
  const recipientContext = { runtime: { runtimeId: 'gw-recipient', runtimeType: 'backend-service' } };
  await recipientWallet.provisionManagedKeys(recipientContext, {
    ownerScope: 'runtime', purposes: ['comm-encryption'], mode: 'deterministic', seedMaterial: 'gw-recipient-seed',
  });
  const [recipientKey] = await recipientWallet.getPublicJwks(recipientContext, {
    ownerScope: 'runtime', purpose: 'comm-encryption',
  });
  const recipientPublicJwk = recipientKey.publicJwk;
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
    resolveRecipientJwk: async (did) => {
      recipientDids.push(did);
      return recipientPublicJwk;
    },
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return responses.shift();
    },
    requiredConfidentialStorageProfile: 'confidential-pqc-v1',
    appInfo: {
      appId: 'https://portal.example',
      appType: 'Family',
      sector: 'health-care',
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
    idToken: 'signed-email-proof-id-token',
    activationCode: 'activation-code',
    redirectUris: ['https://portal.example/__/auth/handler'],
    clientName: 'Example Professional Portal',
  };
  const enrolled = await manager.enroll(base);
  assert.equal(enrolled.clientId, 'device-client-1');
  assert.equal(enrolled.deviceDid, 'did:key:device-1');
  assert.ok(enrolled.publicJwks.length >= 5);
  assert.equal(enrolled.publicJwks.some((key) => key.kid === enrolled.storagePublicJwk.kid), false);
  assert.equal(enrolled.storagePublicJwk.crv, 'ML-KEM-768');
  assert.equal(enrolled.confidentialStorageProfile, 'confidential-pqc-v1');
  // Token/_exchange receives only the trusted OIDC email proof as Bearer. The
  // independent role VP is protected in the profile and used later for SMART.
  assert.equal(
    new Headers(calls[0].init.headers).get('authorization'),
    `Bearer ${base.idToken}`,
  );
  assert.equal(new Headers(calls[0].init.headers).get('AppId'), 'example.portal');
  assert.equal(new Headers(calls[0].init.headers).get('AppVersion'), 'v1.0');
  const dcrRequest = JSON.parse(String(calls[2].init.body));
  assert.deepEqual(dcrRequest.redirect_uris, ['https://portal.example/__/auth/handler']);
  assert.equal(dcrRequest.client_name, 'Example Professional Portal');

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
  assert.equal('vp_token' in smartRequest.body, false);
  assert.equal(smartRequest.body.acr_values, 'urn:antifraud:acr:openid4vp:individual');
  assert.ok(deps.sessions.get(unlocked.sessionId).sealedUnlockedWalletSeed);
  const packedPoll = await unlocked.secureTransportAdapter.pack({ thid: 'message-1' });
  const compactPollJws = Buffer.from(await recipientWallet.decryptCompactJwe(
    packedPoll,
    recipientContext,
    { key: { ownerScope: 'runtime', purpose: 'comm-encryption' } },
  )).toString();
  const pollClaims = JSON.parse(Buffer.from(compactPollJws.split('.')[1], 'base64url').toString());
  assert.deepEqual(pollClaims, {
    thid: 'message-1',
    iss: base.actorDid,
    client_id: unlocked.profile.clientId,
  });
  assert.deepEqual(recipientDids, [base.providerDid]);
  const protectedDocument = await unlocked.confidentialStorageAdapter.protect({ id: 'health-1', content: { note: 'private' } });
  assert.equal(typeof protectedDocument.jwe, 'string');
  const resolvedAgain = await manager.resolveSession(base.ownerId, unlocked.sessionId);
  assert.deepEqual(
    await resolvedAgain.confidentialStorageAdapter.unprotect(protectedDocument),
    { id: 'health-1', content: { note: 'private' } },
  );
  responses.push(
    Response.json({}, { status: 202 }),
    Response.json({ access_token: 'renewed-smart-access-token', token_type: 'Bearer', scope: 'patient/Composition.rs' }),
  );
  const refreshed = await manager.refreshSession(base.ownerId, unlocked.sessionId, 'fresh-firebase-id-token');
  assert.equal(refreshed.sessionId, unlocked.sessionId);
  assert.equal(refreshed.accessToken, 'renewed-smart-access-token');
  assert.equal(deps.sessions.size, 1);
});

test('profile enrollment does not accept a controller VP as a replacement for the signed email id_token', async () => {
  const deps = memoryDeps();
  const manager = new ServerProfileSessionManager({
    store: deps.store,
    sealer: deps.sealer,
    gatewayBaseUrl: 'https://gw.example',
    fetchImpl: async () => {
      throw new Error('GW must not be called without the email-proof id_token.');
    },
  });

  // Supplying a valid-looking VP is deliberately insufficient: this check
  // must fail before any Token/_exchange or DCR network request is attempted.
  await assert.rejects(manager.enroll({
    ownerId: 'owner-1',
    profileId: 'profile-1',
    actorKind: ActorKinds.OrganizationController,
    actorMode: 'controller',
    actorDid: 'did:web:actor.example',
    profileDid: 'did:web:actor.example',
    providerDid: 'did:web:provider.example',
    routeContext: { tenantId: 'VATES-TEST', jurisdiction: 'ES', sector: 'health-care' },
    allowedSubjectDids: ['did:web:provider.example'],
    pin: '123456',
    activationCode: 'activation-code',
    vpToken: 'signed-controller-vp',
    idToken: '',
  }), /requires idToken/);
});

test('organization and professional enrollment requires an independent signed VP', async () => {
  const deps = memoryDeps();
  const manager = new ServerProfileSessionManager({
    store: deps.store,
    sealer: deps.sealer,
    gatewayBaseUrl: 'https://gw.example',
    resolveRecipientJwk: async () => ({}),
    fetchImpl: async () => { throw new Error('GW must not be called without the actor VP.'); },
  });
  await assert.rejects(manager.enroll({
    ownerId: 'owner-1', profileId: 'profile-1',
    actorKind: ActorKinds.OrganizationController, actorMode: 'controller',
    actorDid: 'did:web:actor.example', profileDid: 'did:web:actor.example',
    providerDid: 'did:web:provider.example',
    routeContext: { tenantId: 'VATES-TEST', jurisdiction: 'ES', sector: 'health-care' },
    allowedSubjectDids: ['did:web:provider.example'], pin: '123456',
    activationCode: 'activation-code', idToken: 'signed-email-id-token',
  }), /requires vpToken for this actor kind/);
});

test('employee enrollment builds its signed role VP after DCR instead of copying idToken', async () => {
  const deps = memoryDeps();
  const responses = [
    Response.json({}, { status: 202 }),
    Response.json({ access_token: 'initial-access-token' }),
    Response.json({}, { status: 202 }),
    Response.json({ client_id: 'employee-device-client', device_did: 'did:key:employee-device' }),
  ];
  const manager = new ServerProfileSessionManager({
    ...deps,
    gatewayBaseUrl: 'https://gw.example',
    resolveRecipientJwk: async () => ({}),
    fetchImpl: async () => responses.shift(),
    profileProtection: { cost: 1_024 },
  });
  const profile = await manager.enroll({
    ownerId: 'employee-owner', profileId: 'employee-profile',
    actorKind: ActorKinds.OrganizationEmployee, actorMode: 'member',
    actorDid: 'did:web:clinic.example:employees:zStableActor',
    profileDid: 'did:web:clinic.example:employees:zStableActor',
    providerDid: 'did:web:clinic.example',
    routeContext: { tenantId: 'CA-BC-CLINIC', jurisdiction: 'CA-BC', sector: 'animal-care' },
    allowedSubjectDids: ['did:web:clinic.example:employees:zStableActor'],
    pin: '123456', idToken: 'signed-oidc-email-token', activationCode: 'employee-activation-code',
    professionalProof: { role: 'ISCO-08|2250', sameAs: 'urn:multibase:zStableActor' },
    redirectUris: ['https://professional.vetchain.example/auth/callback'],
    clientName: 'VetChain Professional',
  });
  const vpToken = await openServerProfileSecret(
    profile.protectedVpToken,
    '123456',
    'employee-profile:vp-token',
    deps.sealer,
  );
  assert.notEqual(vpToken, 'signed-oidc-email-token');
  const [encodedHeader, encodedPayload, signature] = vpToken.split('.');
  const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString());
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString());
  assert.equal(header.alg, 'ES384');
  assert.ok(header.kid);
  assert.ok(signature.length > 20);
  assert.equal(payload.sub, 'did:web:clinic.example:employees:zStableActor');
  assert.equal(payload.vp.holder, 'employee-device-client');
  assert.equal(payload.vp.verifiableCredential[0].credentialSubject.hasOccupation, 'ISCO-08|2250');
});

test('fresh OTP recovery rotates employee wallet keys, invalidates old sessions and opens with the new PIN', async () => {
  const deps = memoryDeps();
  const oldProfile = {
    profileId: 'employee-profile', ownerId: 'employee-owner',
    actorKind: ActorKinds.OrganizationEmployee, actorMode: 'member',
    actorDid: 'did:web:clinic.example:employees:zStableActor',
    profileDid: 'did:web:clinic.example:employees:zStableActor',
    providerDid: 'did:web:clinic.example',
    routeContext: { tenantId: 'CA-BC-CLINIC', jurisdiction: 'CA-BC', sector: 'animal-care' },
    allowedSubjectDids: ['did:web:clinic.example:employees:zStableActor'],
    clientId: 'old-client', clientInstanceId: 'browser-installation', deviceDid: 'did:key:old-device',
    publicJwks: [{ kid: 'old-signing-key' }],
    protectedWalletSeed: await protectServerProfileSecret(
      Buffer.alloc(32, 1).toString('base64url'), 'old-pin', 'employee-profile:wallet-seed', deps.sealer, { cost: 1_024 },
    ),
    failedUnlocks: 3,
    createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
  };
  deps.profiles.set(oldProfile.profileId, oldProfile);
  deps.sessions.set('old-session', {
    sessionId: 'old-session', ownerId: oldProfile.ownerId, profileId: oldProfile.profileId,
    subjectDid: oldProfile.actorDid, scopes: ['patient/Composition.rs'],
    sealedUnlockedWalletSeed: 'old', sealedAccessToken: 'old', expiresAt: '2099-01-01T00:00:00.000Z',
  });
  const calls = [];
  const responses = [
    Response.json({}, { status: 202 }),
    Response.json({
      activation_code: 'lic-replacement',
      license_id: 'license-1',
      employee_role: 'ISCO-08|3344',
      employee_same_as: 'urn:multibase:zStableActor',
    }),
    Response.json({}, { status: 202 }),
    Response.json({ access_token: 'replacement-initial-access-token' }),
    Response.json({}, { status: 202 }),
    Response.json({ client_id: 'new-client', device_did: 'did:key:new-device' }),
    Response.json({}, { status: 202 }),
    Response.json({ access_token: 'new-smart-access-token', token_type: 'Bearer', scope: 'patient/Composition.rs' }),
  ];
  const manager = new ServerProfileSessionManager({
    ...deps,
    gatewayBaseUrl: 'https://gw.example',
    resolveRecipientJwk: async () => ({}),
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return responses.shift();
    },
    profileProtection: { cost: 1_024 },
  });

  const rotatedProfile = await manager.rotateEmployeeProfileWithOtp({
    ownerId: oldProfile.ownerId,
    profileId: oldProfile.profileId,
    idToken: 'fresh-marked-email-otp-id-token',
    newPin: '654321',
    redirectUris: ['https://professional.vetchain.example/auth/callback'],
    clientName: 'VetChain Professional',
  });
  const rotatedSession = await manager.unlock({
    ownerId: oldProfile.ownerId,
    profileId: oldProfile.profileId,
    subjectDid: oldProfile.actorDid,
    scopes: ['patient/Composition.rs'],
    pin: '654321',
    idToken: 'fresh-marked-email-otp-id-token',
  });

  assert.match(calls[0].url, /\/identity\/auth\/_recover$/);
  assert.equal(JSON.parse(String(calls[0].init.body)).client_instance_id, 'browser-installation');
  assert.equal(rotatedProfile.clientId, 'new-client');
  assert.equal(rotatedProfile.deviceDid, 'did:key:new-device');
  assert.notDeepEqual(rotatedProfile.publicJwks, oldProfile.publicJwks);
  assert.equal(rotatedSession.accessToken, 'new-smart-access-token');
  assert.equal(deps.sessions.has('old-session'), false);
  assert.equal(deps.profiles.get(oldProfile.profileId).failedUnlocks, 0);
  await assert.rejects(openServerProfileSecret(
    rotatedProfile.protectedWalletSeed, 'old-pin', 'employee-profile:wallet-seed', deps.sealer,
  ), /PIN rejected/);
  await assert.doesNotReject(openServerProfileSecret(
    rotatedProfile.protectedWalletSeed, '654321', 'employee-profile:wallet-seed', deps.sealer,
  ));
});

test('server-only bootstrap seed and stable derivation id reproduce controller public keys', async () => {
  const bootstrapSeed = Buffer.alloc(32, 7).toString('base64url');
  const derivationId = 'organization-controller:stable-actor-1:v1';
  const enroll = async (profileId) => {
    const deps = memoryDeps();
    const responses = [
      Response.json({}, { status: 202 }),
      Response.json({ access_token: 'initial-access-token' }),
      Response.json({}, { status: 202 }),
      Response.json({ client_id: `client-${profileId}` }),
    ];
    const manager = new ServerProfileSessionManager({
      ...deps,
      gatewayBaseUrl: 'https://gw.example',
      resolveRecipientJwk: async () => ({}),
      fetchImpl: async () => responses.shift(),
      profileProtection: { cost: 1_024 },
    });
    return manager.enroll({
      ownerId: `owner-${profileId}`,
      profileId,
      walletSeed: bootstrapSeed,
      walletKeyDerivationId: derivationId,
      actorKind: ActorKinds.OrganizationController,
      actorMode: 'controller',
      actorDid: 'did:web:controller.example',
      profileDid: 'did:web:controller.example',
      providerDid: 'did:web:tenant.example',
      routeContext: { tenantId: 'VATES-TEST', jurisdiction: 'ES', sector: 'health-research' },
      allowedSubjectDids: ['did:web:tenant.example'],
      pin: '123456',
      idToken: 'id-token',
      activationCode: 'activation-code',
      vpToken: 'vp-token',
      redirectUris: ['https://portal.example.org/auth/callback'],
      clientName: 'Example Organization Portal',
    });
  };
  const first = await enroll('firebase-profile-a');
  const second = await enroll('firebase-profile-b');
  assert.equal(first.walletKeyDerivationId, derivationId);
  assert.deepEqual(first.publicJwks, second.publicJwks);
  assert.deepEqual(first.storagePublicJwk, second.storagePublicJwk);
});

test('server profile enrollment rejects malformed recovery seeds', async () => {
  const deps = memoryDeps();
  const manager = new ServerProfileSessionManager({
    ...deps, gatewayBaseUrl: 'https://gw.example', resolveRecipientJwk: async () => ({}),
  });
  await assert.rejects(manager.enroll({
    ownerId: 'owner', profileId: 'profile', walletSeed: 'not-a-32-byte-seed',
    actorKind: ActorKinds.OrganizationController, actorMode: 'controller',
    actorDid: 'did:web:actor', profileDid: 'did:web:profile', providerDid: 'did:web:provider',
    routeContext: { tenantId: 'tenant', jurisdiction: 'ES', sector: 'health-research' },
    allowedSubjectDids: ['did:web:tenant'], pin: '123456', idToken: 'id',
    activationCode: 'code', vpToken: 'vp',
  }), /32-byte base64url/);
});

test('server bootstrap derives public controller binding material without a gateway call', async () => {
  const deps = memoryDeps();
  const manager = new ServerProfileSessionManager({
    ...deps, gatewayBaseUrl: 'https://gw.example', resolveRecipientJwk: async () => ({}),
    fetchImpl: async () => { throw new Error('network must not be used'); },
  });
  const keys = await manager.prepareEnrollmentPublicKeys({
    walletSeed: Buffer.alloc(32, 9).toString('base64url'),
    walletKeyDerivationId: 'organization-controller:cto@example.org:v1',
  });
  const actorKey = keys.find((entry) => entry.purpose === 'actor-signing');
  assert.equal(actorKey.alg, 'ES384');
  assert.match(actorKey.kid, /^urn:ietf:params:oauth:jwk-thumbprint:sha-256:/);
  assert.equal('d' in actorKey.publicJwk, false);
});

test('server bootstrap builds the signed controller VP from ICA credentials without exposing private keys', async () => {
  const deps = memoryDeps();
  const manager = new ServerProfileSessionManager({
    ...deps, gatewayBaseUrl: 'https://gw.example', resolveRecipientJwk: async () => ({}),
    fetchImpl: async () => { throw new Error('network must not be used'); },
  });
  const walletSeed = Buffer.alloc(32, 8).toString('base64url');
  const walletKeyDerivationId = 'organization-controller:legal-representative:v1';
  const responseBody = {
    data: [{
      vc: [
        { type: ['VerifiableCredential', 'OrganizationCredential'], credentialSubject: { id: 'did:web:clinic.example' } },
        { type: ['VerifiableCredential', 'LegalRepresentativeCredential'], credentialSubject: { id: 'did:web:representative.example' } },
        { type: ['VerifiableCredential', 'ServiceControllerCredential'], credentialSubject: { owner: { sameAs: 'sha256:representative' } } },
      ],
    }],
  };

  const vpToken = await manager.buildOrganizationControllerVpFromIcaProof({
    walletSeed,
    walletKeyDerivationId,
    verificationResponseBody: responseBody,
    tenantId: 'CA-BC-CLINIC-1',
    audience: 'did:web:vet-gw.example',
    controllerSameAs: 'sha256:representative',
  });
  const [encodedHeader, encodedPayload, signature] = vpToken.split('.');
  const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString());
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString());
  const keys = await manager.prepareEnrollmentPublicKeys({ walletSeed, walletKeyDerivationId });
  const actorKey = keys.find((entry) => entry.purpose === 'actor-signing');

  assert.equal(header.alg, 'ES384');
  assert.equal(header.kid, actorKey.kid);
  assert.deepEqual(header.jwk, actorKey.publicJwk);
  assert.ok(signature.length > 20);
  assert.equal(payload.iss, actorKey.kid);
  assert.equal(payload.sub, 'CA-BC-CLINIC-1');
  assert.equal(payload.aud, 'did:web:vet-gw.example');
  assert.equal(payload.vp.holder, actorKey.kid);
  assert.equal(payload.vp.verifiableCredential.length, 3);
});

test('server bootstrap submits organization reissue through encrypted DIDComm form transport', async () => {
  const deps = memoryDeps();
  const calls = [];
  const recipientWallet = new NodeManagedWallet();
  const recipientContext = { runtime: { runtimeId: 'organization-recipient', runtimeType: 'backend-service' } };
  await recipientWallet.provisionManagedKeys(recipientContext, {
    ownerScope: 'runtime', purposes: ['comm-encryption'], mode: 'deterministic', seedMaterial: 'organization-recipient-seed',
  });
  const [recipientKey] = await recipientWallet.getPublicJwks(recipientContext, {
    ownerScope: 'runtime', purpose: 'comm-encryption',
  });
  const manager = new ServerProfileSessionManager({
    ...deps,
    gatewayBaseUrl: 'https://gw.example',
    resolveRecipientJwk: async () => recipientKey.publicJwk,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return calls.length === 1
        ? Response.json({}, { status: 202 })
        : Response.json({ error: 'terminal-test-response' }, { status: 400 });
    },
  });

  const result = await manager.submitLegalOrganizationCredentialReissuanceWithBootstrapWallet({
    walletSeed: Buffer.alloc(32, 7).toString('base64url'),
    walletKeyDerivationId: 'organization-controller:cto@example.org:v1',
    bearerToken: 'firebase-id-token',
    providerDid: 'did:web:gw.example:tenant',
    routeContext: { tenantId: 'tenant', jurisdiction: 'ES', sector: 'health-research' },
    hostContext: { jurisdiction: 'ES', hostNetwork: 'test-network' },
    verificationInput: {
      claims: { 'org.schema.Service.category': 'health-research' },
      controller: { publicKeyJwk: { kty: 'EC', kid: 'controller-key' } },
      verification: { resourceType: 'contract' },
      attachments: [{ id: 'contract', media_type: 'application/pdf', data: { base64: 'cGRm' } }],
    },
  });
  assert.equal(result.poll.status, 400);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.match(String(calls[0].init.body), /^request=/);
  assert.equal(calls[1].init.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.match(String(calls[1].init.body), /^request=/);
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
    ...deps, gatewayBaseUrl: 'https://gw.example',
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

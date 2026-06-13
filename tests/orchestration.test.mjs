import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ActorCapabilities,
  ActorKinds,
  IndividualControllerSdk,
  NodeActorSession,
  PersonalSdk,
  ProfessionalSdk,
  submitAndPollWithMethods,
  submitAndPollWithClient,
} from '../dist/index.js';

test('IndividualControllerSdk delegates to the runtime client', async () => {
  const calls = [];
  const client = {
    startIndividualOrganization: async (...args) => { calls.push(['startIndividualOrganization', args]); return { ok: true }; },
    confirmIndividualOrganizationOrder: async (...args) => { calls.push(['confirmIndividualOrganizationOrder', args]); return { ok: true }; },
    disableIndividual: async (...args) => { calls.push(['disableIndividual', args]); return { ok: true }; },
    purgeIndividual: async (...args) => { calls.push(['purgeIndividual', args]); return { ok: true }; },
    disableIndividualMember: async (...args) => { calls.push(['disableIndividualMember', args]); return { ok: true }; },
    purgeIndividualMember: async (...args) => { calls.push(['purgeIndividualMember', args]); return { ok: true }; },
    disableIndividualOrganization: async (...args) => { calls.push(['disableIndividualOrganization', args]); return { ok: true }; },
    purgeIndividualOrganization: async (...args) => { calls.push(['purgeIndividualOrganization', args]); return { ok: true }; },
    grantProfessionalAccess: async (...args) => { calls.push(['grantProfessionalAccess', args]); return { ok: true }; },
    searchClinicalBundle: async (...args) => { calls.push(['searchClinicalBundle', args]); return { ok: true }; },
    getLatestIps: async (...args) => { calls.push(['getLatestIps', args]); return { ok: true }; },
    requestSmartToken: async (...args) => { calls.push(['requestSmartToken', args]); return { ok: true }; },
  };
  const sdk = new IndividualControllerSdk(client);
  await sdk.startIndividualOrganization({});
  await sdk.confirmIndividualOrganizationOrder({});
  await sdk.disableIndividual({}, {});
  await sdk.purgeIndividual({}, {});
  await sdk.disableIndividualMember({}, {});
  await sdk.purgeIndividualMember({}, {});
  await sdk.disableIndividualOrganization({}, {});
  await sdk.purgeIndividualOrganization({}, {});
  await sdk.grantProfessionalAccess({}, {});
  await sdk.searchClinicalBundle({}, { subject: 'did:web:subject.example' });
  await sdk.getLatestIps({}, { subject: 'did:web:subject.example' });
  await sdk.requestSmartToken({});
  assert.equal(calls.length, 12);
});

test('ProfessionalSdk keeps role-scoped surface separation', () => {
  assert.equal(typeof ProfessionalSdk.prototype.bootstrapIndividualOrganization, 'undefined');
  assert.equal(typeof ProfessionalSdk.prototype.generateDigitalTwinFromSubjectData, 'undefined');
  assert.equal(typeof ProfessionalSdk.prototype.activateOrganizationInGatewayFromIcaProof, 'undefined');
  assert.equal(typeof ProfessionalSdk.prototype.createOrganizationEmployee, 'undefined');
  assert.equal(typeof ProfessionalSdk.prototype.activateEmployeeDeviceWithActivationRequest, 'undefined');
  assert.equal(typeof ProfessionalSdk.prototype.disableEmployee, 'undefined');
  assert.equal(typeof ProfessionalSdk.prototype.purgeEmployee, 'undefined');
});

test('PersonalSdk delegates to the runtime client', async () => {
  const calls = [];
  const client = {
    startIndividualOrganization: async (...args) => { calls.push(['startIndividualOrganization', args]); return { ok: true }; },
    grantProfessionalAccess: async (...args) => { calls.push(['grantProfessionalAccess', args]); return { ok: true }; },
    searchClinicalBundle: async (...args) => { calls.push(['searchClinicalBundle', args]); return { ok: true }; },
    getLatestIps: async (...args) => { calls.push(['getLatestIps', args]); return { ok: true }; },
    requestSmartToken: async (...args) => { calls.push(['requestSmartToken', args]); return { ok: true }; },
  };
  const sdk = new PersonalSdk(client);
  await sdk.startIndividualOrganization({});
  await sdk.grantProfessionalAccess({}, {});
  await sdk.searchClinicalBundle({}, { subject: 'did:web:subject.example' });
  await sdk.getLatestIps({}, { subject: 'did:web:subject.example' });
  await sdk.requestSmartToken({});
  assert.equal(calls.length, 5);
});

test('target node facades do not expose bootstrap helper shortcuts', () => {
  assert.equal(typeof IndividualControllerSdk.prototype.bootstrapIndividualOrganization, 'undefined');
  assert.equal(typeof PersonalSdk.prototype.bootstrapIndividualOrganization, 'undefined');
  assert.equal(typeof PersonalSdk.prototype.disableIndividual, 'undefined');
  assert.equal(typeof PersonalSdk.prototype.purgeIndividual, 'undefined');
});

test('NodeActorSession refuses mismatched actor facade materialization', () => {
  const session = new NodeActorSession({
    actorKind: ActorKinds.IndividualMember,
    capabilities: [],
  });

  assert.throws(() => session.asOrganizationController(), new RegExp(`cannot be used as '${ActorKinds.OrganizationController}'`));
});

test('IndividualControllerSdk throws when a delegated runtime method is missing', () => {
  const sdk = new IndividualControllerSdk({});

  assert.throws(() => sdk.requestSmartToken({ idToken: 'token', scopes: [] }), /does not implement 'requestSmartToken'/);
});

test('NodeActorSession materializes role-scoped facades from the runtime client', async () => {
  const calls = [];
  const client = {
    createOrganizationEmployee: async (...args) => { calls.push(['createOrganizationEmployee', args]); return { ok: true }; },
    searchOrganizationEmployees: async (...args) => { calls.push(['searchOrganizationEmployees', args]); return { ok: true }; },
    disableEmployee: async (...args) => { calls.push(['disableEmployee', args]); return { ok: true }; },
    disableOrganizationEmployee: async (...args) => { calls.push(['disableOrganizationEmployee', args]); return { ok: true }; },
  };
  const session = new NodeActorSession({
    actorKind: ActorKinds.OrganizationController,
    capabilities: [ActorCapabilities.OrganizationCreateEmployee, ActorCapabilities.OrganizationDisableEmployee],
  }, client);
  const sdk = session.asOrganizationController();
  await sdk.createOrganizationEmployee({}, {});
  await sdk.searchOrganizationEmployees({}, {});
  await sdk.disableEmployee({}, {});
  await sdk.disableOrganizationEmployee({}, {});
  assert.equal(calls.length, 4);
});

test('OrganizationControllerSdk enforces employee lifecycle capabilities when materialized from NodeActorSession', async () => {
  const client = {
    disableEmployee: async () => ({ ok: true }),
  };
  const session = new NodeActorSession({
    actorKind: ActorKinds.OrganizationController,
    capabilities: [ActorCapabilities.OrganizationCreateEmployee],
  }, client);

  assert.throws(
    () => session.asOrganizationController().disableEmployee({}, {}),
    new RegExp(`requires capability '${ActorCapabilities.OrganizationDisableEmployee.replace('.', '\\.')}'`),
  );
});

test('IndividualControllerSdk enforces individual and member lifecycle capabilities when materialized from NodeActorSession', async () => {
  const client = {
    disableIndividual: async () => ({ ok: true }),
    purgeIndividualMember: async () => ({ ok: true }),
  };
  const session = new NodeActorSession({
    actorKind: ActorKinds.IndividualController,
    capabilities: [ActorCapabilities.IndividualDisable],
  }, client);
  const sdk = session.asIndividualController();

  await sdk.disableIndividual({}, {});
  assert.throws(
    () => sdk.purgeIndividualMember({}, {}),
    new RegExp(`requires capability '${ActorCapabilities.IndividualMemberPurge.replace('.', '\\.')}'`),
  );
});

test('IndividualControllerSdk enforces consent, ingest, related-person, and digital-twin capabilities when materialized from NodeActorSession', async () => {
  const client = {
    grantProfessionalAccess: async () => ({ ok: true }),
    ingestCommunicationAndUpdateIndex: async () => ({ ok: true }),
    upsertRelatedPersonAndPoll: async () => ({ ok: true }),
    generateDigitalTwinFromSubjectData: async () => ({ ok: true }),
  };
  const session = new NodeActorSession({
    actorKind: ActorKinds.IndividualController,
    capabilities: [ActorCapabilities.ConsentGrantProfessionalAccess],
  }, client);
  const sdk = session.asIndividualController();

  await sdk.grantProfessionalAccess({}, {});
  assert.throws(
    () => sdk.ingestCommunicationAndUpdateIndex({}, {}),
    new RegExp(`requires capability '${ActorCapabilities.IndividualIngestCommunication.replace('.', '\\.')}'`),
  );
  assert.throws(
    () => sdk.upsertRelatedPersonAndPoll({}, {}),
    new RegExp(`requires capability '${ActorCapabilities.IndividualUpsertRelatedPerson.replace('.', '\\.')}'`),
  );
  assert.throws(
    () => sdk.generateDigitalTwinFromSubjectData({}, {}),
    new RegExp(`requires capability '${ActorCapabilities.IndividualGenerateDigitalTwin.replace('.', '\\.')}'`),
  );
});

test('OrganizationEmployeeSdk enforces employee runtime capabilities when materialized from NodeActorSession', async () => {
  const client = {
    activateEmployeeDeviceWithActivationRequest: async () => ({ ok: true }),
    requestSmartToken: async () => ({ ok: true }),
  };
  const session = new NodeActorSession({
    actorKind: ActorKinds.OrganizationEmployee,
    capabilities: [ActorCapabilities.OrganizationActivateDevice],
  }, client);
  const sdk = session.asOrganizationEmployee();

  await sdk.activateEmployeeDeviceWithActivationRequest({});
  assert.throws(
    () => sdk.requestSmartToken({}),
    new RegExp(`requires capability '${ActorCapabilities.OrganizationRequestSmartToken.replace('.', '\\.')}'`),
  );
});

test('submitAndPollWithClient falls back to submitBatch plus pollUntilComplete', async () => {
  const calls = [];
  const result = await submitAndPollWithClient({
    submitBatch: async (...args) => {
      calls.push(['submitBatch', args]);
      return { status: 202, location: '/job/1', body: { accepted: true } };
    },
    pollUntilComplete: async (...args) => {
      calls.push(['pollUntilComplete', args]);
      return { status: 200, body: { done: true }, attempts: 2 };
    },
  }, '/submit', '/poll', { thid: 'job-1', body: {} }, { timeoutMs: 1000 });

  assert.deepEqual(result, {
    submit: { status: 202, location: '/job/1', body: { accepted: true } },
    poll: { status: 200, body: { done: true }, attempts: 2 },
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], 'submitBatch');
  assert.equal(calls[1][0], 'pollUntilComplete');
});

test('submitAndPollWithClient uses a direct submitAndPoll implementation when available', async () => {
  const calls = [];
  const result = await submitAndPollWithClient({
    submitAndPoll: async (...args) => {
      calls.push(['submitAndPoll', args]);
      return {
        submit: { status: 202, location: '/job/2', body: { accepted: true } },
        poll: { status: 200, body: { done: true }, attempts: 1 },
      };
    },
    submitBatch: async () => {
      throw new Error('fallback submitBatch should not be called');
    },
    pollUntilComplete: async () => {
      throw new Error('fallback pollUntilComplete should not be called');
    },
  }, '/submit', '/poll', { thid: '  job-2  ', body: {} }, { timeoutMs: 1000 });

  assert.deepEqual(result, {
    submit: { status: 202, location: '/job/2', body: { accepted: true } },
    poll: { status: 200, body: { done: true }, attempts: 1 },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1][2].thid, 'job-2');
});

test('submitAndPollWithMethods rejects payloads without thid before submitting', async () => {
  const calls = [];

  await assert.rejects(
    submitAndPollWithMethods({
      submitBatch: async (...args) => {
        calls.push(['submitBatch', args]);
        return { status: 202, body: {} };
      },
      pollUntilComplete: async () => {
        calls.push(['pollUntilComplete']);
        return { status: 200, body: {}, attempts: 1 };
      },
    }, '/submit', '/poll', { body: {} }, { timeoutMs: 1000 }),
    /requires payload\.thid\./,
  );

  assert.equal(calls.length, 0);
});

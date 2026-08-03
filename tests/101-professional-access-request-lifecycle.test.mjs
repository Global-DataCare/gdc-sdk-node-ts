import test from 'node:test';
import assert from 'node:assert/strict';

import {
  IndividualControllerSdk,
  ProfessionalSdk,
} from '../dist/index.js';

/**
 * Teaching goal:
 * Show the complete professional-to-subject access request lifecycle at the
 * public SDK facade: request before SMART, subject inbox, and a Consent
 * decision correlated to the original Communication.
 */
test('101: professional requests access and the subject answers the same Communication', async () => {
  const calls = [];
  const employerContext = {
    tenantId: 'professional-employer',
    jurisdiction: 'ES',
    sector: 'health-care',
  };
  const selectedSubjectContext = {
    tenantId: 'subject-provider',
    jurisdiction: 'ES',
    sector: 'health-care',
  };
  const subjectDid = 'did:web:patient.example';
  const professionalDid = 'did:web:clinic.example:member:zEmailHash:ISCO-08|2211';
  const role = 'ISCO-08|2211';
  const actions = ['LOINC|48765-2'];

  const runtimeClient = {
    defaultRouteContext: employerContext,
    async requestProfessionalAccess(routeContext, input) {
      calls.push({ operation: 'request', routeContext, input });
      return {
        thid: 'permission-request-thread-1',
        communicationIdentifier: 'urn:uuid:permission-request-1',
        communication: {
          thid: 'permission-request-thread-1',
          subject: input.subject,
          sender: input.sender,
          recipient: input.recipient,
          category: ['permission-request'],
          claims: {
            'AccessRequest.requester-target': input.requester.did,
            'AccessRequest.missing-sections': input.missing.sections.join(','),
          },
        },
        delivery: {
          submit: { status: 202, body: {} },
          poll: { status: 201, body: {}, attempts: 1 },
        },
      };
    },
    async searchCommunicationParticipants(routeContext, input) {
      calls.push({ operation: 'inbox', routeContext, input });
      return {
        submit: { status: 202, body: {} },
        poll: { status: 200, body: { data: [{ category: ['permission-request'] }] }, attempts: 1 },
      };
    },
    async grantProfessionalAccess(routeContext, input) {
      calls.push({ operation: 'decision', routeContext, input });
      return {
        thid: 'consent-thread-1',
        consent: {
          submit: { status: 202, body: {} },
          poll: { status: 201, body: {}, attempts: 1 },
        },
        subjectIdentifier: input.subjectDid,
        actorIdentifier: input.actorId,
        consentClaims: {},
      };
    },
  };
  const professionalSdk = new ProfessionalSdk(runtimeClient);
  const subjectSdk = new IndividualControllerSdk(runtimeClient);

  // Step 1. The professional runtime remains attached to the employer. The
  // selected card contributes only the destination context for this request.
  // No SMART token is an input to this operation.
  const request = await professionalSdk.requestProfessionalAccess(selectedSubjectContext, {
    subject: subjectDid,
    requester: { actorKind: 'professional', did: professionalDid },
    requesterRole: role,
    purpose: 'TREAT',
    missing: {
      sections: actions,
      resourceTypes: [],
      pairs: [{ section: actions[0], reason: 'missing-consent' }],
    },
    sender: professionalDid,
    recipient: subjectDid,
  });
  assert.deepEqual(request.communication.category, ['permission-request']);
  assert.equal(request.delivery.poll.status, 201);
  assert.deepEqual(runtimeClient.defaultRouteContext, employerContext);
  assert.deepEqual(calls[0].routeContext, selectedSubjectContext);

  // Step 2. The subject reads the GW-backed permission-request inbox. Push or
  // email can notify the user, but they are not the canonical record.
  const inbox = await subjectSdk.listProfessionalAccessRequests(selectedSubjectContext, {
    subject: subjectDid,
    recipientActorId: subjectDid,
  });
  assert.equal(inbox.poll.status, 200);
  assert.equal(calls[1].input.searchParams['Communication.category'], 'permission-request');

  // Step 3. The subject approves through the normal Consent operation while
  // preserving both identifiers from the originating Communication.
  await subjectSdk.respondToProfessionalAccessRequest(selectedSubjectContext, {
    requestThid: request.thid,
    requestCommunicationIdentifier: request.communicationIdentifier,
    subjectDid,
    actorId: professionalDid,
    actorRole: role,
    purpose: 'TREAT',
    actions,
    decision: 'permit',
  });

  assert.equal(calls[2].input.eventBasedOn, request.communicationIdentifier);
  assert.equal(
    calls[2].input.sourceReference,
    'Communication?identifier=urn%3Auuid%3Apermission-request-1',
  );
  assert.equal(calls[2].input.actorId, professionalDid);
});

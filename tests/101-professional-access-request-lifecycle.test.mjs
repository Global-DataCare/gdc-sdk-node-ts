/**
 * Complete journey:
 * 1. the professional selects a subject and the missing standard sections;
 * 2. the subject provider records one Communication with an attached draft Consent;
 * 3. the controller reads that Communication from the subject inbox;
 * 4. the controller answers by authoring a separate active Consent correlated
 *    to the original Communication identifiers.
 *
 * Authorization invariant: `Consent.status = draft` never grants access and
 * the request does not require a SMART token.
 * Persistence invariant: Communication `thid` and identifier survive inbox
 * readback and are referenced by the controller's later decision.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HealthcareActorRoles,
  HealthcareBasicSections,
  HealthcareConsentPurposes,
} from 'gdc-common-utils-ts/constants/healthcare';
import {
  EXAMPLE_CONSENT_IDENTIFIER,
  EXAMPLE_PROFESSIONAL_DID,
  EXAMPLE_SUBJECT_DID,
} from 'gdc-common-utils-ts/examples/shared';
import { ClaimConsent, ConsentStatuses } from 'gdc-common-utils-ts/models/consent-rule';

import {
  IndividualControllerSdk,
  ProfessionalSdk,
} from '../dist/index.js';

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
  // Step 0. Current-MVP precondition: individual onboarding already created
  // this DID. Professional-created individual/controller onboarding is a
  // separate planned GW v2 flow and is deliberately not simulated here.
  const subjectDid = EXAMPLE_SUBJECT_DID;
  const professionalDid = EXAMPLE_PROFESSIONAL_DID;
  const role = HealthcareActorRoles.GeneralistMedicalPractitioner;
  const actions = [HealthcareBasicSections.PatientSummaryDocument.attributeValue];

  const runtimeClient = {
    defaultRouteContext: employerContext,
    async requestProfessionalAccess(routeContext, input) {
      calls.push({ operation: 'request', routeContext, input });
      return {
        thid: 'permission-request-thread-1',
        communicationIdentifier: 'urn:uuid:permission-request-1',
        consentIdentifier: EXAMPLE_CONSENT_IDENTIFIER,
        communication: {
          thid: 'permission-request-thread-1',
          subject: input.subject,
          sender: input.sender,
          recipient: input.recipient,
          category: ['permission-request'],
          payload: {
            resourceType: 'Bundle',
            type: 'batch',
            data: [{
              resource: {
                resourceType: 'Consent',
                id: EXAMPLE_CONSENT_IDENTIFIER,
                status: ConsentStatuses.Draft,
                meta: { claims: {
                  [ClaimConsent.status]: ConsentStatuses.Draft,
                  [ClaimConsent.subject]: input.subject,
                  [ClaimConsent.actorIdentifier]: input.requester.did,
                  [ClaimConsent.action]: input.missing.sections.join(','),
                } },
              },
            }],
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
    purpose: HealthcareConsentPurposes.Treatment,
    missing: {
      sections: actions,
      resourceTypes: [],
      pairs: [{ section: actions[0], reason: 'missing-consent' }],
    },
    sender: professionalDid,
    recipient: subjectDid,
  });
  assert.deepEqual(request.communication.category, ['permission-request']);
  assert.equal(request.communication.payload.data[0].resource.status, ConsentStatuses.Draft);
  assert.equal(JSON.stringify(request).includes('AccessRequest.'), false);
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
    purpose: HealthcareConsentPurposes.Treatment,
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

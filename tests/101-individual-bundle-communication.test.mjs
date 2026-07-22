/**
 * Teaching goal:
 * - common-utils authors one Bundle containing one or several contact edits
 * - sdk-core turns the completed Bundle into one Communication outbox job
 * - sdk-node submits that job through the actor facade
 *
 * The direct `upsertRelatedPersonAndPoll` route is compatibility plumbing and
 * is deliberately absent from this 101.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ActorCapabilities,
  BundleEditableResourceTypes,
  BundleEditor,
  BundleOperations,
  BundleTypes,
} from '../../gdc-common-utils-ts/dist/index.js';
import {
  EXAMPLE_RELATED_PERSON_ACTIVE_NAME,
  EXAMPLE_RELATED_PERSON_IDENTIFIER,
  EXAMPLE_RELATED_PERSON_ROLE,
  EXAMPLE_SUBJECT_DID,
  EXAMPLE_TENANT_ROUTE_CONTEXT,
  EXAMPLE_TENANT_SERVICE_DID,
} from '../../gdc-common-utils-ts/dist/examples/shared.js';
import {
  attachBundleToCommMsgExtendedDraft,
  createCommMsgExtendedDraft,
  createCommunicationOutboxJobFromCommMsgExtendedDraft,
} from '../../gdc-sdk-core-ts/dist/index.js';

import { IndividualControllerSdk } from '../dist/index.js';

test('101: node actor facade submits a completed contact Bundle through Communication', async () => {
  // Step 1. Author the semantic Bundle and choose the commit boundary.
  const contacts = new BundleEditor()
    .setBundleOperation(BundleOperations.create)
    .setBundleType(BundleTypes.batch)
    .setAllowedResourceType(BundleEditableResourceTypes.relatedPerson);
  contacts
    .newEntryAs(BundleEditableResourceTypes.relatedPerson)
    .setIdentifier(EXAMPLE_RELATED_PERSON_IDENTIFIER)
    .setActive(true)
    .setSubject(EXAMPLE_SUBJECT_DID)
    .setRelationship(EXAMPLE_RELATED_PERSON_ROLE)
    .setName(EXAMPLE_RELATED_PERSON_ACTIVE_NAME)
    .doneEntry();

  // Step 2. Attach the whole Bundle and freeze one claims-first job.
  let draft = createCommMsgExtendedDraft({
    subject: EXAMPLE_SUBJECT_DID,
    sender: EXAMPLE_SUBJECT_DID,
    recipient: EXAMPLE_TENANT_SERVICE_DID,
  });
  draft = attachBundleToCommMsgExtendedDraft(draft, contacts.buildJsonApi());
  const communicationJob = createCommunicationOutboxJobFromCommMsgExtendedDraft(draft);

  // Step 3. The Node facade submits the already-authored intent.
  const calls = [];
  const sdk = new IndividualControllerSdk({
    async ingestCommunicationAndUpdateIndex(ctx, input) {
      calls.push({ ctx, input });
      return {
        submit: { status: 202, body: {} },
        poll: { status: 200, attempts: 1, body: {} },
      };
    },
  }, [ActorCapabilities.IndividualIngestCommunication]);

  const result = await sdk.ingestCommunicationAndUpdateIndex(
    EXAMPLE_TENANT_ROUTE_CONTEXT,
    { communicationJob },
  );

  assert.equal(result.poll.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input.communicationJob.id, communicationJob.id);
});

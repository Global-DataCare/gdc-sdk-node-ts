/**
 * Teaching goal:
 * prove that backend, portal and assistant consumers submit the same public
 * clinical outbox through every supported wire profile without hand-building
 * GW envelopes or test-only example payloads.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attachFhirResourceAsAttachmentToCommMsgExtendedDraft,
  createCommunicationOutboxJobFromCommMsgExtendedDraft,
  createCommMsgExtendedDraft,
  IndividualControllerSdk,
  NodeHttpClient,
  TransportProfiles,
} from '../dist/index.js';

const ctx = { tenantId: 'VATES-G02793479', jurisdiction: 'ES', sector: 'health-care' };

function createClinicalOutboxJob() {
  let communicationDraft = createCommMsgExtendedDraft({
    thid: 'clinical-outbox-thread-1',
    subject: 'did:web:subject.example:person-1',
    sender: 'did:web:professional.example:doctor-1',
    noteText: 'Imported IPS document',
  });
  communicationDraft = attachFhirResourceAsAttachmentToCommMsgExtendedDraft(communicationDraft, {
    resourceType: 'Bundle',
    type: 'document',
    entry: [{
      resource: {
        resourceType: 'Composition',
        status: 'final',
        subject: { reference: 'did:web:unid.online:card:uhc:personal:subject-1' },
      },
    }],
  });
  return createCommunicationOutboxJobFromCommMsgExtendedDraft(communicationDraft);
}

function createFetchRecorder(profile, calls) {
  return async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('_batch')) {
      return new Response('{}', { status: 202, headers: { 'content-type': 'application/json' } });
    }
    if (profile === TransportProfiles.DidcommEncryptedForm) {
      return new Response('response=terminal-jwe', {
        status: 200,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      });
    }
    return Response.json({ data: [{ response: { status: '200' } }] }, { status: 200 });
  };
}

for (const profile of Object.values(TransportProfiles)) {
  test(`IndividualControllerSdk submits one canonical outbox with ${profile}`, async () => {
    // Step 1. The app authors one FHIR document and freezes one reusable job.
    const job = createClinicalOutboxJob();
    const calls = [];
    const secureTransportAdapter = profile === TransportProfiles.DidcommEncryptedForm
      ? {
          async pack(message) { return `packed-${message.thid}`; },
          async unpack(jwe) { return { decrypted: jwe }; },
        }
      : undefined;
    const sdk = new IndividualControllerSdk(new NodeHttpClient({
      baseUrl: 'https://gw.example',
      ctx,
      bearerToken: 'smart-access-token',
      transportProfile: profile,
      secureTransportAdapter,
      fetchImpl: createFetchRecorder(profile, calls),
    }));

    // Step 2. The actor facade owns submit and poll; the app passes no raw GW batch.
    const result = await sdk.ingestCommunicationAndUpdateIndex(ctx, {
      communicationJob: job,
      clinicalFormat: 'r4',
      pollOptions: { intervalMs: 1, timeoutMs: 100 },
    });

    // Step 3. Every profile reaches the same route and terminal result.
    assert.equal(result.poll.status, 200);
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /Communication\/_batch$/);
    assert.match(calls[1].url, /Communication\/_batch-response$/);

    if (profile === TransportProfiles.FhirJson) {
      assert.equal(calls[0].init.headers['Content-Type'], 'application/fhir+json');
      const body = JSON.parse(calls[0].init.body);
      assert.equal(body.resourceType, 'Bundle');
      assert.equal(body.entry[0].resource.resourceType, 'Communication');
    } else if (profile === TransportProfiles.DidcommPlainJson) {
      assert.equal(calls[0].init.headers['Content-Type'], 'application/didcomm-plain+json');
      const body = JSON.parse(calls[0].init.body);
      assert.equal(body.body.entry[0].resource.resourceType, 'Communication');
    } else {
      assert.equal(calls[0].init.headers['Content-Type'], 'application/x-www-form-urlencoded');
      assert.equal(calls[0].init.body, 'request=packed-clinical-outbox-thread-1');
      assert.equal(calls[1].init.body, 'request=packed-clinical-outbox-thread-1');
      assert.deepEqual(result.poll.body, { decrypted: 'terminal-jwe' });
    }
  });
}

test('secure clinical transport fails before network I/O without a wallet adapter', async () => {
  const calls = [];
  const sdk = new IndividualControllerSdk(new NodeHttpClient({
    baseUrl: 'https://gw.example',
    ctx,
    transportProfile: TransportProfiles.DidcommEncryptedForm,
    fetchImpl: createFetchRecorder(TransportProfiles.DidcommEncryptedForm, calls),
  }));
  await assert.rejects(
    sdk.ingestCommunicationAndUpdateIndex(ctx, { communicationJob: createClinicalOutboxJob() }),
    /requires a secure adapter/,
  );
  assert.equal(calls.length, 0);
});

test('subject-scoped clinical search uses the same protected profile as ingestion', async () => {
  const calls = [];
  const sdk = new IndividualControllerSdk(new NodeHttpClient({
    baseUrl: 'https://gw.example',
    ctx,
    transportProfile: TransportProfiles.DidcommEncryptedForm,
    secureTransportAdapter: {
      async pack(message) { return `packed-${message.thid}`; },
      async unpack(jwe) { return { decrypted: jwe }; },
    },
    fetchImpl: createFetchRecorder(TransportProfiles.DidcommEncryptedForm, calls),
  }));
  const result = await sdk.searchClinicalBundle(ctx, {
    subject: 'did:web:unid.online:card:uhc:personal:subject-1',
    includedTypes: ['Composition', 'DocumentReference'],
  });

  assert.equal(calls[0].init.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.match(calls[0].init.body, /^request=packed-bundle-search-/);
  assert.match(calls[1].init.body, /^request=packed-bundle-search-/);
  assert.deepEqual(result.poll.body, { decrypted: 'terminal-jwe' });
});

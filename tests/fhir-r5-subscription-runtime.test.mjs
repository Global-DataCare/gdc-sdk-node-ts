import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FhirR5SubscriptionScopes,
  buildFhirR5RestHookSubscription,
} from 'gdc-common-utils-ts/models/fhir-r5-subscription';
import {
  submitFhirR5SubscriptionBatchWithDeps,
  submitFhirR5SubscriptionTopicBatchWithDeps,
} from '../dist/fhir-r5-subscription-runtime.js';

const ctx = { tenantId: 'tenant.example', jurisdiction: 'ES', sector: 'health-care' };
const ids = () => 'fixed-id';

test('submits one topic through the entity R5 batch route', async () => {
  let call;
  await submitFhirR5SubscriptionTopicBatchWithDeps(ctx, {
    resourceType: 'SubscriptionTopic', id: 'new-data', status: 'active',
    url: 'https://profiles.example/SubscriptionTopic/new-data',
    resourceTrigger: [{ resource: 'Observation' }],
  }, undefined, {
    createRuntimeUuid: ids,
    submitPath: () => '/entity/topic/_batch', pollPath: () => '/entity/topic/_batch-response',
    submitAndPoll: async (...args) => { call = args; return { submit: {}, poll: {} }; },
  });
  assert.equal(call[0], '/entity/topic/_batch');
  assert.equal(call[2].body.entry[0].resource.resourceType, 'SubscriptionTopic');
});

test('submits an exact-patient Subscription through the individual R5 batch route', async () => {
  let call;
  const subscription = buildFhirR5RestHookSubscription({
    id: 'patient-events', scope: FhirR5SubscriptionScopes.Individual,
    topic: 'https://profiles.example/SubscriptionTopic/new-data',
    endpoint: 'https://bff.example/fhir/subscriptions',
    filters: [{ resourceType: 'Observation', filterParameter: 'patient', value: 'Patient/123' }],
  });
  await submitFhirR5SubscriptionBatchWithDeps(ctx, {
    subscription, scope: FhirR5SubscriptionScopes.Individual,
  }, undefined, {
    createRuntimeUuid: ids,
    submitPath: (_ctx, section) => `/${section}/subscription/_batch`,
    pollPath: (_ctx, section) => `/${section}/subscription/_batch-response`,
    submitAndPoll: async (...args) => { call = args; return { submit: {}, poll: {} }; },
  });
  assert.equal(call[0], '/individual/subscription/_batch');
  assert.equal(call[2].body.entry[0].resource.resourceType, 'Subscription');
});

// Flow contract:
// 1. The subject BFF opens one section-scoped FHIR batch.
// 2. One typed entry creates a fact and another deletes an exact ResourceType/id.
// 3. The delete may bind the current version and carries no resource body.
// Authorization invariant: GW, not the client bundle, proves creator identity.
// Persistence invariant: the clinical resource stores only its creator DID.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ActorCapabilities,
  ActorKinds,
  BundleEditor,
  BundleEditableResourceTypes,
  BundleTypes,
  NodeActorSession,
  toClinicalResourceCardView,
} from '../dist/index.js';
import { HttpRequestMethods } from 'gdc-common-utils-ts/constants/http';
import { BundleOperations } from 'gdc-common-utils-ts/models/bundle-editor-types';

test('Node SDK exposes the canonical coded clinical authoring/display surface', () => {
  assert.equal(typeof BundleEditor, 'function');
  assert.equal(typeof toClinicalResourceCardView, 'function');
});

test('Node SDK builds mixed POST and DELETE clinical batch entries', () => {
  const editor = new BundleEditor()
    .setBundleType(BundleTypes.batch)
    .setBundleOperation(BundleOperations.create);
  editor.newEntryAs(BundleEditableResourceTypes.allergyIntolerance, 'allergy-create-001').create();
  editor.newEntryAs(BundleEditableResourceTypes.allergyIntolerance, 'allergy-delete-001')
    .delete()
    .ifMatch('version-delete-001');

  const bundle = editor.build();
  assert.equal(bundle.entry[0].request.method, HttpRequestMethods.Post);
  assert.equal(bundle.entry[1].request.method, HttpRequestMethods.Delete);
  assert.equal(bundle.entry[1].request.url, 'AllergyIntolerance/allergy-delete-001');
  assert.equal(bundle.entry[1].request.ifMatch, 'W/"version-delete-001"');
  assert.equal('resource' in bundle.entry[1], false);
});

test('Node clinical facade preserves independent partial batch outcomes', async () => {
  const outcomes = [
    { id: 'observation-create-001', response: { status: '201' } },
    { id: 'allergy-delete-001', response: { status: '403' } },
  ];
  const sdk = new NodeActorSession({
    actorKind: ActorKinds.IndividualController,
    capabilities: [ActorCapabilities.IndividualIngestCommunication],
  }, {
    updateClinicalSection: async () => ({ poll: { status: 200, body: { data: outcomes } } }),
  }).asIndividualController();

  const result = await sdk.updateClinicalSection({
    tenantId: 'acme',
    jurisdiction: 'ES',
    sector: 'health-care',
  }, {
    subject: 'did:web:subject.example',
    section: 'http://loinc.org|48765-2',
    bundle: { resourceType: 'Bundle', type: 'batch', data: [{ id: 'mixed-command' }] },
  });

  assert.deepEqual(result.poll.body.data, outcomes);
});

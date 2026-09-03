// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ActorKinds,
  EXAMPLE_CONTROLLER_DID,
  ResourceTypesFhirR4,
} from 'gdc-common-utils-ts';
import {
  ActorSession,
  cloneImportedClinicalDocumentForDemo,
} from '../dist/index.js';

test('exports the imported clinical document demo clone helper from the Node SDK', () => {
  assert.equal(typeof cloneImportedClinicalDocumentForDemo, 'function');
});

test('clones with the current actor session DID without accepting an author supplied by the portal', () => {
  const session = new ActorSession({
    actorKind: ActorKinds.IndividualController,
    actorDid: EXAMPLE_CONTROLLER_DID,
  });
  const bundle = {
    resourceType: ResourceTypesFhirR4.Bundle,
    type: 'document',
    entry: [{
      resource: {
        resourceType: ResourceTypesFhirR4.Composition,
        id: 'source-composition',
        author: [{ reference: 'urn:uuid:external-author' }],
      },
    }],
  };

  const cloned = session.cloneImportedClinicalDocumentForDemo(bundle, {
    createResourceId: () => 'demo-composition',
  });

  assert.equal(cloned.entry[0].resource.author[0].reference, EXAMPLE_CONTROLLER_DID);
  assert.equal(bundle.entry[0].resource.author[0].reference, 'urn:uuid:external-author');
});

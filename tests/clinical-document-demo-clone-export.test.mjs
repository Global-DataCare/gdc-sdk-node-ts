// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ActorKinds,
  EXAMPLE_CONTROLLER_DID,
  EXAMPLE_INDIVIDUAL_CONTROLLER_ROLE_VALUE,
  EXAMPLE_KYC_CONTROLLER_USER_UUID,
  EXAMPLE_KYC_CONTROLLER_UUID,
  EXAMPLE_SUBJECT_DID,
  FhirIpsCreatorKinds,
  ResourceTypesFhirR4,
} from 'gdc-common-utils-ts';
import {
  ActorSession,
  cloneImportedClinicalDocumentForDemo,
  resolveClinicalCreatorIpsExport,
} from '../dist/index.js';

test('exports the imported clinical document demo clone helper from the Node SDK', () => {
  assert.equal(typeof cloneImportedClinicalDocumentForDemo, 'function');
});

test('clones with protected member provenance and keeps actorDid as transport identity only', () => {
  // Application contract: the session actorDid is operational. The exact
  // registered RelatedPerson urn:uuid is both FHIR author and attester.
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
    clinicalCreator: resolveClinicalCreatorIpsExport({
      bindings: [{
        kind: FhirIpsCreatorKinds.IndividualMember,
        actorIdentifier: `urn:uuid:${EXAMPLE_KYC_CONTROLLER_USER_UUID}`,
        authorIdentifier: `urn:uuid:${EXAMPLE_KYC_CONTROLLER_UUID}`,
        ownerIdentifier: EXAMPLE_SUBJECT_DID,
        role: EXAMPLE_INDIVIDUAL_CONTROLLER_ROLE_VALUE,
        actorDids: [EXAMPLE_CONTROLLER_DID],
      }],
      evidence: { actorDid: EXAMPLE_CONTROLLER_DID },
    }),
    createResourceId: () => 'demo-composition',
  });

  assert.equal(cloned.entry[0].resource.author[0].reference, `urn:uuid:${EXAMPLE_KYC_CONTROLLER_UUID}`);
  assert.equal(cloned.entry[0].resource.attester[0].party.reference, `urn:uuid:${EXAMPLE_KYC_CONTROLLER_UUID}`);
  assert.equal(bundle.entry[0].resource.author[0].reference, 'urn:uuid:external-author');
});

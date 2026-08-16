import test from 'node:test';
import assert from 'node:assert/strict';

import { ActorKinds, NodeActorSession } from '../dist/index.js';

const ROUTE_CONTEXT = Object.freeze({
  tenantId: 'acme-id',
  jurisdiction: 'ES',
  sector: 'health-care',
});
const EMPLOYEE_DID = 'did:web:api.acme.org:employee:researcher-1:ISCO-08|2211';
const TWIN_SUBJECT_ID = 'urn:uuid:00000000-0000-4000-8000-000000000101';
const MEDICATION_SECTION = 'LOINC|10160-0';
const MEDICATION_CODE = 'http://snomed.info/sct|108575001';
const WORKSET_TAG = Object.freeze({
  system: 'urn:acme:research:workset',
  code: 'study-2026-04',
  userSelected: true,
});

test('101: employee searches, tags, reopens, and materializes a digital twin working selection', async () => {
  const calls = [];
  const runtimeClient = {
    requestSmartToken: async (input) => {
      calls.push(['token', input]);
      return { accessToken: 'smart-research-token' };
    },
    searchDigitalTwins: async (_ctx, input) => {
      calls.push(['search', input]);
      const isWorksetSearch = input.filters?.['Composition.meta-tag'] === `${WORKSET_TAG.system}|${WORKSET_TAG.code}`;
      return {
        poll: {
          body: {
            data: [{
              resource: {
                data: [{
                  id: isWorksetSearch ? 'urn:uuid:researcher-selection-1' : 'urn:uuid:canonical-twin-composition-1',
                  'Composition.subject': TWIN_SUBJECT_ID,
                  'Composition.section': MEDICATION_SECTION,
                  ...(isWorksetSearch ? { meta: { tag: [WORKSET_TAG] } } : {}),
                }],
              },
            }],
          },
        },
      };
    },
    saveDigitalTwinSelection: async (_ctx, input) => {
      calls.push(['save-selection', input]);
      return { saved: true };
    },
    materializeDigitalTwin: async (_ctx, input) => {
      calls.push(['materialize', input]);
      return { bundle: { resourceType: 'Bundle', type: 'document' } };
    },
  };

  // The portal has already authenticated one verified organization employee.
  const digitalTwin = new NodeActorSession({
    actorKind: ActorKinds.OrganizationEmployee,
    actorDid: EMPLOYEE_DID,
  }, runtimeClient).asDigitalTwin();

  // Same-tenant employees use their verified employee proof. A foreign
  // organization additionally forwards its matching contract/consent VP.
  await digitalTwin.requestSmartToken({
    actorDid: EMPLOYEE_DID,
    scopes: ['organization/ResearchSubject.rs?subject=*'],
  });

  // Discovery uses coded research claims. Free text and display are absent.
  const discovery = await digitalTwin.search(ROUTE_CONTEXT, {
    filters: {
      section: MEDICATION_SECTION,
      'MedicationStatement.code': MEDICATION_CODE,
    },
  });
  const selectedTwinSubjectId = discovery.poll.body.data[0].resource.data[0]['Composition.subject'];

  // Saving a selection creates a researcher-owned Composition branch. It does
  // not modify the canonical twin and stores no clinical data or display text.
  await digitalTwin.saveSelection(ROUTE_CONTEXT, {
    twinSubjectId: selectedTwinSubjectId,
    section: MEDICATION_SECTION,
    tags: [WORKSET_TAG],
  });

  // A later session reopens the same workset by exact custom tag.
  const workset = await digitalTwin.search(ROUTE_CONTEXT, {
    filters: {
      section: MEDICATION_SECTION,
      'Composition.meta-tag': `${WORKSET_TAG.system}|${WORKSET_TAG.code}`,
    },
  });
  const reopenedSelection = workset.poll.body.data[0].resource.data[0];
  assert.equal(reopenedSelection['Composition.subject'], TWIN_SUBJECT_ID);
  assert.deepEqual(reopenedSelection.meta.tag, [WORKSET_TAG]);

  // Only now is the selected pseudonymous subject materialized as an IPS-like
  // research Bundle through Communication -> ResearchSubject/$summary.
  await digitalTwin.materialize(ROUTE_CONTEXT, {
    twinSubjectId: reopenedSelection['Composition.subject'],
    sections: [MEDICATION_SECTION],
  });

  assert.deepEqual(calls.map(([name]) => name), [
    'token',
    'search',
    'save-selection',
    'search',
    'materialize',
  ]);
  const savedInput = calls[2][1];
  assert.equal(savedInput.authorDid, EMPLOYEE_DID);
  assert.equal(savedInput.accessToken, 'smart-research-token');
  assert.equal(savedInput.twinSubjectId, TWIN_SUBJECT_ID);
});

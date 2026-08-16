import test from 'node:test';
import assert from 'node:assert/strict';

import { ActorKinds, NodeActorSession } from '../dist/index.js';
import { buildOrganizationDidWeb, buildProfessionalDidWeb } from 'gdc-common-utils-ts/utils/did';
import {
  EXAMPLE_HOST_PUBLIC_HOSTNAME,
  EXAMPLE_ROUTE_VERSION,
  EXAMPLE_TENANT_ROUTE_CONTEXT,
  ExampleEmployeeEmails,
  ExampleEmployeeRoles,
} from 'gdc-common-utils-ts/examples';

const ROUTE_CONTEXT = EXAMPLE_TENANT_ROUTE_CONTEXT;
const HOSTED_ORGANIZATION_DID = buildOrganizationDidWeb({
  hostDidWeb: `did:web:${EXAMPLE_HOST_PUBLIC_HOSTNAME}`,
  tenantId: ROUTE_CONTEXT.tenantId,
  jurisdiction: ROUTE_CONTEXT.jurisdiction,
  version: EXAMPLE_ROUTE_VERSION,
  sector: ROUTE_CONTEXT.sector,
});
const EMPLOYEE_DID = buildProfessionalDidWeb({
  organizationDidWeb: HOSTED_ORGANIZATION_DID,
  email: ExampleEmployeeEmails.SharedProfessional,
  role: ExampleEmployeeRoles.Doctor,
});
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
                total: 1,
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
  const selectedTwinSubjectId = discovery.matches[0]['Composition.subject'];

  // Saving a selection creates a researcher-owned Composition branch. It does
  // not modify the canonical twin and stores no clinical data or display text.
  await digitalTwin.saveSelection(ROUTE_CONTEXT, {
    twinSubjectId: selectedTwinSubjectId,
    section: MEDICATION_SECTION,
    tags: [WORKSET_TAG],
  });

  // A later session reopens the same workset by exact custom tag.
  const workset = await digitalTwin.searchSelections(ROUTE_CONTEXT, {
    section: MEDICATION_SECTION,
    tag: WORKSET_TAG,
  });
  const reopenedSelection = workset.matches[0];
  assert.equal(workset.total, 1);
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
  assert.equal(calls[3][1].filters['Composition.author'], EMPLOYEE_DID);
});

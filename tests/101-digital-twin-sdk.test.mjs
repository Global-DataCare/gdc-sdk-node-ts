import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ActorKinds,
  buildDigitalTwinWorksetTagSystem,
  DigitalTwinSearchParameter,
  NodeActorSession,
} from '../dist/index.js';
import {
  DataspaceSectors,
  HealthcareConsentPurposes,
  HealthcareCoreSections,
  ServiceCapability,
} from 'gdc-common-utils-ts/constants';
import { CompositionClaim, MedicationStatementClaim } from 'gdc-common-utils-ts/models';
import { buildOrganizationDidWeb, buildProfessionalDidWeb } from 'gdc-common-utils-ts/utils/did';
import {
  EXAMPLE_HOST_PUBLIC_HOSTNAME,
  EXAMPLE_MEDICATION_STATEMENT_CODE,
  ExampleEmployeeEmails,
  ExampleEmployeeRoles,
} from 'gdc-common-utils-ts/examples';

const ROUTE_CONTEXT = Object.freeze({
  tenantId: 'acme-id',
  jurisdiction: 'ES',
  sector: DataspaceSectors.HealthCare,
});
const HOSTED_ORGANIZATION_DID = buildOrganizationDidWeb({
  hostDidWeb: `did:web:${EXAMPLE_HOST_PUBLIC_HOSTNAME}`,
  tenantId: ROUTE_CONTEXT.tenantId,
  jurisdiction: ROUTE_CONTEXT.jurisdiction,
  version: 'v1',
  sector: ROUTE_CONTEXT.sector,
});
const EMPLOYEE_DID = buildProfessionalDidWeb({
  organizationDidWeb: HOSTED_ORGANIZATION_DID,
  email: ExampleEmployeeEmails.SharedProfessional,
  role: ExampleEmployeeRoles.Doctor,
});
const TWIN_SUBJECT_ID = 'urn:uuid:00000000-0000-4000-8000-000000000101';
const MEDICATION_SECTION = HealthcareCoreSections.HistoryOfMedicationUse.attributeValue;
const MEDICATION_CODE = EXAMPLE_MEDICATION_STATEMENT_CODE;
const WORKSET_TAG = Object.freeze({
  system: buildDigitalTwinWorksetTagSystem(HOSTED_ORGANIZATION_DID),
  code: 'medication-review-april-2026',
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
                  [CompositionClaim.Subject]: TWIN_SUBJECT_ID,
                  [CompositionClaim.Section]: MEDICATION_SECTION,
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
    purpose: HealthcareConsentPurposes.Research,
    scopes: [ServiceCapability.DigitalTwinReader],
  });

  // Discovery uses coded research claims. Free text and display are absent.
  const discovery = await digitalTwin.search(ROUTE_CONTEXT, {
    filters: {
      [DigitalTwinSearchParameter.Section]: MEDICATION_SECTION,
      [MedicationStatementClaim.Code]: MEDICATION_CODE,
    },
  });
  const selectedTwinSubjectId = discovery.matches[0][CompositionClaim.Subject];

  // Saving creates a researcher-owned Composition working selection. It does
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
  assert.equal(reopenedSelection[CompositionClaim.Subject], TWIN_SUBJECT_ID);
  assert.deepEqual(reopenedSelection.meta.tag, [WORKSET_TAG]);

  // Only now is the selected pseudonymous subject materialized as an IPS-like
  // research Bundle through Communication -> ResearchSubject/$summary.
  await digitalTwin.materialize(ROUTE_CONTEXT, {
    twinSubjectId: reopenedSelection[CompositionClaim.Subject],
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
  assert.equal(calls[3][1].filters[CompositionClaim.Author], EMPLOYEE_DID);
});

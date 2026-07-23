/**
 * Teaching goal:
 * - read the clinical data currently available for one individual
 * - express the request as Communication -> Subject/$summary -> FHIR Parameters
 * - consume the returned document through BundleReader section navigation
 *
 * This is a read lifecycle. `ingestCommunicationAndUpdateIndex(...)` belongs
 * only to write/projection flows and must not be used by application code here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ActorCapabilities,
  BundleReader,
  EXAMPLE_SUBJECT_DID,
  EXAMPLE_TENANT_ROUTE_CONTEXT,
  HealthcareBasicSections,
} from 'gdc-common-utils-ts';
import {
  createCommunicationFacade,
  IndividualControllerSdk,
} from '../dist/index.js';

test('101: individual controller requests and reads the available clinical summary', async () => {
  const section = HealthcareBasicSections.AllergiesAndIntolerances.attributeValue;
  const calls = [];
  const sdk = new IndividualControllerSdk({
    async requestClinicalSummary(ctx, input) {
      calls.push({ ctx, input });
      const bundle = {
        resourceType: 'Bundle',
        type: 'document',
        entry: [
          {
            resource: {
              resourceType: 'Composition',
              section: [{
                code: { coding: [{
                  system: HealthcareBasicSections.AllergiesAndIntolerances.system,
                  code: HealthcareBasicSections.AllergiesAndIntolerances.code,
                }] },
                entry: [{ reference: 'urn:uuid:allergy-summary-1' }],
              }],
            },
          },
          {
            resource: {
              resourceType: 'AllergyIntolerance',
              id: 'allergy-summary-1',
              recordedDate: '2026-07-20T10:00:00Z',
            },
          },
        ],
      };
      return {
        operation: {
          submit: { status: 202, body: { accepted: true } },
          poll: { status: 200, attempts: 1, body: {} },
        },
        bundle,
        reader: new BundleReader(bundle),
        document: createCommunicationFacade().getFhirDocument(bundle),
      };
    },
  }, [
    ActorCapabilities.IndividualReadClinicalSummary,
  ]);

  // Step 1. Request only the section needed by the current screen or channel.
  const summary = await sdk.requestClinicalSummary(
    EXAMPLE_TENANT_ROUTE_CONTEXT,
    {
      subjectId: EXAMPLE_SUBJECT_DID,
      requesterId: EXAMPLE_SUBJECT_DID,
      filterSections: [section],
    },
  );

  // Step 2. Navigate the authoritative returned document by section.
  const allergies = summary.reader.getDocumentSectionByCode(section);

  // Step 3. The SDK Core document facade resolves resources and combines
  // section, resource-type and date filters without another network request.
  const allergyResources = summary.document.getResourcesByFilter({
    sections: [section],
    types: ['AllergyIntolerance'],
    date: { start: '2026-01-01', end: '2026-12-31' },
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].input.filterSections, [section]);
  assert.equal(summary.bundle.type, 'document');
  assert.deepEqual(allergies?.entryReferences, ['urn:uuid:allergy-summary-1']);
  assert.equal(summary.reader.getDocumentSectionResourceCount(section), 1);
  assert.equal(allergyResources.length, 1);
});

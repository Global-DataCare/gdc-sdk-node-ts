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
  AllergyIntoleranceClaim,
  BundleReader,
  EXAMPLE_SUBJECT_DID,
  EXAMPLE_TENANT_ROUTE_CONTEXT,
  HealthcareBasicSections,
  ResourceTypesFhirR4,
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
            fullUrl: 'urn:uuid:allergy-summary-1',
            resource: {
              resourceType: 'AllergyIntolerance',
              id: 'allergy-summary-1',
              recordedDate: '2026-07-20T10:00:00Z',
              code: { text: 'Ibuprofeno' },
              meta: {
                claims: {
                  [AllergyIntoleranceClaim.Identifier]: 'allergy-summary-1',
                  [AllergyIntoleranceClaim.OnsetDateTime]:
                    '2026-07-20T10:00:00Z',
                },
              },
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

  // Step 2. Build the section navigation and its unfiltered count badge.
  const sections = summary.reader.getDocumentSections();
  const allergies = summary.reader.getDocumentSectionByCode(section);
  const declaredCount =
    summary.reader.getDocumentSectionResourceCount(section);
  const references =
    summary.reader.getDocumentSectionResourceReferences(section);

  // Step 3. Resolve stable IDs and complete Bundle entries for one section.
  const allergyIds =
    summary.reader.getDocumentSectionResourceIds(section);
  const allergyEntries =
    summary.reader.getDocumentSectionResourceEntries(section);

  // Step 4. Scope the existing read facade for cards and the filtered UI
  // badge. Each filter returns a new facade; no new GW request is performed.
  const allergyView = summary.document
    .filterBySections([section])
    .filterByTypes([ResourceTypesFhirR4.AllergyIntolerance])
    .filterByClinicalDateRange('2026-01-01', '2026-12-31');
  const allergyResources = allergyView.getResources();
  const visibleCount = allergyView.getResourceCount();

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].input.filterSections, [section]);
  assert.equal(summary.bundle.type, 'document');
  assert.equal(summary.reader.getDocumentSectionCount(), 1);
  assert.equal(sections.length, 1);
  assert.deepEqual(allergies?.entryReferences, ['urn:uuid:allergy-summary-1']);
  assert.equal(declaredCount, 1);
  assert.deepEqual(references, ['urn:uuid:allergy-summary-1']);
  assert.deepEqual(allergyIds, ['urn:uuid:allergy-summary-1']);
  assert.equal(allergyEntries.length, 1);
  assert.equal(
    allergyEntries[0]?.resource?.resourceType,
    ResourceTypesFhirR4.AllergyIntolerance,
  );
  assert.equal(allergyResources.length, 1);
  assert.equal(visibleCount, 1);
  assert.equal(
    summary.document.getResources(ResourceTypesFhirR4.AllergyIntolerance).length,
    1,
  );
  assert.equal(allergyView.getResources().length, 1);
  assert.equal(
    summary.document.getContainingTextOrDisplay(
      ResourceTypesFhirR4.AllergyIntolerance,
      'ibuprofeno',
    ).length,
    1,
  );
  assert.equal(
    summary.reader.getDocumentSectionResourceCount('missing-section'),
    0,
  );
  assert.deepEqual(
    summary.reader.getDocumentSectionResourceEntries('missing-section'),
    [],
  );
});

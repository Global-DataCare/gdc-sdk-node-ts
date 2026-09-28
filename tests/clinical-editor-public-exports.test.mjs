// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AllergyIntoleranceReactionSeverities,
  BundleEditableResourceTypes,
  BundleEditor,
  EXAMPLE_IMMUNIZATION_VACCINE_CODE_SYSTEM,
  EXAMPLE_IMMUNIZATION_VACCINE_CODE_VALUE,
} from 'gdc-common-utils-ts';
import * as sdk from '../dist/index.js';

test('Node SDK exports the typed clinical editors used by application integrations', () => {
  const editorNames = [
    'AllergyIntoleranceEntryEditor',
    'CarePlanEntryEditor',
    'ClinicalImpressionEntryEditor',
    'ConditionEntryEditor',
    'ConsentEntryEditor',
    'CoverageEntryEditor',
    'DeviceEntryEditor',
    'DeviceUseStatementEntryEditor',
    'DiagnosticReportEntryEditor',
    'DocumentReferenceEntryEditor',
    'EmployeeEntryEditor',
    'EncounterEntryEditor',
    'FlagEntryEditor',
    'ImmunizationEntryEditor',
    'MedicationStatementEntryEditor',
    'ObservationEntryEditor',
    'ProcedureEntryEditor',
    'RelatedPersonEntryEditor',
    'VitalSignEntryEditor',
  ];
  for (const editorName of editorNames) {
    assert.equal(typeof sdk[editorName], 'function', `${editorName} must be a public root export`);
  }
  assert.equal(sdk.AllergyIntoleranceReactionSeverities, AllergyIntoleranceReactionSeverities);

  const allergy = new BundleEditor()
    .newEntryAs(BundleEditableResourceTypes.allergyIntolerance)
    .asAllergy()
    .setReactionSeverity(AllergyIntoleranceReactionSeverities.Moderate);
  assert.equal(allergy.getReactionSeverity(), AllergyIntoleranceReactionSeverities.Moderate);

  assert.equal(
    typeof sdk.MedicationStatementEntryEditor.prototype.setEffectivePeriodEnd,
    'function',
  );
  assert.equal(typeof sdk.ObservationEntryEditor.prototype.setReferenceRangeText, 'function');

  const immunization = new BundleEditor()
    .newEntryAs(BundleEditableResourceTypes.immunization)
    .asImmunization()
    .setRoute(
      EXAMPLE_IMMUNIZATION_VACCINE_CODE_SYSTEM,
      EXAMPLE_IMMUNIZATION_VACCINE_CODE_VALUE,
    )
    .setSite(
      EXAMPLE_IMMUNIZATION_VACCINE_CODE_SYSTEM,
      EXAMPLE_IMMUNIZATION_VACCINE_CODE_VALUE,
    );
  assert.equal(immunization.getRouteCode(), EXAMPLE_IMMUNIZATION_VACCINE_CODE_VALUE);
  assert.equal(immunization.getSiteCode(), EXAMPLE_IMMUNIZATION_VACCINE_CODE_VALUE);

  const receivedBundle = new BundleEditor()
    .newEntryAs(BundleEditableResourceTypes.allergyIntolerance)
    .asAllergy()
    .setReactionSeverity(AllergyIntoleranceReactionSeverities.Mild)
    .doneEntry()
    .buildJsonApi();
  const receivedAllergy = new sdk.BundleReader(receivedBundle)
    .toBundleEditor()
    .openEntryByArrayIndex(0)
    .asAllergy();
  assert.equal(
    receivedAllergy.getReactionSeverity(),
    AllergyIntoleranceReactionSeverities.Mild,
  );
});

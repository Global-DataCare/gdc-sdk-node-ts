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
  assert.equal(typeof sdk.AllergyIntoleranceEntryEditor, 'function');
  assert.equal(typeof sdk.MedicationStatementEntryEditor, 'function');
  assert.equal(typeof sdk.ImmunizationEntryEditor, 'function');
  assert.equal(typeof sdk.ObservationEntryEditor, 'function');
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
});

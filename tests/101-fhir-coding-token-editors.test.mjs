// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BundleEditableResourceTypes,
  BundleEditor,
  EXAMPLE_IMMUNIZATION_VACCINE_CODE,
  EXAMPLE_IMMUNIZATION_VACCINE_CODE_SYSTEM,
  EXAMPLE_IMMUNIZATION_VACCINE_CODE_VALUE,
} from 'gdc-common-utils-ts';

test('101: a Node application authors one coding without concatenating the FHIR token', () => {
  // Step 1. The terminology selector supplies the coding system and value separately.
  const immunization = new BundleEditor()
    .newEntryAs(BundleEditableResourceTypes.immunization)
    .asImmunization()
    .setVaccineCode(
      EXAMPLE_IMMUNIZATION_VACCINE_CODE_SYSTEM,
      EXAMPLE_IMMUNIZATION_VACCINE_CODE_VALUE,
    );

  // Step 2. The app reads either component or the canonical FHIR token.
  assert.equal(immunization.getVaccineCode(), EXAMPLE_IMMUNIZATION_VACCINE_CODE_VALUE);
  assert.equal(immunization.getVaccineCodeSystem(), EXAMPLE_IMMUNIZATION_VACCINE_CODE_SYSTEM);
  assert.equal(immunization.getVaccineSystemAndCode(), EXAMPLE_IMMUNIZATION_VACCINE_CODE);

  // Step 3. Existing compact-token callers remain supported.
  immunization.setVaccineCode(EXAMPLE_IMMUNIZATION_VACCINE_CODE);
  assert.equal(immunization.getVaccineSystemAndCode(), EXAMPLE_IMMUNIZATION_VACCINE_CODE);
});

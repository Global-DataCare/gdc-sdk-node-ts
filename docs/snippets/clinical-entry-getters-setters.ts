// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
import {
  AllergyIntoleranceReactionSeverities,
  BundleReader,
} from 'gdc-sdk-node-ts';

export function updateReceivedAllergy(
  receivedBundle: unknown,
  entryIndex: number,
  severity: typeof AllergyIntoleranceReactionSeverities[keyof typeof AllergyIntoleranceReactionSeverities],
) {
  const editableBundle = new BundleReader(receivedBundle).toBundleEditor();
  const allergy = editableBundle
    .openEntryByArrayIndex(entryIndex)
    .asAllergy();

  const previousSeverity = allergy.getReactionSeverity();
  allergy.setReactionSeverity(severity);

  return {
    previousSeverity,
    updatedBundle: editableBundle.build(),
  };
}

export function readAndUpdateClinicalDetails(
  receivedBundle: unknown,
  medicationId: string,
  immunizationId: string,
  observationId: string,
  treatmentEnd: string,
  routeSystem: string,
  routeCode: string,
  referenceRangeText: string,
) {
  const editableBundle = new BundleReader(receivedBundle).toBundleEditor();

  const medication = editableBundle
    .openEntry(medicationId)
    .asMedicationStatement()
    .setEffectivePeriodEnd(treatmentEnd);

  const immunization = editableBundle
    .openEntry(immunizationId)
    .asImmunization()
    .setRoute(routeSystem, routeCode);

  const observation = editableBundle
    .openEntry(observationId)
    .asObservation()
    .setReferenceRangeText(referenceRangeText);

  return {
    treatmentEnd: medication.getEffectivePeriodEnd(),
    route: immunization.getRouteSystemAndCode(),
    referenceRangeText: observation.getReferenceRangeText(),
    updatedBundle: editableBundle.build(),
  };
}

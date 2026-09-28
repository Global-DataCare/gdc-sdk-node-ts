# Clinical Bundle Getters And Setters 101

Use `BundleReader` to inspect a Bundle returned by the GW. It is intentionally
read-only. To call resource-specific getters or setters, create a detached
editable clone and select the typed resource editor:

```ts
import { BundleReader } from 'gdc-sdk-node-ts';

export function updateAllergySeverity(
  receivedBundle: unknown,
  entryIndex: number,
  reactionSeverity: string,
) {
  const editableBundle = new BundleReader(receivedBundle).toBundleEditor();
  const allergy = editableBundle
    .openEntryByArrayIndex(entryIndex)
    .asAllergy();

  const previousSeverity = allergy.getReactionSeverity();
  allergy.setReactionSeverity(reactionSeverity);

  return {
    previousSeverity,
    updatedBundle: editableBundle.build(),
  };
}
```

This works with both FHIR-style `entry[]` and JSON-API-style `data[]` Bundles.
The input held by `BundleReader` is not mutated. If the resource has a stable
`resource.id` or `fullUrl`, prefer `openEntry(resourceIdOrFullUrl)`; otherwise
use the selected array index as above.

## Fields requested by portal integrations

```ts
const medication = editableBundle
  .openEntry(medicationStatementId)
  .asMedicationStatement()
  .setEffectivePeriodStart(treatmentStart)
  .setEffectivePeriodEnd(treatmentEnd);

const treatmentPeriod = {
  start: medication.getEffectivePeriodStart(),
  end: medication.getEffectivePeriodEnd(),
};

const immunization = editableBundle
  .openEntry(immunizationId)
  .asImmunization()
  .setRoute(routeSystem, routeCode)
  .setSite(siteSystem, siteCode);

const route = immunization.getRouteSystemAndCode();
const site = immunization.getSiteSystemAndCode();

const observation = editableBundle
  .openEntry(observationId)
  .asObservation()
  .setReferenceRangeText(referenceRangeText);

const storedReferenceRange = observation.getReferenceRangeText();
```

All values above come from application input or the received resource. The SDK
does not invent identifiers, subjects, authors, attesters, clinical codes or
dates.

## Coding fields

FHIR coding tokens use `system|code`. A typed coding field accepts a bare code,
one combined token, or separate values:

```ts
entry.setCode(codeValue);
entry.setCode(`${codeSystem}|${codeValue}`);
entry.setCode(codeSystem, codeValue);
entry.setCodeSystem(codeSystem);
entry.setSystemAndCode(codeSystem, codeValue);

entry.getCode();
entry.getCodeSystem();
entry.getSystemAndCode();
```

Field-specific coding follows the same naming rule, for example
`setRouteSystemAndCode(...)`, `getRouteCode()`, `getRouteCodeSystem()` and
`getRouteSystemAndCode()`.

## Supported typed resource editors

The Node SDK root exports the editor classes and `BundleEditor` exposes these
entry selectors:

| Resource | Selector | Main getters/setters |
|---|---|---|
| Vital sign | `asVitalSign()` | identity, subject, status, category, date, note, measurement |
| Observation | `asObservation()` | coding/value, components, method, encounter, performer, reference range |
| AllergyIntolerance | `asAllergy()` | coding, statuses, criticality, reaction severity/manifestation, onset, recorder |
| Condition | `asCondition()` | coding, category, statuses, severity, onset, recorder |
| MedicationStatement | `asMedicationStatement()` | medication, status, effective date/period, dosage, adherence |
| Immunization | `asImmunization()` | vaccine, date, status, route, site, target disease, dose/series, performer |
| Procedure | `asProcedure()` | coding, status, date, body site, reason, encounter, performer |
| DiagnosticReport | `asDiagnosticReport()` | coding/category, date, results, specimen, performer, presented form |
| DocumentReference | `asDocumentReference()` | type/category, author, date, content, hash, location |
| CarePlan | `asCarePlan()` | status, intent, category, date, activity and outcome |
| Flag | `asFlag()` | status, category, code, date/period, encounter |
| ClinicalImpression | `asClinicalImpression()` | status, effective date, assessor, summary, prognosis |
| Device | `asDevice()` | type, status, manufacturer/model, serial, patient/organization/location |
| DeviceUseStatement | `asDeviceUseStatement()` | device, status, timing, reason, source, recorded date |
| Encounter | `asEncounter()` | status, class/type, period, reason, participants, provider |
| Coverage | `asCoverage()` | status, type, beneficiary/subscriber, relationship, payor, period |
| Consent | `asConsent()` | decision, status, period, purposes, actors, roles, resource types, sections |
| RelatedPerson | `asRelatedPerson()` | subject, relationship, name, telecom, roles and linked identifiers |
| Employee | `asEmployee()` | identifier, email, role, works-for and member-of organization |

Every scalar typed `setX(...)` has its corresponding `getX()`. Two batch
helpers are intentionally read through their component fields:

- `setVitalSignType(...)` writes category, status, coding, display and unit;
- `setFhirApiClaimFields(...)` writes several normalized claim fields.

For the exact method inventory and shared editor contract, see
[the common-utils clinical getter/setter guide](https://github.com/Global-DataCare/gdc-common-utils-ts/blob/main/docs/101-CLINICAL-ENTRY-GETTERS-SETTERS.md).

These editors only build Bundle data. Authentication, authorization,
Communication packaging, signing, sending and persistence remain separate SDK
flow responsibilities.

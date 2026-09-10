# High-level subject and document writes

The previous examples in this file mixed enrollment, per-write authorship and
profile attestation. They have been superseded and intentionally removed so
they cannot be copied into an integration.

Use the current canonical guide:

- [Subject-section author and profile-attester contract](./101-CLINICAL_AUTHOR_ATTESTER_BOUNDARIES.md)
- [Complete type-checked snippets](./snippets/subject-section-writes.ts)

The canonical snippets contain:

- individual registration and Order confirmation;
- the activation code passed directly to technical profile enrollment;
- principal controller `RelatedPerson` returned automatically by Order confirmation;
- `PractitionerRole` read from the professional Employee creation receipt;
- profile-bound `attester` exposed after unlock;
- per-write `dataAuthorReference`;
- `updateSubjectSection()`;
- `BundleEditor` create, versioned update and versioned delete examples.

For complete imported documents, continue preserving the submitted
`Composition.author` and existing `Composition.attester` values. Importer,
sender, author, attester and subject remain separate identities.

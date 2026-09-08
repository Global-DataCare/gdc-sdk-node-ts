# 101 — Resolve the index provider, then match the Patient

This is the BFF-facing human identity flow. It keeps public provider discovery,
private patient matching and later authorization as separate operations.

## 1. Resolve only the provider

Start from a governed identifier already supplied to the BFF. The public ledger
lookup derives its opaque key and returns only:

```ts
{ indexProviderDid: 'did:web:…' }
```

The opaque hash stops at Fabric. Do not send it to the provider and do not treat
it as a Patient identifier, card or access grant. Resolve `indexProviderDid` and
select its advertised FHIR service endpoint as `fhirBaseUrl`.

The provider can use the submitted `Patient.identifier` to locate its private
schema.org identity and `sameAs` association. Its interoperable response projects
that association as governed `Patient.identifier`; `sameAs` is not a FHIR
Patient field.

## 2. Call the high-level Node SDK method

The BFF passes the already-open runtime client, the discovered provider and one
FHIR Patient containing the identifier to match:

```ts
const matches = await runtimeClient.matchPatientAtIndexProvider({
  fhirBaseUrl,
  indexProviderDid,
  requesterDid: authenticatedActorDid,
  patient: {
    resourceType: 'Patient',
    identifier: [{ system: identifierSystem, value: identifierValue }],
  },
  onlyCertainMatches: true,
});
```

`matches` is a FHIR `Bundle` with `type: 'searchset'`. The caller does not build
a GW route, DIDComm envelope, form body, signature or encrypted payload. The
runtime profile selected when the client was opened controls the wire format.

The type-checked copyable form is
[`snippets/pdqm-patient-match.ts`](./snippets/pdqm-patient-match.ts).

## 3. The same PDQm operation in every transport

The operation is IHE PDQm ITI-119 `POST [base]/Patient/$match`. One direct
operation always has one FHIR `Parameters` request body; it is not an array and
not a FHIR Bundle.

| Runtime profile | HTTP content type | Request representation |
|---|---|---|
| FHIR | `application/fhir+json` | the single `Parameters` resource |
| DIDComm plain | `application/didcomm-plain+json` | a DIDComm message whose `body.data[]` has exactly one entry containing that `Parameters` resource |
| strict | `application/x-www-form-urlencoded` | the same signed and encrypted DIDComm message in form field `request` |

The strict response uses form field `response`; after verification and
decryption it yields the same FHIR search `Bundle` returned by the FHIR and
DIDComm plain profiles. The form convention is JAR/JARM-inspired framing around
a DIDComm compact JWE. It is not a claim that the protected message is itself a
native OAuth JAR or JARM object.

Conceptually, the DIDComm plaintext body is:

```json
{
  "resourceType": "Bundle",
  "type": "batch",
  "total": 1,
  "data": [
    {
      "type": "Parameters",
      "resource": {
        "resourceType": "Parameters",
        "parameter": [
          { "name": "resource", "resource": { "resourceType": "Patient" } }
        ]
      },
      "request": { "method": "POST", "url": "Patient/$match" }
    }
  ]
}
```

When several independent operations truly need batching, the GW API container
uses `data[]` and a native FHIR batch uses `entry[]`; each operation still owns
one `Parameters` resource. A direct Patient match never sends an array of
`Parameters` resources.

The runtime-neutral builders and provider-only Fabric contract are documented
in the [SDK Core subject-provider guide](https://github.com/Global-DataCare/gdc-sdk-core-ts/blob/main/docs/101-SUBJECT_INDEX_PROVIDER_RESOLUTION.md).

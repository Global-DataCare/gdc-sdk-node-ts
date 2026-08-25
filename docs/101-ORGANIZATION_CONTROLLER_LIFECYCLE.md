# Organization Controller Lifecycle 101

> 101 note
> - Teach here: the highest-level `sdk-node` actor/profile/runtime surface for this topic.
> - Reuse lower-layer helpers from `sdk-core` and `common-utils` instead of re-teaching raw claims or low-level editors.
> - Read [101-README.md](./101-README.md) for the ordered path and keep actor role plus submit/poll explicit.


This is the canonical and reproducible guide for the **organization
controller** lifecycle in `gdc-sdk-node-ts`.

## Read this first: which credential authorizes what

The normal result contains three VCs. They are not three versions of the same
thing:

```text
signed organization PDF + controller public JWK
                    │
                    ▼
                  ICA
                    │
        ┌───────────┼────────────────────┐
        ▼           ▼                    ▼
Organization   LegalRepresentative   ServiceController
Credential     Credential            Credential
organization   legal capacity +      tenant authority RESPRSN
identity       ISCO occupation       + controller ISCO + JWK binding
```

For the current PDF without explicit occupation fields:

| VC | Meaning | `hasOccupation` | Authorizes tenant control? |
| --- | --- | --- | --- |
| `OrganizationCredential` | Identifies the organization | Not applicable | No |
| `LegalRepresentativeCredential` | Identifies its legal representative | `ISCO-08|1120` by default | No, not by itself |
| `ServiceControllerCredential` | Identifies an authorized tenant-service controller | `owner.additionalType = RESPRSN` plus `owner.hasOccupation.occupationalCategory = ISCO-08|1330` by default | Yes, when its JWK binding also matches |

`RESPRSN` and ISCO are therefore not alternatives and are not one CSV value.
`RESPRSN` is the authority checked by GW. ISCO is the actor's professional
occupation and may be used by a portal's own authorization policy.

### Exact legacy rule for a two-VC VP

GW does not automatically promote every legal representative to controller:

| VP contents | Result |
| --- | --- |
| Three VCs, with `owner.additionalType = RESPRSN` and matching `owner.hasCredential.material` in `ServiceControllerCredential` | Accepted canonical controller proof |
| Only organization + old representative VC, where that representative VC itself contains `RESPRSN` and matching `hasCredential.material` | Accepted compatibility fallback |
| Only organization + modern representative VC containing `ISCO-08|1120` | Rejected: no signed controller authority |
| Controller role sent only as unsigned request claim | Rejected as controller evidence |

The two-VC fallback exists only for credentials issued under the old combined
model. It does not convert `1120` into `RESPRSN`, and it is not used when
adding another controller to an existing tenant; that operation requires the
added actor's own `ServiceControllerCredential`.

### Where to execute the flows in Swagger

- Canonical first registration: GW Swagger `Organization/_transaction`, then
  poll `Organization/_transaction-response`, then confirm its Offer through
  `Order/_batch`.
- Existing organization or controller reissuance: GW Swagger
  `Organization/_issue`, then poll `Organization/_issue-response`.
- Legacy proof-first registration only: obtain ICA credentials through ICA
  Swagger `_verify` / `_verify-response`, build and sign the VP, then submit it
  to GW Swagger `Organization/_activate`.

In the canonical and reissue responses, inspect `body.data[0].vc[]`: it should
contain the organization, representative and controller VCs. The activation
code, if issued, is separately in
`body.data[0].resource.meta.claims`; it is not a VC.

Use this guide when you need to prove one narrow contract end to end:

1. onboard a legal organization,
2. optionally materialize additional purchased seats,
3. obtain activation material for a controller License through the current
   `Organization/_issue` compatibility route,
4. exchange that activation material and register the controller device,
5. confirm that purchased seats remain intact,
6. disable the tenant,
7. purge the tenant.

This guide is intentionally **not** about:

- employee creation,
- professional SMART access,
- dialogue/consent,
- clinical ingestion.

Those flows have their own tests and docs. This document stays focused on the
controller lifecycle only.

## What proves this contract

The authoritative executable contract for recovering the **same existing
controller** is:

- [../tests/101-organization-controller-lifecycle.test.mjs](../tests/101-organization-controller-lifecycle.test.mjs)

That test proves both onboarding variants, followed by device recovery for the
controller that already owns a License seat:

1. canonical host flow:
   - `Organization/_transaction`
   - `Order/_batch`
2. legacy compatibility flow:
   - `ICA _verify`
   - `Organization/_activate`

And in both variants it then proves:

3. `Organization/_issue` revalidates the organization/controller evidence,
   returns every ICA credential in `vc[]`, and exposes the controller License
   activation code separately in `resource.meta.claims`,
4. `Token/_exchange` exchanges that activation code for an initial access
   token,
5. `Device/_dcr` registers the controller device keys,
6. `disableTenant`,
7. `purgeTenant`.

## What `Organization/_issue` actually returns

The route name is easy to misread. `Organization/_issue` is the existing-tenant
organization-credential reissuance/reverification operation. It is not
`License/_issue`, does **not** register or rebind a device, and does not turn
the activation code into a VC.

The current GW contract works as follows:

1. The request is sent to `Organization/_issue` because it carries the signed
   organization contract and controller identity material that GW forwards to
   ICA for verification.
2. The polled response contains every credential extracted from the ICA
   response in `body.data[0].vc[]`. The unmodified ICA payload remains available
   in `body.data[0].resource.icaResponse`.
3. Independently from those VCs, GW exposes the opaque controller License
   activation code in
   `body.data[0].resource.meta.claims['org.schema.IndividualProduct.serialNumber']`.
4. The BFF sends that value to `Token/_exchange` and receives an initial access
   token.
5. The BFF uses the initial access token and the same activation code in
   `Device/_dcr`; DCR is the operation that registers the device signing and
   encryption keys.

The response does not update a portal database. A consuming BFF must upsert
the three `vc[]` values independently:

| Credential | BFF projection | GW projection |
| --- | --- | --- |
| `OrganizationCredential` | Organization record keyed by the signed organization identifier/taxID | Returned in `vc[]`; it does not replace tenant-controller state |
| `LegalRepresentativeCredential` | Organization-to-representative relationship | Returned in `vc[]`; `ISCO-08|1120` alone never grants tenant control |
| `ServiceControllerCredential` | Organization-to-controller relationship and controller JWK thumbprint | Validated and persisted as a controller employee; its DID is appended to the tenant DID controller array |

This split is mandatory even if an older portal historically used the legal
representative as its controller. Re-registering the original PDF corrects
that portal only after its BFF consumes all three typed credentials; GW cannot
mutate an external portal database.

The canonical `_issue-response` entry is therefore an organization
credential-reissuance result with three distinct projections:

```text
body.data[0]
├── vc[]                         all deduplicated ICA-issued VCs
├── resource
│   ├── meta.claims
│   │   └── IndividualProduct.serialNumber   License activation code
│   └── icaResponse              transitional raw ICA envelope
└── response                     per-entry processing status
```

`resource.icaResponse` is not a fourth business result. It is the transitional
raw upstream envelope returned by ICA and retained by GW for audit/debug and
backward compatibility. Because ICA entries may themselves contain both
`resource` and per-entry `response`, applications should not traverse that raw
tree. Use the normalized sibling `vc[]` for credentials,
`resource.meta.claims` for flat claims, and the outer entry `response` only for
processing status. The raw envelope can be deprecated later without changing
those normalized surfaces.

The same resource-scoped rule applies to requests: flattened GW application
claims are sent in `body.data[].resource.meta.claims`, never in entry-level
`meta.claims`. ICA-issued W3C VC claims stay in each VC's
`credentialSubject`; they are not converted into GW flat claims. Readers may
accept entry-level `meta.claims` only for deprecated payloads.

Do not describe `vc[]` as a License response and do not describe the activation
code as a VC. A typed `License:Issued` entry belongs to the separate
`License/_issue` contract. The SDK activation-code reader temporarily accepts
that shape only as a legacy compatibility fallback; it is not the canonical
`Organization/_issue` response.

`OperationOutcome.issue[]` is a fourth, unrelated concept: it is the standard
diagnostic array for errors/warnings and has no relationship to either `_issue`
operation name.

## What the lifecycle test protects

The test checks more than the presence of a value in the `_issue` response.
It protects these lifecycle rules:

- when recovering or enrolling another device for an existing controller,
  `Organization/_issue` must return activation material for that controller's
  already-assigned License seat, not consume a random available seat;
- `Organization/_issue` must **not** delete or consume seats purchased after
  the original organization registration;
- the actual device enrollment sequence
  `_issue -> Token/_exchange -> Device/_dcr` must complete before tenant
  disable/purge.

That is why the test explicitly asserts:

- the activation code in the `_issue` response claims identifies the existing
  controller seat and is then used by `Token/_exchange`;
- post-`_issue` license inventory equals the expanded inventory from after the
  extra order;
- teardown happens only after `_issue -> Token/_exchange -> Device/_dcr`.

This test does **not** prove the complete second-controller flow. In particular,
it does not prove that a different controller email consumes one available
employee License, nor the failure path when no seat is available.

## How to run the reproducible test

From the repo root:

```bash
cd gdc-sdk-node-ts
npm run build
node --test tests/101-organization-controller-lifecycle.test.mjs
```

Expected result:

- both subtests pass:
  - new `Organization/_transaction` lifecycle
  - legacy `Organization/_activate` lifecycle

## Which SDK surface is used

The test does not use private helpers. It stays on public runtime helpers and
facades:

- `OrganizationControllerSdk.submitLegalOrganizationVerificationTransaction(...)`
- `HostOnboardingSdk.activateOrganizationInGatewayFromIcaProof(...)`
- `OrganizationControllerSdk.confirmOrganizationLicenseOrder(...)`
- `OrganizationControllerSdk.submitLegalOrganizationCredentialReissuance(...)`
- `OrganizationControllerSdk.disableTenant(...)`
- `OrganizationControllerSdk.purgeTenant(...)`

If you are building a BFF, these are the methods to copy conceptually.

### Host route, tenant keys

`confirmOrganizationLicenseOrder(...)` is intentionally a high-level method:
the application supplies the tenant route context, the accepted Offer and the
exact controller DID registered through DCR. The SDK handles the lower-level
transport contract.

- `Order/_batch` is routed through `/host/...` because the host verifies and
  persists the commercial confirmation.
- Routing does not change key custody. The JWS `kid` and, for encrypted
  DIDComm, the JWE `skid` identify the controller keys already registered in
  the tenant DCR vault.
- The DIDComm payload therefore keeps the controller DID in `iss` and the
  tenant id in `aud`. GW derives the tenant key vault from that authenticated
  issuer; it must not search for the controller in the host vault.
- A public JWK may be present where a transport profile requires it, but DCR is
  the authoritative registration. Application code must not copy keys into
  `meta.jws` or manually assemble DIDComm envelopes.

This rule is identical for plaintext and encrypted DIDComm. Encryption changes
the envelope produced by the configured SDK transport, not the tenant that owns
the controller keys.

Technical-slice note:

- `recoverOrganizationControllerWithCredentialReissuanceWithDeps(...)` is still useful inside
  low-level runtime tests because it composes `_issue -> _exchange -> _dcr`
  deterministically.
- Do not teach it as the first public integration surface; app/BFF docs should
  start from `OrganizationControllerSdk` and `HostOnboardingSdk`.

## Minimal sequence for a BFF

For interactive employee creation, pass the `licenseOrder` continuation to
`provisionOrganizationEmployee(...)`. `Employee/_batch` create is itself the
licensed operation; the SDK does not inject private control claims. If GW returns
`Employee-license-offer-v1.0`, it confirms that Offer through `Order/_batch`,
retries employee creation and only then invokes `License/_issue`. A future
governed bulk importer must use a distinct, explicit operation contract.
The result exposes both the opaque `activationCode` and the effective optional
`maxDevices` returned by that reserved seat; portals must prefer that explicit
allowance over their backwards-compatible local default.

### A. Canonical onboarding path

1. `submitLegalOrganizationVerificationTransaction(...)`
2. `confirmOrganizationLicenseOrder(...)`
3. optionally confirm extra post-registration seat orders
4. `submitLegalOrganizationCredentialReissuance(...)` submits and polls
   `Organization/_issue`, then reads `vc[]`, `resource.icaResponse` and
   `resource.meta.claims` as separate response fields
5. take `resource.meta.claims['org.schema.IndividualProduct.serialNumber']` as the opaque
   activation code and call `Token/_exchange`
6. call `Device/_dcr` with the initial access token, activation code and public
   device keys
7. `disableTenant(...)`
8. `purgeTenant(...)`

## Add a second controller without rotating the first

This is an additive controller operation. Use these names consistently:

- `firstController`: an active controller already present in the organization
  DID document. Its private signing key authorizes the change.
- `secondController`: the additional controller. Its public actor JWK is added
  without removing `firstController`.

After a fully authorized operation, the target invariant is:

```ts
organizationDidDocument.controller = [
  firstController.did,
  secondController.did,
]
```

### Controller-change matrix

Key rotation, person replacement and controller addition are different
operations. They must not be inferred only from the submitted email or JWK.

| Operation | Required evidence and authorization | License rule |
| --- | --- | --- |
| Rotate a legal representative's portal-wallet key | Reissue the representative evidence through the portal/ICA flow. This is not a tenant-controller rotation unless that same actor also owns a `ServiceControllerCredential`. | No controller License rule applies unless the actor is independently a controller. |
| Rotate the technical controller's actor key | The same PDF may be reused when it identifies that same controller email. The request is signed with a currently authorized key. | Reuse that controller's existing License. |
| Replace the legal representative with another person | A new PDF identifies the replacement. The change explicitly names the controller being replaced and the replacement controller. | Transfer the replaced controller's License explicitly; a different email does not match it automatically today. |
| Replace the technical controller with another person | A new PDF identifies the replacement, or a valid organization-controller delegation authorizes it. | Transfer the replaced controller's License explicitly. |
| Add another controller while preserving existing controllers | The current controller authorizes the addition and ICA issues a credential for the added controller. | Consume one available employee License unless that controller already owns a reusable License. |
| Add another controller with no reusable or available License | The identity evidence may be valid, but there is no seat for device activation. | Fail without changing the organization DID or controller records. |

One PDF may therefore be reused as evidence for separate key rotations of the
legal representative and technical controller when both emails are present.
The current request has one singular `resource.controller`, so each targeted
actor change is a separate `_issue` operation unless a future contract adds an
explicit array of controller changes.

### ICA credential: `ServiceControllerCredential`

ICA issues a `ServiceControllerCredential` in addition to the
organization and legal-representative credentials. This separates two claims:

- `LegalRepresentativeCredential`: the person is a legal representative of
  the organization;
- `ServiceControllerCredential`: the person controls the organization's
  tenant service.

In the simplest registration bundle this is the third credential. Each
verified controller receives an independently status-addressable
`ServiceControllerCredential`; ICA does not combine several email hashes
or JWK bindings in one credential. Because the current request carries one
singular `resource.controller`, one verification response emits at most one
new controller credential.

Readers still accept the former type name `OrganizationControllerCredential`
and its `hasOccupation.identifier` coding as read-only migration input. ICA
must not emit that legacy shape for new credentials.

The tenant is modeled as a service, so this credential follows the same basic
shape as `HostingServiceCredential`, but its subject is the tenant service and
its `owner` is the authorized controller:

```json
{
  "type": [
    "VerifiableCredential",
    "ServiceCredential",
    "ServiceControllerCredential"
  ],
  "credentialSubject": {
    "id": "<tenantServiceDid>",
    "@type": "Service",
    "provider": {
      "@type": "Organization",
      "identifier": {
        "value": "<organizationIdentifier>",
        "additionalType": "TAX"
      }
    },
    "owner": {
      "@type": "Person",
      "additionalType": "RESPRSN",
      "sameAs": "urn:multibase:<Base58(hashedEmail)>",
      "hasOccupation": {
        "@type": "Occupation",
        "occupationalCategory": "ISCO-08|1330"
      },
      "hasCredential": {
        "material": "urn:ietf:params:oauth:jwk-thumbprint:sha-256:<thumbprint>"
      }
    }
  },
  "credentialStatus": {
    "id": "<credentialStatusId>",
    "type": "SimpleCredentialStatus2026"
  }
}
```

No custom role property is introduced. Schema.org `additionalType` carries the
bare HL7-derived `RESPRSN` authority on the controller owner, while
`Occupation.occupationalCategory` carries the independent ISCO token. Neither
object signs a display `name` or `roleName`.

ICA signs this VC. A controller never signs or modifies an ICA-issued VC. To
act as controller, that person signs a VP with the private actor key bound by
`owner.hasCredential.material`; the VP contains the organization VC and that
person's own `ServiceControllerCredential`.

`RESPRSN` and `ISCO-08|1330` are deliberately independent. The first grants
controller authority over the tenant; the second describes the controller's
professional occupation. When the signed PDF does not expose explicit
occupation fields, ICA defaults the legal representative to `ISCO-08|1120`
and the technical controller to `ISCO-08|1330`. An explicit signed form field
may replace either default with another validated four-digit ISCO-08 code.
The optional PDF AcroForm names are
`person.hasOccupation.occupationalCategory` and
`organization.contactPoint.hasOccupation.occupationalCategory`; neither is
required for the current defaulted test case.

If the legal representative and controller use the same email, ICA still
issues two credentials with different semantics. Their person identity may
share the same `sameAs` and actor-key binding:

- one `LegalRepresentativeCredential` for legal representation;
- one `ServiceControllerCredential` for control of the tenant service.

If the emails differ, the legal representative VC remains bound only to the
legal representative, while the controller credential is bound to the
technical controller's email hash and actor JWK. The technical controller must
not present the legal representative's VC as its own.

For a controller explicitly named in the signed PDF, that PDF is the issuance
evidence. For a controller appointed later without appearing in the PDF, the
existing controller's signed authorization becomes delegation evidence for
the new `ServiceControllerCredential`; it must not cause ICA to fabricate
a new `LegalRepresentativeCredential`.

ICA now emits `ServiceControllerCredential` when `_verify` has both a
controller identity in the signed `organization.contactPoint.email` field and
a public actor JWK. When the representative and controller are the same actor,
the signed representative identity may supply that identity instead. A
different request-only `controller.sameAs` is not issuance evidence.
`gdc-common-utils-ts` and
`ica-client-sdk-ts` can read it without confusing it with the legal
representative VC. GW does not yet validate this credential as an alternative
controller proof, and the complete License/DCR/VP flow for an arbitrary second
controller remains unfinished in strict mode.

### Synthetic Antifraud test evidence

The contract tests do not require two real legal representatives. Use a
synthetic Antifraud organization-registration PDF form with placeholder
identities and deterministic test keys. The fixture set must cover:

1. one PDF in which legal representative and technical controller use the same
   email, producing two credentials with distinct semantics;
2. one PDF in which they use different emails, producing one
   `LegalRepresentativeCredential` and one independently bound
   `ServiceControllerCredential`;
3. reuse of that PDF to rotate only the legal representative actor key;
4. reuse of that PDF to rotate only the technical controller actor key;
5. a newer PDF replacing the legal representative and explicitly transferring
   the predecessor's License;
6. a newer PDF replacing the technical controller and explicitly transferring
   the predecessor's License;
7. addition of another controller consuming exactly one available License;
8. rejection of an addition with no reusable or available License, with no
   organization DID or controller-record mutation;
9. a VP signed by each controller and accepted only when it contains that
   controller's own `ServiceControllerCredential`.

Each fixture must use placeholders rather than real names or email addresses.
The different-email fixture must make the evidence unambiguous by carrying at
least:

- the organization legal identifier and legal name;
- the document version/date;
- one legal-representative row with its placeholder email;
- one technical-controller row with a different placeholder email; ICA assigns
  controller authority `RESPRSN` and default occupation `ISCO-08|1330` when
  explicit signed occupation fields are absent;
- the organization sector;
- the selected service capabilities, such as index provider or digital-twin
  reader/provider, separately from the controller role;
- a valid test signature over the completed form.

The portal request supplies each actor public JWK. The PDF proves the actor's
designation; it must not contain private keys. The ICA test must reject a
request-only second email or JWK when the signed form does not designate that
actor.

### License and DCR apply only after authorization

The initial controller is exceptional because onboarding assigns that
controller its own License seat. A later `_issue` for the same email and
`RESPRSN` role can reuse that assigned seat, even when the available pool is
empty.

A second controller has a different email and therefore cannot reuse the first
controller's License. Under the current GW implementation:

1. `_issue` looks for a non-expired employee License already assigned to the
   second controller's email and `RESPRSN` role.
2. If none exists, it reserves one available employee License from the tenant
   pool and returns its new activation code.
3. If neither an assigned nor an available License exists, `_issue` fails with
   a conflict and the second controller binding is not persisted.
4. Only after the controller credential prerequisite above is satisfied may
   the second controller consume the activation code through
   `Token/_exchange -> Device/_dcr`, like an invited employee.

DCR only registers device keys and consumes a License. It does not issue a
legal-representative/controller VC and cannot repair missing legal evidence.

### License ordering and payment are separate from controller authority

`RESPRSN` authorizes tenant administration, including requesting additional
professional License seats. It does not state who may operate a portal's
corporate payment wallet. A portal may use the signed ISCO occupation in its
own policy (for example, separating an ICT manager's license request from a
finance manager's payment approval), but GW must not infer those portal
permissions from `RESPRSN` or hard-code an ISCO-to-payment mapping.

For a priced offer, GW accepts payment confirmation only when the Stripe
Checkout Session or Invoice matches the exact tenant, offer, quantity, total
amount and currency expected by the order. In Test Network, a zero-priced
offer does not call Stripe; that validates the License/order lifecycle but is
not a Stripe payment test.

Current second-controller test coverage is incomplete. ICA unit tests now prove separate
representative/controller VCs for both same-email and different-email forms,
plus omission of an unbound controller VC when the public JWK is absent.
Common-utils and ICA client SDK tests prove extraction without representative
fallback. GW tests prove strict `RESPRSN`, actor-alias and JWK-thumbprint
validation before additive controller persistence. The local ICA + GW + Node
SDK lifecycle E2E proves that initial verification returns the third
`ServiceControllerCredential` and that the controller signs a VP carrying
all three credentials. Separate GW tests also prove reuse of the same
controller License without available seats. There is not yet one integrated
test proving all three of these different-email second-controller cases:

- a different controller consumes exactly one available employee License;
- no available License causes failure without changing the organization DID;
- the returned activation code completes DCR for the second controller.

The signed different-email PDF fixture is still required to prove issuance of
the second controller's own `ServiceControllerCredential` and a VP signed
by that second controller. The current E2E must not manufacture this evidence
from an unsigned request field.

Do not call `Organization/_transaction` again. That endpoint is for initial
organization registration. The following shows the current `_issue` wire
shape, but it is **not** a production recipe for an arbitrary delegated
controller until the credential prerequisite above is implemented:

```ts
import {
  buildProfessionalDidWeb,
  normalizeSameAsHash,
} from 'gdc-common-utils-ts'

// urn:multibase:<Base58(SHA3-256(normalizedEmail))>
const secondControllerEmailHashUrn = normalizeSameAsHash(
  authenticatedSecondControllerEmail,
)
const secondControllerDid = buildProfessionalDidWeb({
  organizationDidWeb,
  email: authenticatedSecondControllerEmail,
  role: 'RESPRSN',
})
const controllerLicenseIssue =
  await organizationControllerSdk.submitLegalOrganizationCredentialReissuance(
    {
      jurisdiction: hostCoverageScope,
      hostNetwork,
    },
    {
      claims: organizationClaims,
      controller: {
        did: secondControllerDid,
        sameAs: secondControllerEmailHashUrn,
        publicKeyJwk: secondController.publicActorJwk,
      },
      verification: { resourceType: 'contract' },
      attachments: [signedContractPdf],
    },
  )
```

The SDK method returns a `SubmitAndPollResult`, so the terminal HTTP payload is
`controllerLicenseIssue.poll.body`; do not pretend the method returns the
decoded Bundle directly. Read the ICA credentials through the shared recursive
reader so DIDComm/job response wrappers do not become application assumptions:

```ts
import {
  readServiceControllerCredentialsFromResponseBody,
} from 'gdc-common-utils-ts'

const controllerCredentials =
  readServiceControllerCredentialsFromResponseBody(
    controllerLicenseIssue.poll.body,
  )
```

Before consuming the activation code from `resource.meta.claims`, the BFF must require
one of those `ServiceControllerCredential` values to be bound to
`secondController` as described above. It must not let `secondController`
present `firstController`'s `LegalRepresentativeCredential` or
`ServiceControllerCredential`.

Here, `controller.sameAs` is the URN-wrapped Base58 email hash. It is not
another DID and is not derived from the organization or portal domain:

```text
urn:multibase:<multibase58-multihash-of-normalized-contact>
```

For an email actor, `normalizeSameAsHash(...)` trims and lower-cases the email,
hashes it with SHA3-256, encodes the multihash as Base58 and adds the
`urn:multibase:` prefix. In other words, the value passed as `sameAs` is
`<Base58(hashedEmail)>` wrapped as a multibase URN. The email domain
participates only because it is part of the email itself; no organization DID,
tenant identifier or portal domain is added. The clear email and the role are
not present in the resulting URN.

The signed controller authority is stored as the bare HL7-derived code
`RESPRSN` in `credentialSubject.owner.additionalType`; the same code is also
used as the role component of the employee DID. It is not sent as an unsigned
flat request claim. The independently indexed professional occupation may be
`ISCO-08|1330` or another signed PDF value. Do not substitute an ISCO code,
`professional`, or a reverse-DNS coding-system prefix for `RESPRSN`.

Use the same authenticated email in every portal to obtain the same URN. The
organization-specific employee `did:web` is built separately from the
organization DID, the same email hash and `RESPRSN`.

The BFF must construct and submit that request with two deliberately separate
key roles:

1. The DIDComm/JWS protected `kid` identifies a signing key belonging to
   `firstController`. In strict mode, the BFF signs with the corresponding
   private key.
2. `resource.controller.publicKeyJwk` is the public actor key belonging to
   `secondController`. It must never contain private JWK members.

The protected signer key and the submitted actor key therefore are not the
same key. Treat a request accepted in demo/plaintext mode only as integration
testing; it is not proof that production authorization has been validated.

The public actor JWK `kid` is canonicalized from the public key material as an
RFC 9278 thumbprint URN:

```text
urn:ietf:params:oauth:jwk-thumbprint:sha-256:<base64url-thumbprint>
```

The GW then performs these writes:

- appends `secondController.did` to the organization DID `controller` array;
- preserves `firstController.did`;
- stores `secondController` independently as an Employee/Person DID document
  in the tenant confidential storage;
- creates separate indexed attributes for the Person identifier, stable actor
  identifier and each `hasCredential.material` value;
- does not create `meta.controllerDidDocuments` and removes the deprecated
  singular `meta.controllerDidDocument` cache on the next write.

The controller-binding part of `Organization/_issue` carries only the actor
public JWK. Device enrollment is the following, separate SDK call: it performs
`Token/_exchange` and `Device/_dcr` for that controller's device signing and
encryption keys. DCR does not add an organization controller and must not
replace the actor key submitted above.

### Contract evidence and `legalRepresentativePayload`

The signed PDF remains the evidence forwarded for ICA verification. An
explicit controller designation in the authenticated PDF form may support
issuance of `ServiceControllerCredential`; an untyped technical-contact
field by itself must not be treated as a controller grant.

`legalRepresentativePayload` is deprecated. Do not send it in the canonical
signed-PDF or strict flow. It remains accepted temporarily only for legacy
demo/OTP clients and will be removed in a future breaking release.

Reusing the same PDF does not make this a second organization registration. It
may support key rotation for any controller explicitly designated in that PDF.
The verified signature of `firstController` authorizes the change request; if
the PDF does not name `secondController`, that signed request is delegation
evidence for a new `ServiceControllerCredential`, not evidence for a new
`LegalRepresentativeCredential`. If the deployment rejects the evidence or
enforces newer-contract freshness for `_issue`, the BFF must surface that
rejection rather than silently retrying `_transaction`.

The reverse portal situation still uses the same credential rules, but the BFF
must declare whether the operation is addition, key rotation or person
replacement. It must not infer replacement merely because another email was
submitted.

### B. Legacy compatibility path

1. `activateOrganizationInGatewayFromIcaProof(...)`
2. `confirmLegalOrganizationOrder(...)` or `confirmOrganizationLicenseOrder(...)`
   depending on the integration surface in use
3. optionally confirm extra post-registration seat orders
4. `submitLegalOrganizationCredentialReissuance(...)` and inspect the returned
   ICA credentials in `vc[]`
5. read the activation code separately from
   `resource.meta.claims['org.schema.IndividualProduct.serialNumber']` and use it in
   `Token/_exchange`
6. use the resulting initial access token, activation code and device public
   keys in `Device/_dcr`
7. `disableTenant(...)`
8. `purgeTenant(...)`

## When to use the live runner

If you want a real GW/ICA environment instead of the deterministic runtime
contract test, use the dedicated live controller runner:

```bash
cd gdc-sdk-node-ts
npm run test:e2e:live-controller-lifecycle
```

That live runner:

- starts local ICA and GW CORE,
- sends `TEST-A4-Antifraud.pdf` by default,
- runs `Organization/_transaction`,
- confirms the returned legal-organization order,
- rebuilds one controller proof `vp_token` from the ICA-issued credentials
  using the deterministic test signer,
- provisions the initial controller's self-invited employee License from
  `Organization.numberOfEmployees`,
- calls `Organization/_issue` for that same accredited controller and verifies
  that its existing actor-bound License can be reissued,
- consumes the activation code through
  `Token/_exchange -> Device/_dcr` to bind another controller device,
- uses that VP as `Authorization: Bearer <vp_token>` for tenant
  `disableTenant(...)` and `purgeTenant(...)`,
- cleans up the host registry afterwards.

Use the live runner when you need to validate:

- real GW routing,
- real ICA `Organization/_transaction`,
- real current-controller `Organization/_issue -> Token/_exchange -> Device/_dcr`,
- real controller proof bearer validation on tenant lifecycle,
- real host and tenant cleanup ordering.

The default PDF proves only the current-controller lifecycle. It does not prove
addition of a different technical controller. Set
`LIVE_GW_HOST_VERIFICATION_PDF_PATH` to the synthetic different-email fixture
described above once it exists; that second-controller run must also use the
second actor's own ICA-issued `ServiceControllerCredential` and an
available employee License.

Shared credential readers now used by the live runner:

- `readLegalOrganizationVerificationCredentialPairFromResponseBody(...)`
- `readLegalOrganizationVerificationTaxIdFromResponseBody(...)`
- `readLegalRepresentativeSameAsFromResponseBody(...)`
- `readLegalRepresentativeBindingFromResponseBody(...)`

If ICA and GW are already running, use the direct entry point instead:

```bash
cd gdc-sdk-node-ts
LIVE_GW_HOST_VERIFICATION_PDF_PATH=/path/to/signed-contract.pdf \
BASE_URL=http://127.0.0.1:3000 \
RUN_LIVE_101_ORGANIZATION_CONTROLLER_LIFECYCLE_E2E=1 \
npm run test:e2e:live-controller-lifecycle:direct
```

Do **not** use the live runner as the only contract proof. The deterministic
test remains the baseline because it is reproducible on any machine.

## Relationship to other docs

- For the broader backend/BFF tutorial:
  - [101-SDK_END_TO_END.md](./101-SDK_END_TO_END.md)
- For lower-level integration API notes:
  - [101-SDK_INTEGRATION.md](./101-SDK_INTEGRATION.md)
- For the lower-level recovery helper contract:
  - [../src/organization-controller-recovery.ts](../src/organization-controller-recovery.ts)

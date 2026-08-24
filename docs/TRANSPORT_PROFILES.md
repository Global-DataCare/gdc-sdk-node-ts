# Transport Profile Boundary

Node channel facades keep canonical claims, clinical format and transport
separate. The outbox stores `CommMsgExtended.body.data[].resource.meta.claims`.
DIDComm plain is demo-only.
Protected HTTP uses `request=<JWE>` and `response=<JWE>`. The JWE is protected
DIDComm transport; JAR/JARM are OAuth/FAPI authorization artifacts and are not
names for every clinical message.

Applications create one public outbox and submit it through their actor facade:

```ts
const communicationJob =
  createCommunicationOutboxJobFromCommMsgExtendedDraft(communicationDraft);
await profile.sdk.ingestCommunicationAndUpdateIndex(ctx, {
  communicationJob,
  clinicalFormat: 'r4',
});
```

`clinicalFormat: 'api'` sends the claims-first `data[]` representation.
`clinicalFormat: 'r4'` projects the same claims to a FHIR batch. Product SDKs
may inject other formats without adding them to generic GDC packages.

`application/fhir+json` sends that rendered body directly. A DIDComm envelope
is created only for `application/didcomm-plain+json` or before packing the JWE
for `application/x-www-form-urlencoded`.

`NodeHttpClient.transportProfile` selects the wire representation. The secure
profile additionally requires `secureTransportAdapter.pack/unpack`; absence of
that wallet-backed adapter is a hard error and never falls back to plaintext.

The selection belongs to the `NodeHttpClient` instance and governs every
submit and asynchronous poll performed by its actor facades. Operation inputs
cannot switch profiles. A repeated matching profile is accepted temporarily
for source compatibility; a conflicting profile fails before network I/O.
Demo runtimes may construct a plaintext client and FHIR compatibility runtimes
may construct a FHIR JSON client. Protected staging and production runtimes
construct the encrypted-form client once and therefore cannot emit plaintext
from inventory, lifecycle, Offer, Order or clinical operations.

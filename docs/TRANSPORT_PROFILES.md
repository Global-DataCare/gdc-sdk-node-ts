# Transport Profile Boundary

Node channel facades keep canonical payload and transport separate. FHIR
Communication bundles use `Bundle.id` as thread id. DIDComm plain is demo-only.
Protected HTTP uses `request=<JWE>` and `response=<JWE>`. The JWE is protected
DIDComm transport; JAR/JARM are OAuth/FAPI authorization artifacts and are not
names for every clinical message.

Applications create one public outbox and submit it through their actor facade:

```ts
const job = createOutboxJobFromDraft(draft);
await profile.sdk.ingestCommunicationAndUpdateIndex(ctx, {
  communicationJob: job,
  pathFormatSegment: 'r4',
});
```

`NodeHttpClient.transportProfile` selects the wire representation. The secure
profile additionally requires `secureTransportAdapter.pack/unpack`; absence of
that wallet-backed adapter is a hard error and never falls back to plaintext.

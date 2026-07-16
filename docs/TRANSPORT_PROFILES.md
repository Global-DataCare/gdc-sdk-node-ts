# Transport Profile Boundary

Node channel facades keep canonical payload and transport separate. FHIR Communication bundles use `Bundle.id` as thread id. DIDComm plain is demo-only. Protected HTTP uses `request=<JWE>` and `response=<JWE>`; the JWE is DIDComm encrypted and FAPI JAR/JARM-bound for every human-health operation.

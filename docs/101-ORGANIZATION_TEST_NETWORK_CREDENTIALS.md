# 101: sign and submit Test Network organization credentials

## Teaching goal

Keep the human reviewer's governance key in a Node/BFF wallet while allowing
the applicant controller to submit a public, Test Network-only package through
the normal host API. This profile does not call ICA and must never be accepted
on `network`.

## Sign after human unlock

Build the normal Organization, LegalRepresentative and ServiceController
credential drafts with `buildTestNetworkOrganizationCredentialSet(...)`.
Each includes `TestNetworkCredential` in its signed `type[]`, the PDF digest
and its own domain bindings. Do not add `targetNetwork` to a schema.org
credential subject: the credential type is the environment discriminator.

```ts
const credentials = await Promise.all(drafts.map(credential =>
  signTestNetworkOrganizationCredential({
    credential,
    wallet: unlockedProfessionalWallet,
    context: professionalContext,
    key: { ownerScope: 'profile', purpose: 'actor-signing', alg: 'ML-DSA-65' },
    verificationMethod: `${employeeDid}#${governanceKeyId}`,
  })))

const admissionCredential = await signOrganizationTestNetworkCredential({
  credential: unsignedAdmissionCredential,
  wallet: unlockedProfessionalWallet,
  context: professionalContext,
  key: { ownerScope: 'profile', purpose: 'actor-signing', alg: 'ML-DSA-65' },
  verificationMethod: `${employeeDid}#${governanceKeyId}`,
})
```

The domain proofs use `assertionMethod`; the admission proof uses
`contractAgreement`. Neither helper exports private key or seed material.

## Applicant submission

```ts
const result = await organizationController.submitLegalOrganizationVerificationTransaction(
  {
    jurisdiction: hostCoverageScope, // for example EU, not the applicant's country
    hostNetwork: 'test-network',
    controllerDid,
    hostDid,
  },
  {
    claims: organizationClaims,
    controller: { email: controllerEmail, did: controllerDid, publicKeyJwk: controllerPublicJwk },
    organization: { did: requestedOrganizationDid },
    legalRepresentativePayload: { email: legalRepresentativeEmail },
    verification: { resourceType: 'contract' },
    organizationTestNetworkCredential: admissionCredential,
    testNetworkCredentials: credentials,
  },
)
```

GW validates the admission VC and all three domain proofs, returns only the
three domain VCs in `vc[]`, and creates the Offer. `Order/_batch`, redemption
of the same postal code and DCR remain mandatory.

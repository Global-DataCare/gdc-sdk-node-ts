# 101: sign and submit an organization authorization VC

## Teaching goal

Keep the human governance key in a Node/BFF wallet while allowing the applicant
controller to submit the resulting public VC through the normal host API.

## Sign after human unlock

```ts
const credential = await signOrganizationRegistrationAuthorizationCredential({
  credential: unsignedCredential,
  wallet: unlockedProfessionalWallet,
  context: professionalContext,
  key: { ownerScope: 'profile', purpose: 'actor-signing', alg: 'ML-DSA-65' },
  verificationMethod: `${employeeDid}#${governanceKeyId}`,
})
```

The helper adds a detached `JsonWebSignature2020` proof with
`proofPurpose=contractAgreement`. It never exports the private key or wallet
seed to the browser.

## Applicant submission

```ts
const result = await organizationController.submitLegalOrganizationVerificationTransaction(
  hostContext,
  {
    claims: organizationClaims,
    controller: { did: controllerDid, publicKeyJwk: controllerPublicJwk },
    organization: { did: requestedOrganizationDid },
    legalRepresentativePayload: { email: controllerEmail },
    verification: { resourceType: 'test-network' },
    authorizationCredential: credential,
  },
)
```

GW, not the SDK, decides whether the configured issuer, current signer
relationship, proof and bindings are acceptable. A successful transaction
returns an Offer; `Order/_batch`, redemption of the same postal code and DCR
remain mandatory.

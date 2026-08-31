# 101: authorized subject directory

Use this flow when a portal or assistant must list subjects already associated
with the authenticated account. It is discovery only: it does not register an
organization, create a user wallet or perform DCR.

## Proof boundary

The BFF verifies a signed `id_token` from its configured OpenID Provider and
extracts the verified email or telephone. That proves control of the login
contact. It does not prove a professional role and must never be copied into
`vp_token`.

An accepted directory result may describe a relationship, occupation and
authorization-evidence reference already held by the provider. Those values
still do not grant a clinical or emergency action. A protected action must use
either:

- an upstream provider BFF that validates the current role/Consent and owns its
  managed wallet; or
- the portal's own already-enrolled `ServerProfileSessionManager` profile,
  separate role `vp_token` where required, and a subject-scoped SMART token.

## High-level Node/BFF call

```ts
import { HttpRuntimeClient } from 'gdc-sdk-node-ts';

// The BFF has already verified signature, issuer, audience, expiry and the
// email_verified/phone_number claims on this OpenID account token.
const directoryClient = new HttpRuntimeClient({
  baseUrl: provider.baseUrl,
  bearerToken: signedIdToken,
  appInfo: {
    appId: 'https://sos.example.org',
    appVersion: 'v1.0',
    // Personal/family profile. A professional organization portal uses
    // `Organization`; product names such as `Emergency` are not app families.
    appType: 'Family',
    sector: provider.sector,
  },
});

const authorizedSubjects = await directoryClient.listAuthorizedIndividualSubjects(
  {
    tenantId: provider.tenantId,
    jurisdiction: provider.jurisdiction,
    sector: provider.sector,
  },
  {
    verifiedContact: {
      email: verifiedAccount.email,
      telephone: verifiedAccount.telephone,
    },
  },
);
```

`appType` is the SDK profile family, not the product name: use `Family` for a
personal/family portal and `Organization` for a professional organization
portal. `appId` is the stable application identity; neither field is the
wallet's `runtimeId`, a tenant DID or a subject identifier.

The SDK first recovers cards whose indexed `Organization.owner.email` or
`Organization.owner.telephone` exactly matches the verified login contact.
That covers legacy and self-created cards even when no accepted License row was
written. It then merges accepted License grants and resolves each remaining
subject by its exact card DID.

The SDK authors and polls those provider requests internally. It keeps the
accepted relationship and occupation claims together in `grantClaims`, so
applications do not collapse a caregiver relationship into an ISCO occupation
or infer compensation from the relationship alone. These remain descriptive
grant metadata, not action authority. The BFF does not construct OpenID,
schema.org or asynchronous GW payloads and does not
parse response bundles. It receives only exact subject identifiers, provider
claims and accepted-grant metadata for its product-specific presentation
filter.

## Wallet and custody decision

Do not create a `NodeManagedWallet` merely to list an account's existing
subjects. Create or load a managed wallet only when this application owns a
real registered device/profile and must perform wallet-bound operations.

When it does, keep the same custody contract as every other actor:

- retain a stable KMS-protected seed plus stable derivation context;
- keep PIN/passkey and private material in the trusted runtime;
- publish only public communication/signing JWKS;
- use `ServerProfileSessionManager.enroll(...)` for activation exchange and
  DCR, then `unlock(...)`/`refreshSession(...)` for short SMART sessions;
- keep the signed account `id_token`, role `vp_token` and wallet client
  assertion as independent proofs.

See [101-WALLET_CONTEXT_AND_KEY_CUSTODY.md](./101-WALLET_CONTEXT_AND_KEY_CUSTODY.md)
for seed/runtime identity and
[101-PROFESSIONAL-CONSENT-SMART.md](./101-PROFESSIONAL-CONSENT-SMART.md) for
role and subject authorization.

# 101 Wallet context and key custody

Use this guide when an integration needs to create a communication wallet for
one portal user/profile and device without persisting private JWKs. The same
custody pattern applies when that actor is an organization controller, an
employee/professional or an individual controller; the actor's lifecycle and
authority are separate from wallet key custody.

## What `context` means

`NodeManagedWallet` methods receive a `WalletExecutionContext`. It identifies
the local owner of a keyring; it is not an OpenID payload, GW route or DCR
request.

For communication keys, the minimum generic context is:

```ts
const userWalletContext = {
  runtime: {
    // Stable application-owned identifier for this user/profile device wallet.
    // Use an opaque local profile/device id, store it beside the encrypted seed
    // and reuse it after every restart. It is not a DID, email or DCR client_id.
    runtimeId: 'portal-runtime:user-profile-7f3a:primary-device',

    // Descriptive runtime category only. It does not grant a role and does not
    // identify the person, employee, controller, subject or organization.
    runtimeType: 'web-bff',
  },
};
```

`userWalletContext` is deliberately role-neutral. Here `user` means the portal
profile whose device/runtime owns this managed keyring. It may represent a
controller, employee/professional, individual controller or another supported
actor. It does not mean that these communication keys are the actor's personal
or professional-role signing keys.

`runtimeId` is chosen by the portal/BFF. It must be stable and unique within
that portal's wallet store. Good inputs identify a technical installation or
device wallet. Do not use the email, PIN, seed, private key, OpenID `sub`, DCR
`client_id` or a value accepted directly from the browser.

The complete shared type can also contain `profile`, `route` and `walletId`.
Communication keys use the runtime owner, so
`initializeCommunicationJsonWebKeySet(...)` specifically requires
`context.runtime.runtimeId`.

Source contract:

- [`WalletExecutionContext` and `WalletRuntimeRef`](https://github.com/Global-DataCare/gdc-sdk-core-ts/blob/main/src/wallet-contract.ts)
- [`NodeManagedWallet.initializeCommunicationJsonWebKeySet(...)`](https://github.com/Global-DataCare/gdc-sdk-node-ts/blob/main/src/node-managed-wallet.ts)

## What must be stored

With deterministic provisioning, persist only:

- the seed encrypted under the portal's KMS/KEK custody;
- the stable `WalletExecutionContext`, including `runtimeId`;
- the application record that associates that wallet with its portal profile,
  actor type and device.

Private JWKs do not need to be stored separately. After restart, decrypt the
seed inside the trusted backend and initialize a new wallet instance with the
same context:

```ts
// Application-owned protected record loaded by opaque profile/device id.
// runtimeId is non-secret; encryptedSeed is safe only under the portal's KMS.
const protectedUserWallet = await userWalletStore.get(userWalletRecordId);

// Plaintext exists only inside the trusted backend for this operation. Do not
// return it to the browser, log it or persist it outside the protected record.
const userWalletSeedMaterial = await portalKms.decrypt(
  protectedUserWallet.encryptedSeed,
);

// The managed keyring is generic: actor role is supplied by the later
// onboarding/session operation, not by the NodeManagedWallet constructor.
const userWallet = new NodeManagedWallet();

const userWalletContext = {
  runtime: {
    // Reuse the exact stable derivation owner stored with encryptedSeed.
    runtimeId: protectedUserWallet.runtimeId,
    // Descriptive only; it is not an authorization claim.
    runtimeType: protectedUserWallet.runtimeType,
  },
};

// Public communication keys for this user/profile device. Despite the `user`
// prefix, these are not the actor's professional-role/person signing key.
const userPublicCommunicationJwks =
  await userWallet.initializeCommunicationJsonWebKeySet(
    userWalletContext,
    { seedMaterial: userWalletSeedMaterial },
  );
```

The same seed plus the same context reconstructs the same private keys and
therefore the same public `kid` values. Changing either creates a different
wallet identity and previously registered controller/device proofs will fail.

Only `userPublicCommunicationJwks` may leave the trusted backend when the
selected onboarding flow requires public communication keys. Never send the
plaintext seed, KMS wrapping key, PIN or private JWK. In managed enrollment,
let the high-level SDK submit the public keys; the portal must not hand-author
DCR metadata.

The PIN is optional product policy. It can protect access to the KMS-wrapped
seed, but it is not a GW credential and is never part of DCR.

Executable proof:

- [deterministic communication-wallet reconstruction test](../tests/node-managed-wallet.test.mjs)

## Where this wallet is used

The wallet construction above is shared. What changes by actor is the
high-level lifecycle operation and its authority proof, not seed custody or
the meaning of `WalletExecutionContext`:

- a historical legal-representative controller uses the legacy binding below;
- a modern organization controller or employee/professional device uses
  managed profile enrollment;
- an individual controller uses the same wallet custody pattern when its
  product flow provisions a managed device/profile, while its subject and
  authorization boundaries remain those of the individual journey.

For the historical legal-representative `_activate` flow:

1. Generate/reconstruct communication JWKS with
   `initializeCommunicationJsonWebKeySet(...)`.
2. Pass `userPublicCommunicationJwks` to
   `buildControllerBindingInput({ publicKeys: userPublicCommunicationJwks })`
   together with the independent professional-role `publicSignKey`.
3. Call `activateOrganizationInGatewayFromIcaProof(...)`.
4. Do not run a second DCR for that same historical representative.

For modern organization controllers and employee/professional devices, use
`ServerProfileSessionManager.enroll(...)`; it owns wallet provisioning, token
exchange, DCR and `client_id` persistence.

Continue with:

- [101 end-to-end flow](./101-SDK_END_TO_END.md)
- [101 integration surface](./101-SDK_INTEGRATION.md)
- [organization-controller lifecycle](./101-ORGANIZATION_CONTROLLER_LIFECYCLE.md)
- [legacy organization activation test](../tests/host-onboarding.test.mjs)
- [profile enrollment and OIDC proof test](../tests/server-profile-session.test.mjs)

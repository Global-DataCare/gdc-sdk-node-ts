# 101 Wallet context and key custody

Use this guide when an integration needs to create a controller or device
communication wallet without persisting private JWKs.

## What `context` means

`NodeManagedWallet` methods receive a `WalletExecutionContext`. It identifies
the local owner of a keyring; it is not an OpenID payload, GW route or DCR
request.

For communication keys, the minimum context is:

```ts
const controllerWalletContext = {
  runtime: {
    // Stable application-owned identifier for this technical wallet.
    // Store it beside the encrypted seed and reuse it after every restart.
    runtimeId: 'portal-runtime:legal-representative:primary-device',

    // Descriptive only; it does not identify the person or organization.
    runtimeType: 'web-bff',
  },
};
```

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
- the application record that associates that wallet with its controller or
  device.

Private JWKs do not need to be stored separately. After restart, decrypt the
seed inside the trusted backend and initialize a new wallet instance with the
same context:

```ts
const seedMaterial = await portalKms.decrypt(encryptedWalletSeed);
const wallet = new NodeManagedWallet();

const publicCommunicationJwks =
  await wallet.initializeCommunicationJsonWebKeySet(
    controllerWalletContext,
    { seedMaterial },
  );
```

The same seed plus the same context reconstructs the same private keys and
therefore the same public `kid` values. Changing either creates a different
wallet identity and previously registered controller/device proofs will fail.

Only `publicCommunicationJwks` is sent to ICA/GW. Never send the plaintext
seed, KMS wrapping key, PIN or private JWK.

The PIN is optional product policy. It can protect access to the KMS-wrapped
seed, but it is not a GW credential and is never part of DCR.

Executable proof:

- [deterministic communication-wallet reconstruction test](../tests/node-managed-wallet.test.mjs)

## Where this wallet is used

For the historical legal-representative `_activate` flow:

1. Generate/reconstruct communication JWKS with
   `initializeCommunicationJsonWebKeySet(...)`.
2. Pass them to `buildControllerBindingInput({ publicKeys })` together with the
   independent professional-role `publicSignKey`.
3. Call `activateOrganizationInGatewayFromIcaProof(...)`.
4. Do not run a second DCR for that same historical representative.

For later controllers and employee devices, use
`ServerProfileSessionManager.enroll(...)`; it owns wallet provisioning, token
exchange, DCR and `client_id` persistence.

Continue with:

- [101 end-to-end flow](./101-SDK_END_TO_END.md)
- [101 integration surface](./101-SDK_INTEGRATION.md)
- [organization-controller lifecycle](./101-ORGANIZATION_CONTROLLER_LIFECYCLE.md)
- [legacy organization activation test](../tests/host-onboarding.test.mjs)
- [profile enrollment and OIDC proof test](../tests/server-profile-session.test.mjs)


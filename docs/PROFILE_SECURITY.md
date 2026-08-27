# Profile Security and Offline Adaptation

## Boundaries

Profile creation and Gateway authorization are separate operations.

1. A runtime creates or imports wallet key material.
2. It protects private material locally.
3. It publishes public keys through device registration and receives a stable
   `client_id`/device DID.
4. An unlock reconstructs the wallet long enough to sign `client_assertion`,
   present the required `vp_token`, and obtain a subject-and-scope-bound SMART
   token.

Firebase login, caller ID, a selected card, and a FHIR `RelatedPerson` are
identity or relationship inputs. None of them alone grants clinical access.

## Server envelope

`ServerProfileSessionManager` uses an envelope in which both the user's PIN
and the host protection are required:

```text
secret --AES-GCM(random DEK)--------------------------> payload ciphertext
DEK ----host KEK/KMS----> host-wrapped DEK
host-wrapped DEK --AES-GCM(scrypt(PIN, salt))--------> protected DEK
```

The salt and scrypt parameters are public metadata. Hiding the salt is not a
security control. The PIN is never persisted. A wrong PIN fails authenticated
decryption before the KMS adapter is invoked.

Cloud KMS is the BFF's host KEK boundary; it is not the user's PIN factor. KMS
IAM must permit only the production service account and audit every decrypt.
AAD binds each ciphertext to its profile, purpose and session so records cannot
be copied between fields or users.

After unlock, the server creates a bounded HttpOnly session containing a
host-sealed copy of the unlocked seed and current SMART token. This deliberately
lets normal requests proceed without resending the PIN. A BFF may call
`refreshSession(ownerId, sessionId, idToken)` with a freshly authenticated
account token to renew the shorter SMART bearer without reopening the durable
PIN envelope. Lock or wallet-session expiry deletes the temporary seed copy;
the durable profile remains PIN-and-host protected.

An employee who loses the PIN cannot decrypt the old seed. A fresh email OTP
may instead authorize replacement: GW verifies the exact employee email and
existing installation, rotates an internal activation credential, DCR replaces
the device keys, and the SDK deletes every old profile session before storing
the new seed under the new PIN. The activation credential remains server-only.

## Authority

Actor and subject fields are not arbitrary request data:

- `actorDid` and `profileDid` belong to the registered profile.
- `providerDid` and route context come from provider configuration/discovery.
- `actorMode` comes from the verified profile/relationship grant.
- `allowedSubjectDids` come from accepted consent or controller authority.

A portal or Twilio handler may select among already-authorized records. It must
not create controller/member authority from a browser field, caller number or
subject selection. GW still evaluates the SMART token and policy on every
operation.

## Native confidential and offline-first adaptation

Keep the serialized `gdc-pin-host-envelope-v1` semantics, but replace the host
adapter:

- iOS: a non-exportable Keychain/Secure Enclave-backed wrapping key.
- Android: a non-exportable Android Keystore wrapping key.
- Desktop confidential client: OS credential vault or hardware-backed key.

Use a platform scrypt implementation with the persisted parameters. Never
silently substitute a weaker KDF. Biometric unlock may release the device
wrapping key, but must not be treated as a remote identity or consent proof.

For offline delivery:

1. Build the canonical `CommunicationOutboxJob`.
2. Pack once for the intended recipient while the wallet is unlocked.
3. Persist the exact JWE plus `thid`, recipient, expiry and replay state.
4. Transfer the same bytes over HTTP, Bluetooth or another carrier.
5. Never decrypt or rebuild the JWE in a carrier adapter.
6. Require a fresh/valid SMART authorization when synchronizing with GW; local
   unlock does not extend an expired remote authorization.

Key import/export is a separate recovery feature. Export an encrypted envelope,
never a plaintext seed, and require explicit re-registration when imported on a
new device.

## Production checks

- Minimum PIN policy and rate limiting are enabled.
- KMS/Keychain IAM and audit logging are configured.
- Cookies are HttpOnly, Secure and SameSite; sessions are short-lived.
- DCR `client_assertion` is signed by the registered wallet key.
- Tests cover wrong PIN before KMS, AAD mismatch, subject mismatch, expiry,
  actor-mode resolution and unchanged offline JWE transport.

# 101: authorized subject directory

Use this flow when a personal portal or assistant must list subjects already
associated with an authenticated actor. It is discovery only: it does not
register an organization, create another wallet or perform another DCR.

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

## High-level personal Node/BFF call

```ts
// The account has listed its own server-held profiles. The PIN unlocks one
// actor wallet before any person or animal card is selected.
const actorSession = await profileSessions.unlockActorProfile({
  ownerId: verifiedAccount.uid,
  profileId: personalProfile.profileId,
  pin: userEnteredPin,
});

// The BFF already verified the OpenID token. The manager reuses the exact DCR
// wallet and sends the directory through encrypted DIDComm.
const { subjects: authorizedSubjects } =
  await profileSessions.refreshAuthorizedSubjects({
    ownerId: verifiedAccount.uid,
    sessionId: actorSession.sessionId,
    idToken: signedIdToken,
    verifiedContact: {
      email: verifiedAccount.email,
      telephone: verifiedAccount.telephone,
    },
  });

// Card selection exchanges only this subject's SMART scopes. It accepts no
// PIN and neither creates nor rotates a wallet/DCR client.
await profileSessions.selectAuthorizedSubject({
  ownerId: verifiedAccount.uid,
  sessionId: actorSession.sessionId,
  subjectDid: authorizedSubjects[0].subjectDid,
  scopes: ['patient/Composition.rs'],
  idToken: signedIdToken,
});
```

The SDK first recovers cards whose indexed `Organization.owner.email` or
`Organization.owner.telephone` exactly matches the verified login contact.
That covers legacy and self-created cards even when no accepted License row was
written. It then merges accepted License grants and resolves each remaining
subject by its exact card DID.

For `animal-care`, the animal remains the Organization's `ONESELF` member while
the verified human owner is projected as `RESPRSN`. The directory never turns
the animal's self-membership into the human actor's mode.

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

Do not create a wallet per subject. A personal application loads its one real
registered actor/device profile, unlocks that wallet once and uses it to list
every subject for which the actor has an exact relationship. Changing cards
changes SMART subject authorization, not the seed, PIN, DCR client or actor
identity. A separately trusted provider BFF may expose a reduced federated
directory, but it must not be confused with the actor-owned personal runtime.

The selected directory grant also supplies the subject-specific relationship:
`ONESELF` opens the self facade, `RESPRSN` opens the controller facade, and an
accepted caregiver or other member role opens the member facade. Its governed
`RelatedPerson` identifier becomes that subject's document attester. It is
never taken from another card and the authorization-evidence identifier is not
a substitute for the `RelatedPerson` identifier.

When it does, keep the same custody contract as every other actor:

- retain a stable KMS-protected seed plus stable derivation context;
- keep PIN/passkey and private material in the trusted runtime;
- publish only public communication/signing JWKS;
- use `ServerProfileSessionManager.enroll(...)` once for activation exchange
  and DCR, then `unlockActorProfile(...)`, `refreshAuthorizedSubjects(...)`
  and `selectAuthorizedSubject(...)` for the personal multi-subject session;
- keep the signed account `id_token`, role `vp_token` and wallet client
  assertion as independent proofs.

See [101-WALLET_CONTEXT_AND_KEY_CUSTODY.md](./101-WALLET_CONTEXT_AND_KEY_CUSTODY.md)
for seed/runtime identity and
[101-PROFESSIONAL-CONSENT-SMART.md](./101-PROFESSIONAL-CONSENT-SMART.md) for
role and subject authorization.

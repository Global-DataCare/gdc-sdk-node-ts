import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const guide = fs.readFileSync(
  new URL('../docs/101-SDK_END_TO_END.md', import.meta.url),
  'utf8',
);
const walletGuide = fs.readFileSync(
  new URL('../docs/101-WALLET_CONTEXT_AND_KEY_CUSTODY.md', import.meta.url),
  'utf8',
);

test('101 runtime bootstrap keeps participant identity and wallet custody out of deployment env', () => {
  // A participant DID belongs to one onboarded organization profile. A global
  // process variable would collapse every tenant onto one participant.
  assert.doesNotMatch(
    guide,
    /const\s+participantDid\s*=\s*process\.env\.PARTICIPANT_DID/,
  );

  // SoftwareApplicationCredential issuance is not implemented by ICA yet, so
  // the executable 101 must not fabricate a mock credential or imply it is
  // part of today's bootstrap.
  assert.doesNotMatch(guide, /const\s+softwareApplicationCredentialMock\s*=/);
  assert.match(guide, /TODO: ICA-authorized software application identity/);

  // A random seed generated at startup changes the runtime keys and kid values
  // after every restart. The 101 must load the KMS-protected stable seed.
  assert.doesNotMatch(guide, /seedMaterial:\s*crypto\.randomBytes\(/);
  assert.match(guide, /portalKms\.decrypt/);
});

test('wallet custody 101 uses role-neutral user wallet names', () => {
  // Wallet custody is shared by controller, employee/professional and
  // individual-controller profiles. A controller-prefixed context would make
  // the generic key-derivation contract look specific to one actor kind.
  assert.doesNotMatch(walletGuide, /const\s+controllerWalletContext\s*=/);
  assert.match(walletGuide, /const\s+userWalletContext\s*=/);
  assert.match(walletGuide, /const\s+userPublicCommunicationJwks\s*=/);

  // The example must explain that communication keys are not the actor's
  // professional-role/person signing keys.
  assert.match(
    walletGuide,
    /not the actor's professional-role\/person signing key/,
  );
});

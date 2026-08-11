import {
  canonicalizeOrganizationRegistrationAuthorizationCredential,
} from 'gdc-common-utils-ts/utils/organization-registration-authorization';
import type { VerifiableCredentialV2 } from 'gdc-common-utils-ts/models/verifiable-credential';
import type {
  IWallet,
  WalletExecutionContext,
  WalletKeySelection,
} from 'gdc-sdk-core-ts';

/** Input required to add one human-authorizer proof to the out-of-band VC. */
export type SignOrganizationRegistrationAuthorizationInput = Readonly<{
  credential: VerifiableCredentialV2;
  wallet: IWallet;
  context: WalletExecutionContext;
  key: WalletKeySelection;
  verificationMethod: string;
  createdAt?: string;
}>;

/**
 * Adds one detached JWS proof made by the already-unlocked professional
 * profile. The browser never receives the private key or clear wallet seed.
 */
export async function signOrganizationRegistrationAuthorizationCredential(
  input: SignOrganizationRegistrationAuthorizationInput,
): Promise<VerifiableCredentialV2> {
  if (!input.wallet.signDetachedJws) {
    throw new Error('Wallet does not support detached organization authorization proofs.');
  }
  const verificationMethod = String(input.verificationMethod || '').trim();
  if (!verificationMethod) throw new Error('Organization authorization proof requires verificationMethod.');
  const payload = canonicalizeOrganizationRegistrationAuthorizationCredential(input.credential);
  const jws = await input.wallet.signDetachedJws(input.context, {
    payload,
    header: { typ: 'application/vc+ld+json' },
    key: input.key,
  });
  const existingProofs = Array.isArray(input.credential.proof)
    ? input.credential.proof
    : input.credential.proof
      ? [input.credential.proof]
      : [];
  return {
    ...input.credential,
    proof: [...existingProofs, {
      type: 'JsonWebSignature2020',
      created: input.createdAt || new Date().toISOString(),
      proofPurpose: 'contractAgreement',
      verificationMethod,
      jws,
    }],
  };
}

import {
  canonicalizeOrganizationTestNetworkCredential,
} from 'gdc-common-utils-ts/utils/organization-test-network-credential';
import {
  canonicalizeTestNetworkOrganizationCredential,
} from 'gdc-common-utils-ts/utils/test-network-organization-credentials';
import type { VerifiableCredentialV2 } from 'gdc-common-utils-ts/models/verifiable-credential';
import type {
  IWallet,
  WalletExecutionContext,
  WalletKeySelection,
} from 'gdc-sdk-core-ts';

/** Input required to add one human-authorizer proof to the out-of-band VC. */
export type SignOrganizationTestNetworkCredentialInput = Readonly<{
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
export async function signOrganizationTestNetworkCredential(
  input: SignOrganizationTestNetworkCredentialInput,
): Promise<VerifiableCredentialV2> {
  if (!input.wallet.signDetachedJws) {
    throw new Error('Wallet does not support detached organization authorization proofs.');
  }
  const verificationMethod = String(input.verificationMethod || '').trim();
  if (!verificationMethod) throw new Error('Organization authorization proof requires verificationMethod.');
  const payload = canonicalizeOrganizationTestNetworkCredential(input.credential);
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

/**
 * Adds the unlocked reviewer's ML-DSA-65 assertion proof to one of the three
 * normal domain credentials restricted to Test Network.
 */
export async function signTestNetworkOrganizationCredential(
  input: SignOrganizationTestNetworkCredentialInput,
): Promise<VerifiableCredentialV2> {
  if (!input.wallet.signDetachedJws) {
    throw new Error('Wallet does not support detached Test Network credential proofs.');
  }
  const verificationMethod = String(input.verificationMethod || '').trim();
  if (!verificationMethod) throw new Error('Test Network credential proof requires verificationMethod.');
  const jws = await input.wallet.signDetachedJws(input.context, {
    payload: canonicalizeTestNetworkOrganizationCredential(input.credential),
    header: { typ: 'application/vc+ld+json' },
    key: input.key,
  });
  return {
    ...input.credential,
    proof: [{
      type: 'JsonWebSignature2020',
      created: input.createdAt || new Date().toISOString(),
      proofPurpose: 'assertionMethod',
      verificationMethod,
      jws,
    }],
  };
}

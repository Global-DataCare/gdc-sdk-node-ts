// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import { getBaseUrlFromDidWeb, normalizeDidWeb } from 'gdc-common-utils-ts/utils/did';
import type { DidDocument, VerificationMethod } from 'gdc-common-utils-ts/models/did';
import type { JWK } from 'gdc-common-utils-ts/models/jwk';

export type ResolveDidWebKeyAgreementJwkOptions = Readonly<{
  fetchImpl?: typeof fetch;
  /**
   * Transport override for a local/private route serving the same DID document.
   * The returned document must still identify itself with the requested DID.
   */
  didDocumentUrl?: string;
}>;

/**
 * Resolves the first public key-agreement JWK from a did:web document.
 *
 * The DID remains the recipient identity and the document remains the source
 * of its public keys. `didDocumentUrl` changes only the HTTP route used to
 * retrieve that same document, which is useful when a local GW publishes its
 * external DID while being reached through localhost.
 */
export async function resolveDidWebKeyAgreementJwk(
  recipientDid: string,
  options: ResolveDidWebKeyAgreementJwkOptions = {},
): Promise<JWK> {
  const did = normalizeDidWeb(String(recipientDid || '').trim());
  if (!did.startsWith('did:web:')) {
    throw new Error('resolveDidWebKeyAgreementJwk requires a did:web recipient.');
  }
  const didDocumentUrl = String(options.didDocumentUrl || '').trim()
    || `${getBaseUrlFromDidWeb(did)}.well-known/did.json`;
  const response = await (options.fetchImpl || fetch)(didDocumentUrl, {
    headers: { Accept: 'application/did+json, application/json' },
  });
  if (!response.ok) {
    throw new Error(`Could not resolve DID document '${did}' (HTTP ${response.status}).`);
  }
  const document = await response.json() as DidDocument;
  if (normalizeDidWeb(String(document.id || '').trim()) !== did) {
    throw new Error(`Resolved DID document does not belong to '${did}'.`);
  }
  const methods = new Map((document.verificationMethod || []).map((method) => [method.id, method]));
  for (const agreement of document.keyAgreement || []) {
    const method = typeof agreement === 'string' ? methods.get(agreement) : agreement;
    const jwk = publicKeyAgreementJwk(method);
    if (jwk) return jwk;
  }
  throw new Error(`DID document '${did}' has no public keyAgreement JWK.`);
}

function publicKeyAgreementJwk(method?: VerificationMethod): JWK | undefined {
  const publicKeyJwk = method?.publicKeyJwk as JWK | undefined;
  if (!publicKeyJwk || typeof publicKeyJwk !== 'object') return undefined;
  if (publicKeyJwk.use && publicKeyJwk.use !== 'enc') return undefined;
  if (publicKeyJwk.kid || !method?.id.includes('#')) return publicKeyJwk;
  return { ...publicKeyJwk, kid: method.id.slice(method.id.lastIndexOf('#') + 1) };
}

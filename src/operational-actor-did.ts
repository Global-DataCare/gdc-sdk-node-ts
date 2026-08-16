// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

/** Minimal DID document shape required for portal-alias resolution. */
export type OperationalActorDidDocument = Readonly<{
  id: string;
  alsoKnownAs?: readonly string[];
}>;

/**
 * Resolves a public portal/vanity DID to the canonical hosted operational DID.
 *
 * `alsoKnownAs` proves only alias continuity. Authentication and authorization
 * still come from the verified employee credential and SMART token. The
 * returned primary `id` is the value used in ActorSession and internal GW
 * requests.
 */
export async function resolveOperationalActorDid(
  publicActorDid: string,
  resolveDidDocument: (did: string) => Promise<OperationalActorDidDocument>,
): Promise<string> {
  const requestedDid = String(publicActorDid || '').trim();
  if (!requestedDid.startsWith('did:')) throw new Error('A public actor DID is required.');
  const document = await resolveDidDocument(requestedDid);
  const operationalDid = String(document?.id || '').trim();
  if (!operationalDid.startsWith('did:web:')) {
    throw new Error('Resolved employee identity must have a hosted did:web primary id.');
  }
  if (operationalDid !== requestedDid) {
    const aliases = (document.alsoKnownAs || []).map((value) => String(value || '').trim());
    if (!aliases.includes(requestedDid)) {
      throw new Error('Resolved DID document does not bind the requested public actor alias.');
    }
  }
  return operationalDid;
}

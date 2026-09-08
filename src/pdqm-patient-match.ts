// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import {
  buildPdqmPatientMatchGatewayBody,
  buildPdqmPatientMatchRequest,
  decodeTransportResponse,
  renderGatewayMessageRequest,
  TransportProfiles,
  type FhirPatientMatchInput,
  type SecureDidcommTransportAdapter,
  type TransportProfile,
} from 'gdc-sdk-core-ts';

export type MatchPatientAtIndexProviderInput = Readonly<{
  /** Provider FHIR base discovered from the resolved index-provider DID. */
  fhirBaseUrl: string;
  /** Patient containing the governed identifier known by the requesting BFF. */
  patient: FhirPatientMatchInput;
  /** DID of the authenticated professional, member or controller making the request. */
  requesterDid: string;
  /** Provider DID returned by the public subject-identifier ledger lookup. */
  indexProviderDid: string;
  /** Optional PDQm control that excludes possible, lower-confidence matches. */
  onlyCertainMatches?: boolean;
}>;

export type FhirPatientMatchBundle = Readonly<{
  resourceType: 'Bundle';
  type: 'searchset';
  [key: string]: unknown;
}>;

type PatientMatchDependencies = Readonly<{
  transportProfile: TransportProfile;
  secureTransportAdapter?: SecureDidcommTransportAdapter;
  createUuid: () => string;
  post: (
    url: string,
    request: Readonly<{
      contentType: string;
      accept: string;
      body: Record<string, unknown> | string;
    }>,
  ) => Promise<Readonly<{ status: number; body: unknown }>>;
}>;

function requiredDid(value: string, name: string): string {
  const normalized = String(value || '').trim();
  if (!normalized.startsWith('did:')) throw new TypeError(`${name} must be a DID.`);
  return normalized;
}

function readPatientMatchBundle(value: unknown): FhirPatientMatchBundle {
  const candidate = value && typeof value === 'object' && !Array.isArray(value)
    && 'body' in value
    ? (value as { body?: unknown }).body
    : value;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('PDQm Patient/$match response must contain one FHIR search Bundle.');
  }
  const bundle = candidate as Record<string, unknown>;
  if (bundle.resourceType !== 'Bundle' || bundle.type !== 'searchset') {
    throw new Error('PDQm Patient/$match response must contain one FHIR search Bundle.');
  }
  return bundle as FhirPatientMatchBundle;
}

/**
 * Calls the resolved provider's IHE PDQm `POST Patient/$match` facade.
 *
 * The opaque subject-identifier hash is deliberately absent: it stops at the
 * preceding Fabric lookup. Native FHIR sends one `Parameters` body. DIDComm
 * plain places that same resource in the only `body.data[]` entry. Strict mode
 * signs and encrypts the identical DIDComm message through the wallet adapter
 * and sends `request=<JWE>` as `application/x-www-form-urlencoded`.
 *
 * @see https://profiles.ihe.net/ITI/PDQm/ITI-119.html
 */
export async function matchPatientAtIndexProviderWithDeps(
  input: MatchPatientAtIndexProviderInput,
  dependencies: PatientMatchDependencies,
): Promise<FhirPatientMatchBundle> {
  const requesterDid = requiredDid(input.requesterDid, 'requesterDid');
  const indexProviderDid = requiredDid(input.indexProviderDid, 'indexProviderDid');
  const matchRequest = buildPdqmPatientMatchRequest({
    fhirBaseUrl: input.fhirBaseUrl,
    patient: input.patient,
    onlyCertainMatches: input.onlyCertainMatches,
  });
  const thid = `pdqm-patient-match-${dependencies.createUuid()}`;

  const rendered = dependencies.transportProfile === TransportProfiles.FhirJson
    ? {
        contentType: TransportProfiles.FhirJson,
        accept: 'application/fhir+json, application/json',
        body: matchRequest.body,
      }
    : await renderGatewayMessageRequest({
        id: dependencies.createUuid(),
        thid,
        type: TransportProfiles.DidcommPlainJson,
        from: requesterDid,
        to: [indexProviderDid],
        body: buildPdqmPatientMatchGatewayBody(matchRequest),
      }, dependencies.transportProfile, dependencies.secureTransportAdapter);

  const response = await dependencies.post(matchRequest.url, rendered);
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`PDQm Patient/$match failed with HTTP ${response.status}.`);
  }
  const decoded = await decodeTransportResponse(
    response.body,
    dependencies.transportProfile,
    dependencies.secureTransportAdapter,
  );
  return readPatientMatchBundle(decoded);
}

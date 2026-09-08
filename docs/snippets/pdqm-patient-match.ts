import type {
  FhirPatientMatchBundle,
  FhirPatientMatchInput,
  HttpRuntimeClient,
} from 'gdc-sdk-node-ts';

export type KnownPatientMatchInput = Readonly<{
  fhirBaseUrl: string;
  indexProviderDid: string;
  authenticatedActorDid: string;
  patient: FhirPatientMatchInput;
}>;

/**
 * Resolves a known human at the previously discovered index provider.
 * The opaque Fabric lookup key is intentionally not an input to this call.
 * The SDK performs IHE PDQm POST Patient/$match for the BFF.
 */
export async function matchKnownPatient(
  runtimeClient: HttpRuntimeClient,
  input: KnownPatientMatchInput,
): Promise<FhirPatientMatchBundle> {
  return runtimeClient.matchPatientAtIndexProvider({
    fhirBaseUrl: input.fhirBaseUrl,
    indexProviderDid: input.indexProviderDid,
    requesterDid: input.authenticatedActorDid,
    patient: input.patient,
    onlyCertainMatches: true,
  });
}

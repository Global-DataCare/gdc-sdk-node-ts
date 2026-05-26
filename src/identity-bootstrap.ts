// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import {
  initializeCommunicationIdentityFromSeed as initializeSharedCommunicationIdentity,
  type CommunicationIdentityBootstrapOptions,
  type CommunicationIdentityBootstrapResult,
} from 'gdc-common-utils-ts/utils/communication-identity';

/**
 * Node SDK convenience wrapper for the shared technical communication identity
 * bootstrap helper defined in `gdc-common-utils-ts`.
 *
 * Use this from node backends when you want the bootstrap API to be reachable
 * directly from `gdc-sdk-node-ts`, while keeping the implementation shared.
 *
 * This bootstraps the technical device/portal/app communication identity used
 * to secure DIDComm/JOSE envelopes. It is distinct from the personal wallet or
 * controller identity that may later sign user-controlled operations such as
 * access-token or consent requests.
 *
 * Implemented today:
 * - deterministic/random technical transport identity bootstrap
 * - direct reuse of shared JOSE header and key-shape helpers
 *
 * Still pending in the node SDK:
 * - first-class controller/person identity bootstrap API
 * - integrated persistence of deviceIdentity vs actorIdentity vs providerIdentity
 * - direct coupling with remote DID/discovery resolution
 *
 * Canonical copyable payload examples for related bootstrap flows live in:
 * `gdc-common-utils-ts/examples`
 *
 * @param options Stable seed/bootstrap options. See the shared
 * `CommunicationIdentityBootstrapOptions` JSDoc in `gdc-common-utils-ts`.
 */
export async function initializeCommunicationIdentity(
  options: CommunicationIdentityBootstrapOptions,
): Promise<CommunicationIdentityBootstrapResult> {
  return initializeSharedCommunicationIdentity(options);
}

/**
 * @deprecated Use `initializeCommunicationIdentity(...)`.
 */
export const initializeCommunicationIdentityFromSeed = initializeCommunicationIdentity;

export type {
  CommunicationIdentityBootstrapOptions as NodeSdkCommunicationIdentityBootstrapOptions,
  CommunicationIdentityBootstrapResult as NodeSdkCommunicationIdentityBootstrapResult,
} from 'gdc-common-utils-ts/utils/communication-identity';

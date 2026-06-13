import assert from 'node:assert/strict';
import { ResourceTypesFhirR4 } from 'gdc-common-utils-ts/constants';

/**
 * Canonical live transport profiles exercised by the Node E2E suite.
 *
 * Scope:
 * - `didcomm-plain`: current demo/test-network profile used by the existing
 *   SDK runtime client
 * - `legacy-fhir`: raw FHIR Bundle over HTTPS for `org.hl7.fhir.*` endpoints
 * - `all`: run every implemented profile in the same Node test invocation
 *
 * Intentionally excluded for now:
 * - encrypted DIDComm/FAPI secure-form profile
 *   The current `gdc-sdk-node-ts` live client still submits plaintext DIDComm,
 *   so encrypted transport needs a dedicated runtime adapter before it can be
 *   truthfully validated here.
 */
export const LiveGwTransportProfiles = Object.freeze({
  All: 'all',
  DidcommPlain: 'didcomm-plain',
  LegacyFhir: 'legacy-fhir',
});

export const LegacyFhirMediaType = 'application/fhir+json';
export const JsonMediaType = 'application/json';
export const BatchAction = '_batch';
export const BatchResponseAction = '_batch-response';
export const IndividualSection = 'individual';
export const FhirR4Format = 'org.hl7.fhir.r4';
export const PostMethod = 'POST';

/**
 * Normalizes one user-provided transport selector.
 */
export function normalizeLiveGwTransportProfile(raw) {
  const normalized = String(raw || '').trim().toLowerCase();
  if (
    normalized === LiveGwTransportProfiles.LegacyFhir
    || normalized === LiveGwTransportProfiles.DidcommPlain
    || normalized === LiveGwTransportProfiles.All
  ) {
    return normalized;
  }
  return LiveGwTransportProfiles.DidcommPlain;
}

/**
 * Returns `true` when a profile-targeted test block should run under the
 * current suite selector.
 */
export function shouldRunLiveGwTransportProfile(activeProfile, targetProfile) {
  const normalizedActive = normalizeLiveGwTransportProfile(activeProfile);
  const normalizedTarget = normalizeLiveGwTransportProfile(targetProfile);
  return normalizedActive === LiveGwTransportProfiles.All || normalizedActive === normalizedTarget;
}

/**
 * Builds the raw legacy FHIR batch Bundle equivalent for one `Communication`
 * submit generated from the shared cross-repo examples.
 *
 * Input contract:
 * - the caller provides the same shared communication ingestion payload already
 *   used by the DIDComm branch
 * - this helper extracts the first business `Communication` resource and wraps
 *   it into the legacy `application/fhir+json` Bundle shape accepted by GW
 */
export function buildLegacyFhirCommunicationBatchBundle({
  communicationPayload,
  format = FhirR4Format,
}) {
  const resource = communicationPayload?.body?.data?.[0]?.resource;
  const thid = String(communicationPayload?.thid || '').trim();
  assert.ok(resource && typeof resource === 'object', 'Legacy FHIR batch builder requires one first communication resource.');
  assert.ok(thid, 'Legacy FHIR batch builder requires one caller-provided thid.');

  return {
    id: thid,
    thid,
    resourceType: ResourceTypesFhirR4.Bundle,
    type: 'batch',
    entry: [
      {
        request: {
          method: PostMethod,
          url: `${IndividualSection}/${format}/${ResourceTypesFhirR4.Communication}`,
        },
        resource,
      },
    ],
  };
}

/**
 * Submits one raw `application/fhir+json` batch and polls the async result
 * through the standard JSON poll contract.
 */
export async function submitLegacyFhirBatchAndPoll({
  baseUrl,
  submitPath,
  pollPath,
  bearerToken,
  bundlePayload,
  thid,
  pollOptions = {},
}) {
  const submit = await fetch(`${baseUrl}${submitPath}`, {
    method: PostMethod,
    headers: buildLegacyFhirSubmitHeaders({ bearerToken }),
    body: JSON.stringify(bundlePayload),
  });
  const submitBody = await readJsonBodySafe(submit);
  const effectiveThid = String(thid || '').trim();
  assert.ok(effectiveThid, 'Legacy FHIR submit requires one caller-provided thid.');

  const timeoutMs = Math.max(1, Number(pollOptions.timeoutMs || 120_000));
  const intervalMs = Math.max(1, Number(pollOptions.intervalMs || 1_500));
  const startedAt = Date.now();
  let attempts = 0;

  for (;;) {
    attempts += 1;
    const poll = await fetch(`${baseUrl}${pollPath}`, {
      method: PostMethod,
      headers: buildJsonPollHeaders({ bearerToken }),
      body: JSON.stringify({ thid: effectiveThid }),
    });
    const pollBody = await readJsonBodySafe(poll);

    if (poll.status !== 202) {
      return {
        submit: { status: submit.status, body: submitBody },
        poll: { status: poll.status, body: pollBody, attempts },
      };
    }

    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(`Legacy FHIR poll timed out after ${timeoutMs}ms for thid ${effectiveThid}.`);
    }

    await sleep(intervalMs);
  }
}

/**
 * Creates the tenant-scoped GW `Communication/_batch` path used by the raw
 * legacy FHIR profile.
 */
export function buildLegacyFhirCommunicationBatchPath({ tenantId, jurisdiction, sector }) {
  return `/${encodeURIComponent(tenantId)}/cds-${encodeURIComponent(jurisdiction)}/v1/${encodeURIComponent(sector)}/${IndividualSection}/${FhirR4Format}/${ResourceTypesFhirR4.Communication}/${BatchAction}`;
}

/**
 * Creates the tenant-scoped GW `Communication/_batch-response` path used by
 * the raw legacy FHIR profile.
 */
export function buildLegacyFhirCommunicationPollPath({ tenantId, jurisdiction, sector }) {
  return `/${encodeURIComponent(tenantId)}/cds-${encodeURIComponent(jurisdiction)}/v1/${encodeURIComponent(sector)}/${IndividualSection}/${FhirR4Format}/${ResourceTypesFhirR4.Communication}/${BatchResponseAction}`;
}

function buildLegacyFhirSubmitHeaders({ bearerToken }) {
  return {
    ...(String(bearerToken || '').trim() ? { Authorization: `Bearer ${bearerToken}` } : {}),
    'Content-Type': LegacyFhirMediaType,
    Accept: `${LegacyFhirMediaType}, ${JsonMediaType}, */*`,
  };
}

function buildJsonPollHeaders({ bearerToken }) {
  return {
    ...(String(bearerToken || '').trim() ? { Authorization: `Bearer ${bearerToken}` } : {}),
    'Content-Type': JsonMediaType,
    Accept: `${JsonMediaType}, ${LegacyFhirMediaType}, */*`,
  };
}

async function readJsonBodySafe(response) {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

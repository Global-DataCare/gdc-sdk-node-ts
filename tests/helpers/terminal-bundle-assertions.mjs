import assert from 'node:assert/strict';
import { BundleReader } from 'gdc-common-utils-ts';

/**
 * Proves one asynchronous GW business operation, not merely its HTTP poll.
 *
 * HTTP 200 means that polling completed. The terminal Bundle remains the
 * authoritative business result, so tests must use the shared BundleReader
 * instead of traversing `data[]`, `entry[]` or `OperationOutcome.issue[]`.
 */
export function assertSuccessfulTerminalBundle(result, message, minimumSuccessfulOperations = 1) {
  assert.equal(result.poll.status, 200, `${message} Polling must complete with HTTP 200.`);
  const analysis = new BundleReader(result.poll.body || {}).getResponseAnalysis();
  assert.equal(
    analysis.hasErrors,
    false,
    `${message} Terminal Bundle contains an error OperationOutcome: ${analysis.issueDiagnostics.join('; ')}`,
  );
  assert.ok(
    analysis.successfulOperations >= minimumSuccessfulOperations,
    `${message} Terminal Bundle must report at least ${minimumSuccessfulOperations} successful operation(s).`,
  );
  return analysis;
}

/** Proves an expected business failure inside a completed async envelope. */
export function assertTerminalBundleFailure(result, message, diagnosticsPattern) {
  assert.equal(result.poll.status, 200, `${message} Polling must complete with HTTP 200.`);
  const analysis = new BundleReader(result.poll.body || {}).getResponseAnalysis();
  assert.equal(analysis.hasErrors, true, `${message} must contain an error OperationOutcome.`);
  assert.match(analysis.issueDiagnostics.join('; '), diagnosticsPattern, message);
  return analysis;
}

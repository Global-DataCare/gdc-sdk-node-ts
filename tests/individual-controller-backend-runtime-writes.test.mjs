// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EXAMPLE_SUBJECT_DID,
  EXAMPLE_TENANT_ROUTE_CONTEXT,
} from 'gdc-common-utils-ts/examples/shared';
import { IndividualControllerBackendRuntime } from '../dist/index.js';

test('individual-controller backend runtime exposes the complete clinical write surface', async () => {
  const calls = [];
  const expected = Object.freeze({ poll: { status: 200 } });
  const sdk = {
    importIpsOrFhirAndUpdateIndex: async (...args) => { calls.push(['import', ...args]); return expected; },
    ingestCommunicationAndUpdateIndex: async (...args) => { calls.push(['ingest', ...args]); return expected; },
    updateClinicalSection: async (...args) => { calls.push(['section', ...args]); return expected; },
    updateClinicalSummary: async (...args) => { calls.push(['summary', ...args]); return expected; },
  };
  const profile = { sdk };
  const runtime = new IndividualControllerBackendRuntime({});
  const inputs = {
    import: { subjectDid: EXAMPLE_SUBJECT_DID },
    ingest: { subjectDid: EXAMPLE_SUBJECT_DID },
    section: { subjectDid: EXAMPLE_SUBJECT_DID },
    summary: { subjectDid: EXAMPLE_SUBJECT_DID },
  };

  assert.equal(await runtime.importIpsOrFhirAndUpdateIndex(profile, EXAMPLE_TENANT_ROUTE_CONTEXT, inputs.import), expected);
  assert.equal(await runtime.ingestCommunicationAndUpdateIndex(profile, EXAMPLE_TENANT_ROUTE_CONTEXT, inputs.ingest), expected);
  assert.equal(await runtime.updateClinicalSection(profile, EXAMPLE_TENANT_ROUTE_CONTEXT, inputs.section), expected);
  assert.equal(await runtime.updateClinicalSummary(profile, EXAMPLE_TENANT_ROUTE_CONTEXT, inputs.summary), expected);
  assert.deepEqual(calls, [
    ['import', EXAMPLE_TENANT_ROUTE_CONTEXT, inputs.import],
    ['ingest', EXAMPLE_TENANT_ROUTE_CONTEXT, inputs.ingest],
    ['section', EXAMPLE_TENANT_ROUTE_CONTEXT, inputs.section],
    ['summary', EXAMPLE_TENANT_ROUTE_CONTEXT, inputs.summary],
  ]);
});

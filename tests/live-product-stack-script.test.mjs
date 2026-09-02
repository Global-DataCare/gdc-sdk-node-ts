/**
 * Complete journey:
 * 1. choose an isolated product GW, ICA and local ports;
 * 2. start the selected stack without touching another thread's service ports;
 * 3. execute the same SDK live full-cycle contract against that stack;
 * 4. close only the selected product processes.
 *
 * Authorization invariant: selecting a product implementation changes no SDK
 * actor, credential or consent semantics.
 * Persistence invariant: each live run owns fresh host/tenant ids and cleanup
 * targets only its explicitly selected directories and ports.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('live full-cycle wrapper accepts isolated product GW and ICA targets', () => {
  const script = readFileSync(
    new URL('../scripts/run-live-101-full-cycle-clean.sh', import.meta.url),
    'utf8',
  );

  assert.match(script, /GDC_WORKSPACE_DIR/);
  assert.match(script, /GW_DIR_OVERRIDE/);
  assert.match(script, /ICA_DIR_OVERRIDE/);
  assert.match(script, /GW_PORT/);
  assert.match(script, /ICA_PORT/);
  assert.match(script, /PORTS="\$\{GW_PORT\}"/);
  assert.match(script, /ICA_API_PORT="\$\{ICA_PORT\}"/);
  assert.match(script, /PORT="\$\{GW_PORT\}"/);
});

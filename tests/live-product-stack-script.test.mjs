// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
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
  assert.match(script, /GW_ENV_FILE/);
  assert.match(script, /ICA_DIR_OVERRIDE/);
  assert.match(script, /ICA_ENV_FILE/);
  assert.match(script, /GW_DIR_OVERRIDE and ICA_DIR_OVERRIDE must be provided together/);
  assert.match(script, /LIVE_101_SIGNED_PDF_FIXTURE_ENV/);
  assert.match(script, /VERIFIERS_VAT_LIST="\$\{VERIFIERS_VAT_LIST\}"/);
  assert.match(script, /LIVE_CONTROLLER_ORGANIZATION_TAX_ID="\$\{LIVE_CONTROLLER_ORGANIZATION_TAX_ID\}"/);
  assert.match(script, /GW_ENV_OVERRIDES=\(/);
  assert.match(script, /"PORT=\$\{GW_PORT\}"/);
  assert.match(script, /"ICA_JURISDICTION=\$\{GW_ICA_JURISDICTION_VALUE\}"/);
  assert.match(script, /GW_ICA_JURISDICTION_OVERRIDE/);
  assert.match(script, /GW_PORT/);
  assert.match(script, /ICA_PORT/);
  assert.match(script, /PORTS="\$\{GW_PORT\}"/);
  assert.match(script, /ICA_API_PORT="\$\{ICA_PORT\}"/);
  assert.match(script, /PORT="\$\{GW_PORT\}"/);
});

test('live controller wrapper accepts the same isolated service targets', () => {
  const script = readFileSync(
    new URL('../scripts/run-live-controller-lifecycle.sh', import.meta.url),
    'utf8',
  );

  assert.match(script, /GDC_WORKSPACE_DIR/);
  assert.match(script, /GW_DIR_OVERRIDE/);
  assert.match(script, /ICA_DIR_OVERRIDE/);
  assert.match(script, /GW_DIR_OVERRIDE and ICA_DIR_OVERRIDE must be provided together/);
  assert.match(script, /GW_ENV_FILE/);
  assert.match(script, /GW_PORT/);
  assert.match(script, /ICA_PORT/);
  assert.match(script, /PORTS="\$\{GW_PORT\}"/);
  assert.match(script, /ICA_API_PORT="\$\{ICA_PORT\}"/);
  assert.match(script, /PORT="\$\{GW_PORT\}"/);
});

test('live GW wrapper accepts isolated GW and ICA implementations and ports', () => {
  const script = readFileSync(
    new URL('../scripts/run-live-gw-clean.sh', import.meta.url),
    'utf8',
  );

  assert.match(script, /GDC_WORKSPACE_DIR/);
  assert.match(script, /GW_DIR_OVERRIDE/);
  assert.match(script, /ICA_DIR_OVERRIDE/);
  assert.match(script, /GW_DIR_OVERRIDE and ICA_DIR_OVERRIDE must be provided together/);
  assert.match(script, /GW_PORT/);
  assert.match(script, /ICA_PORT/);
  assert.match(script, /GW_START_SCRIPT/);
  assert.match(script, /PORTS="\$\{GW_PORT\}"/);
  assert.match(script, /ICA_API_PORT="\$\{ICA_PORT\}"/);
  assert.match(script, /PORT="\$\{GW_PORT\}"/);
  assert.match(script, /RUN_LIVE_GW_E2E_HOST_VERIFICATION_TRANSACTION="\$\{RUN_LIVE_GW_E2E_HOST_VERIFICATION_TRANSACTION:-1\}"/);
});

test('live verification keeps the canonical official identifier separate from the tenant route alias', () => {
  const source = readFileSync(
    new URL('./live-gw-node-runtime.e2e.test.mjs', import.meta.url),
    'utf8',
  );

  assert.match(source, /officialOrganizationIdentifier/);
  assert.match(source, /'org\.schema\.Organization\.identifier\.value': officialOrganizationIdentifier/);
  assert.match(source, /'org\.schema\.Organization\.taxID': officialOrganizationIdentifier/);
});

test('each live journey keeps its subject identity boundary explicit', () => {
  const source = readFileSync(
    new URL('./live-gw-node-runtime.e2e.test.mjs', import.meta.url),
    'utf8',
  );

  assert.match(source, /suiteProfessionalSubjectDid/);
  assert.match(source, /suiteProfileSubjectDid/);
  assert.match(source, /const subjectDid = suiteProfileSubjectDid/);
  assert.match(source, /const subjectDid = registeredIdentity\.subjectDid/);
  assert.doesNotMatch(source, /const subjectDid = suiteLifecycleSubjectDid/);
});

test('live wrappers never dirty a selected GW worktree by regenerating Swagger', () => {
  for (const scriptName of [
    'run-live-gw-clean.sh',
    'run-live-101-full-cycle-clean.sh',
    'run-live-controller-lifecycle.sh',
  ]) {
    const script = readFileSync(new URL(`../scripts/${scriptName}`, import.meta.url), 'utf8');
    assert.doesNotMatch(script, /npm run build:swagger/);
  }
});

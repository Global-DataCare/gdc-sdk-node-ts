// Flow contract: the real controller lifecycle launcher supplies the canonical signed-PDF verifier metadata before ICA starts; a verifier never substitutes for the enrolled organization.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));

test('controller lifecycle boots ICA with the verifier from its signed-PDF metadata', () => {
  const work = mkdtempSync(path.join(tmpdir(), 'e9-controller-driver-'));
  try {
    const bin = path.join(work, 'bin');
    const gw = path.join(work, 'gw');
    const ica = path.join(work, 'ica');
    const capture = path.join(work, 'verifier.txt');
    for (const dir of [bin, path.join(gw, 'scripts'), ica]) mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(gw, 'scripts/local-close.sh'), '#!/bin/sh\nexit 0\n');
    writeFileSync(path.join(bin, 'npm'), '#!/bin/sh\nprintf "%s" "${VERIFIERS_VAT_LIST:-}" > "$E9_VERIFIER_CAPTURE"\nexit 70\n', { mode: 0o755 });
    for (const command of ['curl', 'lsof']) writeFileSync(path.join(bin, command), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    writeFileSync(path.join(bin, 'sleep'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, GW_DIR_OVERRIDE: gw,
      ICA_DIR_OVERRIDE: ica, E9_VERIFIER_CAPTURE: capture };
    delete env.VERIFIERS_VAT_LIST;
    delete env.LIVE_CONTROLLER_ORGANIZATION_TAX_ID;
    const result = spawnSync('bash', ['scripts/run-live-controller-lifecycle.sh'], { cwd: root, env, encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 1, result.stderr);
    const metadata = readFileSync(path.join(root, 'tests/fixtures/live-101-signed-pdf.env'), 'utf8');
    const expected = metadata.match(/^VERIFIERS_VAT_LIST=(.+)$/m)?.[1];
    assert.ok(expected);
    assert.equal(readFileSync(capture, 'utf8'), expected);
  } finally { rmSync(work, { recursive: true, force: true }); }
});

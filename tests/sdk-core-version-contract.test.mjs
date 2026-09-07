// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
// The Node runtime reuses the shared draft-Consent permission request and real GW Order readers without portal-side envelope traversal.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

function readInstalledPackageVersion(packageName) {
  let directory = dirname(fileURLToPath(import.meta.resolve(packageName)));
  while (directory !== dirname(directory)) {
    const manifestPath = join(directory, 'package.json');
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (manifest.name === packageName) return manifest.version;
    }
    directory = dirname(directory);
  }
  return undefined;
}

test('pins the shared identity, activation-licence and draft-Consent contracts', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  for (const [packageName, declaredVersion] of Object.entries(packageJson.dependencies)) {
    assert.equal(readInstalledPackageVersion(packageName), declaredVersion);
  }
});

test('release pins the converged core and common contracts', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(packageJson.version, '2.9.2');
  assert.equal(packageJson.dependencies['gdc-common-utils-ts'], '2.9.4');
  assert.equal(packageJson.dependencies['gdc-sdk-core-ts'], '2.9.2');
});

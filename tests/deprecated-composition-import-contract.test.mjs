// Flow contract: the historical direct Composition import remains callable but every public SDK declaration labels it deprecated in favor of Communication-backed clinical writes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const declarationFiles = [
  'dist/resource-operations.d.ts',
  'dist/orchestration/individual-controller-sdk.d.ts',
  'dist/orchestration/personal-sdk.d.ts',
  'dist/individual-controller-backend-runtime.d.ts',
  'dist/orchestration/client-port.d.ts',
];

test('marks every public direct Composition import declaration deprecated without removing it', async () => {
  for (const declarationFile of declarationFiles) {
    const declaration = await readFile(new URL(`../${declarationFile}`, import.meta.url), 'utf8');
    const methodOffset = declaration.indexOf('importIpsOrFhirAndUpdateIndex');
    assert.notEqual(methodOffset, -1, `${declarationFile} must retain importIpsOrFhirAndUpdateIndex`);
    const docStart = declaration.lastIndexOf('/**', methodOffset);
    const docEnd = declaration.lastIndexOf('*/', methodOffset);
    assert.ok(docStart >= 0 && docEnd > docStart, `${declarationFile} must document the declaration`);
    assert.match(
      declaration.slice(docStart, docEnd + 2),
      /@deprecated/,
      `${declarationFile} must deprecate its importIpsOrFhirAndUpdateIndex declaration`,
    );
  }
});

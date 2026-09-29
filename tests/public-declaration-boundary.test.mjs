// Flow contract: published Node declarations reference public package roots and compile in an isolated registry consumer.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

async function declarationFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? declarationFiles(path)
      : entry.name.endsWith('.d.ts') ? [path] : [];
  }));
  return nested.flat();
}

test('published declarations do not leak private SDK Core module paths', async () => {
  const files = await declarationFiles(fileURLToPath(new URL('../dist', import.meta.url)));
  const leaks = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (/from ["']gdc-sdk-core-ts\//.test(source) || /import\(["']gdc-sdk-core-ts\//.test(source)) {
      leaks.push(file);
    }
  }
  assert.deepEqual(leaks, []);
});

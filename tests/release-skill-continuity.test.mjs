// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('every repository skill preserves npm authorization continuity', async () => {
  const skillRoot = new URL('../.codex/skills/', import.meta.url);
  const skillDirectories = await readdir(skillRoot, { withFileTypes: true });

  for (const directory of skillDirectories.filter((entry) => entry.isDirectory())) {
    const source = await readFile(new URL(`${directory.name}/SKILL.md`, skillRoot), 'utf8');
    assert.match(source, /three.*attempts.*five\s+minutes/is, directory.name);
    assert.match(source, /npm pack.*tarball.*local.*test/is, directory.name);
    assert.match(source, /registry.*publish.*consumer.*merge.*deploy/is, directory.name);
  }
});

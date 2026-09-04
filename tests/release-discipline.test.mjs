// Flow contract: release instructions preserve branch-first publication and bounded local-tarball fallback without weakening final registry gates.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('release guidance keeps npm authorization work live and tarball validation provisional', async () => {
  const contracts = await Promise.all([
    readFile(new URL('../AGENTS.md', import.meta.url), 'utf8'),
    readFile(new URL('../.codex/skills/enforce-release-test-discipline/SKILL.md', import.meta.url), 'utf8'),
  ]);
  for (const contract of contracts) {
    assert.match(contract, /three.*attempts.*five\s+minutes/is);
    assert.match(contract, /npm pack.*tarball.*local.*test/is);
    assert.match(contract, /push.*branch.*npm publish.*verify.*merge.*main/is);
    assert.match(contract, /registry.*publish.*consumer.*merge.*deploy/is);
  }
});

// Flow contract: reusable profile persistence describes store semantics without naming a concrete infrastructure provider.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('profile lock persistence documentation remains storage-provider neutral', () => {
  const source = readFileSync(new URL('../src/server-profile-session.ts', import.meta.url), 'utf8');
  const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  const currentRelease = changelog.split('\n## 2.9.26')[1]?.split('\n## ')[0] || '';

  assert.match(source, /Durable store adapters receive an omitted/);
  assert.match(currentRelease, /Persistent store adapters therefore receive records without/);
  assert.doesNotMatch(currentRelease, /-backed profile stores/i);
});

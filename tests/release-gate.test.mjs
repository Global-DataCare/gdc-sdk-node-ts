// Flow contract: publishing the Node SDK cannot succeed unless the real local registration, Order, DCR, unlock and profile-open journey runs without a skip.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('prepublish executes the canonical live full-cycle wrapper', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(packageJson.scripts.prepublishOnly, /npm run test:e2e:live-full-cycle/);
});

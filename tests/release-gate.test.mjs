// Flow contract: publishing the Node SDK cannot succeed unless the real local registration, Order, DCR, unlock and profile-open journey runs without a skip.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('prepublish executes the canonical live full-cycle wrapper', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(packageJson.scripts.prepublishOnly, /npm run test:e2e:live-full-cycle/);
});

test('profile-runtime lifecycle enrolls its verified controller before protected cleanup', async () => {
  const liveSuite = await readFile(
    new URL('./live-gw-node-runtime.e2e.test.mjs', import.meta.url),
    'utf8',
  );
  const profileSuiteStart = liveSuite.indexOf('async function runLiveProfileRuntimeIndividualSuite()');
  const profileSuiteEnd = liveSuite.indexOf("'LIVE backend profile runtime individual-controller flow on GW'", profileSuiteStart);
  const profileSuite = liveSuite.slice(profileSuiteStart, profileSuiteEnd);
  const enrollment = profileSuite.indexOf('.enrollSelfIndividualController({');
  const disable = profileSuite.indexOf("profiler.run('profile-individual-disable'");

  assert.ok(enrollment >= 0, 'The profile-runtime live journey must execute real self-controller DCR enrollment.');
  assert.ok(disable > enrollment, 'Individual cleanup must run only after the controller has enrolled successfully.');
  assert.match(
    profileSuite,
    /\.setIdentifier\(registeredIdentity\.subjectDid\)/,
    'Lifecycle cleanup must target the subject DID returned by the real registration.',
  );
  assert.match(
    profileSuite,
    /bearerToken:\s*individualControllerIdToken/,
    'Lifecycle cleanup must retain the same verified owner-contact bearer used for enrollment.',
  );
});

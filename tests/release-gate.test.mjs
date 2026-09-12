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

test('individual lifecycle enrolls its verified owner before destructive cleanup', async () => {
  const liveSuite = await readFile(
    new URL('./live-gw-node-runtime.e2e.test.mjs', import.meta.url),
    'utf8',
  );
  const lifecycleStart = liveSuite.indexOf('async function runLiveIndividualLifecycleSuite()');
  const lifecycleEnd = liveSuite.indexOf('async function runLiveProfileRuntimeIndividualSuite()', lifecycleStart);
  const lifecycleSuite = liveSuite.slice(lifecycleStart, lifecycleEnd);
  const enrollment = lifecycleSuite.indexOf('.enrollSelfIndividualController({');
  const disable = lifecycleSuite.indexOf("profiler.run('individual-disable'");

  assert.ok(enrollment >= 0, 'The individual lifecycle must execute real self-controller DCR enrollment.');
  assert.ok(disable > enrollment, 'Destructive individual cleanup must run only after successful enrollment.');
  assert.match(
    lifecycleSuite,
    /const subjectDid = registeredIdentity\.subjectDid/,
    'The lifecycle must use the subject DID returned by its real registration.',
  );
  assert.match(
    lifecycleSuite,
    /bearerToken:\s*individualControllerIdToken/,
    'Destructive lifecycle calls must retain the verified owner-contact bearer.',
  );
});

test('standalone individual live journeys enroll the registered member before protected work', async () => {
  for (const file of [
    'live-profile-runtime-individual.e2e.test.mjs',
    'live-dialogue-consent-professional-access.e2e.test.mjs',
  ]) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    const enrollment = source.indexOf('.enrollSelfIndividualController({');
    const ingestion = source.indexOf('ingestCommunicationAndUpdateIndex(');

    assert.ok(enrollment >= 0, `${file} must perform real self-controller DCR enrollment.`);
    assert.ok(ingestion > enrollment, `${file} must enroll before protected clinical ingestion.`);
    assert.match(
      source,
      /registeredIdentity = individualStart\.identity/,
      `${file} must consume the identity returned by its real registration.`,
    );
    assert.match(
      source,
      /actorDid:\s*registeredIdentity\.controllerActorDid/,
      `${file} must authenticate protected calls as the registered member DID.`,
    );
    assert.match(
      source,
      /subject(?:Did)?:\s*registeredIdentity\.subjectDid/,
      `${file} must target the exact registered subject DID.`,
    );
  }
});

test('clean full-cycle defaults to GW VET and connect ICA while preserving explicit overrides', async () => {
  const runner = await readFile(
    new URL('../scripts/run-live-101-full-cycle-clean.sh', import.meta.url),
    'utf8',
  );

  assert.match(runner, /GW_DIR="\$\{GW_DIR_OVERRIDE:-\$\{WORKSPACE_DIR\}\/custom\/vet-gw-clinic-booking\}"/);
  assert.match(runner, /ICA_DIR="\$\{ICA_DIR_OVERRIDE:-\$\{WORKSPACE_DIR\}\/connect-ica-ts\}"/);
  assert.match(runner, /GW_ENV_FILE="\$\{GW_ENV_FILE:-\$\{GW_DIR\}\/env\.local-demo\.example\}"/);
  assert.match(runner, /SUITE_SECTOR="\$\{SECTOR:-animal-care\}"/);
  assert.match(runner, /SUITE_EMPLOYEE_ROLE="\$\{EMPLOYEE_ROLE:-ISCO-08\|2250\}"/);
  assert.match(runner, /ICA_KNOWN_CERTS_AUTO_DOWNLOAD="\$\{ICA_KNOWN_CERTS_AUTO_DOWNLOAD:-true\}"/);
  assert.match(runner, /DID_WEB_DOMAIN="\$\{DID_WEB_DOMAIN:-127\.0\.0\.1:\$\{ICA_PORT\}\}"/);
  assert.doesNotMatch(runner, /ICA_DIR=.*dataspace-ica-ts/);
  assert.match(
    runner,
    /ICA_SUPPORTED_JURISDICTIONS_VALUE="\$\{ICA_SUPPORTED_JURISDICTIONS:-\$\{JURISDICTION:-ES\}\}"/,
    'The ICA process must accept the same route jurisdiction selected by the live journey.',
  );
  assert.match(
    runner,
    /ICA_SUPPORTED_JURISDICTIONS="\$\{ICA_SUPPORTED_JURISDICTIONS_VALUE\}"/,
    'The clean runner must pass its resolved jurisdiction policy into connect ICA explicitly.',
  );
  assert.match(
    runner,
    /GW_ICA_JURISDICTION_VALUE="\$\{GW_ICA_JURISDICTION_OVERRIDE:-\$\{JURISDICTION:-ES\}\}"/,
    'The selected GW must use the live route jurisdiction unless explicitly overridden.',
  );
});

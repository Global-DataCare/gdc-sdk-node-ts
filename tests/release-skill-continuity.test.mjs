// Flow contract: follow docs/LOCAL_FIRST_RELEASE_CONTRACT.md; start red, reuse canonical versioned-data/common-utils fixtures, and never duplicate governed literals.
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
    assert.match(source, /do not attempt.*npm publish.*every affected local.*unit.*integration.*local services.*real UI.*Playwright/is, directory.name);
    assert.match(source, /authorization failure.*never stop.*test.*stage/is, directory.name);
    assert.match(source, /immutable.*tarball.*--no-save.*pushed but unmerged branches/is, directory.name);
    assert.match(source, /resume only the smallest failed gate.*do not repeat a green\s+gate/is, directory.name);
    assert.match(source, /exact registry version.*minimal\s+install\/export smoke.*do not repeat/is, directory.name);
    assert.match(source, /blocks only.*consumer merge.*image build.*local-network.*test-network.*network/is, directory.name);
    assert.match(source, /gateway.*exact registry version.*image.*local-network.*portal.*tarball.*local-network.*exact registry version.*staging/is, directory.name);
    assert.match(source, /first line.*Flow contract.*versioned domain data package.*common-utils.*no duplicated literals/is, directory.name);
    assert.match(source, /reuse.*types.*HL7.*LOINC.*SNOMED.*ICD-10.*WHO ATC.*Schema\.org.*before.*invent/is, directory.name);
    assert.match(source, /types.*versioned domain data package.*common-utils.*shared package/is, directory.name);
    assert.match(source, /docs\/LOCAL_FIRST_RELEASE_CONTRACT\.md/is, directory.name);
  }
});

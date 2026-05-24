import test from 'node:test';
import assert from 'node:assert/strict';

import { GDC_SDK_NODE_STATUS } from '../dist/index.js';

test('gdc-sdk-node-ts exposes its migration target status', () => {
  assert.deepEqual(GDC_SDK_NODE_STATUS, {
    packageName: 'gdc-sdk-node-ts',
    dependsOnCorePackage: 'gdc-sdk-core-ts',
    legacySourcePackages: [],
    status: 'bootstrap',
  });
});

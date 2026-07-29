import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BundleEditor,
  toClinicalResourceCardView,
} from '../dist/index.js';

test('Node SDK exposes the canonical coded clinical authoring/display surface', () => {
  assert.equal(typeof BundleEditor, 'function');
  assert.equal(typeof toClinicalResourceCardView, 'function');
});

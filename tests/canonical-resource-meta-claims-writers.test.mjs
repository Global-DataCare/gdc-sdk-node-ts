// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const propertyName = (node) => node && (ts.isIdentifier(node) || ts.isStringLiteral(node)) ? node.text : undefined;
const hasProperty = (object, name) => object.properties.some((property) => propertyName(property.name) === name);
const sourceFiles = (root) => fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
  const resolved = path.join(root, entry.name);
  return entry.isDirectory() ? sourceFiles(resolved) : (/\.ts$/.test(entry.name) ? [resolved] : []);
});
const isDirectBundleArrayEntry = (object) => {
  let current = object;
  while (current.parent && !ts.isSourceFile(current.parent)) {
    if (ts.isArrayLiteralExpression(current.parent)) {
      const arrayProperty = current.parent.parent;
      return ts.isPropertyAssignment(arrayProperty)
        && (propertyName(arrayProperty.name) === 'data' || propertyName(arrayProperty.name) === 'entry');
    }
    if (ts.isObjectLiteralExpression(current.parent)) return false;
    current = current.parent;
  }
  return false;
};
const isBundleEntryWriter = (object) => isDirectBundleArrayEntry(object)
  || hasProperty(object, 'request')
  || hasProperty(object, 'response')
  || (hasProperty(object, 'type') && hasProperty(object, 'resource'));

test('governed SDK Node writers never author entry.meta.claims', () => {
  const violations = [];
  for (const file of sourceFiles(path.resolve('src'))) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = (node) => {
      if (ts.isObjectLiteralExpression(node) && isBundleEntryWriter(node)) {
        const legacyMeta = node.properties.find((property) => ts.isPropertyAssignment(property)
          && propertyName(property.name) === 'meta'
          && ts.isObjectLiteralExpression(property.initializer)
          && hasProperty(property.initializer, 'claims'));
        if (legacyMeta) {
          const location = source.getLineAndCharacterOfPosition(legacyMeta.getStart(source));
          violations.push(`${path.relative(process.cwd(), file)}:${location.line + 1}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  assert.deepEqual(violations, []);
});

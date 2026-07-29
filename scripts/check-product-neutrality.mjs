import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ignoredDirectories = new Set(['.git', 'build', 'coverage', 'dist', 'node_modules']);
const inspectedExtensions = new Set([
  '.cjs', '.js', '.json', '.md', '.mjs', '.ts', '.tsx', '.txt', '.yaml', '.yml',
]);
const forbidden = [
  new RegExp(`\\b${['U', 'HC'].join('')}\\b`, 'i'),
  new RegExp(`\\b${['U', 'NID'].join('')}\\b`, 'i'),
  new RegExp(['Universal', 'Health', 'Chain'].join('[- ]'), 'i'),
];
const failures = [];

function inspect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      inspect(absolute);
      continue;
    }
    if (!inspectedExtensions.has(path.extname(entry.name))) continue;
    const relative = path.relative(root, absolute);
    fs.readFileSync(absolute, 'utf8').split(/\r?\n/).forEach((line, index) => {
      if (forbidden.some((pattern) => pattern.test(line))) failures.push(`${relative}:${index + 1}`);
    });
  }
}

inspect(root);
if (failures.length) {
  console.error(`Shared GDC packages must remain product-neutral:\n${failures.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Product-neutrality contract OK.');
}

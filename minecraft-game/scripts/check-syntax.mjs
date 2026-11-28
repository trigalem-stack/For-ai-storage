import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(full, files);
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
      files.push(full);
    }
  }
  return files;
}

const files = [
  ...walk(path.join(ROOT, 'src')),
  ...walk(path.join(ROOT, 'scripts')),
  path.join(ROOT, 'sw.js'),
];

for (const file of files) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}

console.log(`Syntax OK for ${files.length} JS/MJS files.`);

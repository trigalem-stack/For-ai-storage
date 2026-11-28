import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const INDEX_PATH = path.join(ROOT, 'index.html');
const CSS_PATH = path.join(ROOT, 'styles.css');
const ENTRY_PATH = path.join(ROOT, 'src', 'main.js');
const VENDOR_THREE_PATH = path.join(ROOT, 'vendor', 'three.module.min.js');
const OUT_PATH = path.join(ROOT, 'minecraft-offline.html');

function escapeClosingScript(code) {
  return code.replace(/<\/(script)/gi, '<\\/$1');
}

async function bundleWithEsbuild() {
  const esbuild = await import('esbuild');
  const result = await esbuild.build({
    entryPoints: [ENTRY_PATH],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    minify: false,
    write: false,
  });
  return result.outputFiles[0].text;
}

/**
 * Zero-dependency pure Node.js ESM-to-IIFE fallback bundler.
 * Ensures `node scripts/build-offline.mjs` still works even without `node_modules`.
 */
function bundlePureNode() {
  const threeCode = fs.readFileSync(VENDOR_THREE_PATH, 'utf8');
  const threeExportMatch = threeCode.match(/export\s*\{([\s\S]*?)\}\s*;?\s*(\/\*[\s\S]*?\*\/)?\s*$/);
  if (!threeExportMatch) {
    throw new Error('Pure-Node fallback could not locate export block in vendor/three.module.min.js');
  }
  const threeExportBody = threeExportMatch[1]
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^([$\w]+)\s+as\s+([$\w]+)$/);
      return m ? `${m[2]}:${m[1]}` : `${part}:${part}`;
    })
    .join(',');
  const threeBody = threeCode.slice(0, threeExportMatch.index);
  const threeFactory = `const __THREE__ = (function(){\n${threeBody}\nreturn {${threeExportBody}};\n})();\n`;

  const visited = new Set();
  const orderedModules = [];

  function collect(filePath) {
    const abs = path.resolve(filePath);
    if (visited.has(abs)) return;
    visited.add(abs);
    if (abs === path.resolve(VENDOR_THREE_PATH)) return;

    const src = fs.readFileSync(abs, 'utf8');
    const importRegex = /^import\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"];?/gm;
    let match;
    while ((match = importRegex.exec(src)) !== null) {
      const rel = match[1];
      const depPath = path.resolve(path.dirname(abs), rel);
      collect(depPath);
    }
    orderedModules.push({ abs, src });
  }

  collect(ENTRY_PATH);

  const chunks = [threeFactory, 'const __MODS__ = {};\n'];
  for (const mod of orderedModules) {
    const id = path.relative(ROOT, mod.abs).replace(/\\/g, '/');
    const exportedNames = new Set();

    let transformed = mod.src.replace(
      /^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?\s*$/gm,
      (_, clause, spec) => {
        const depAbs = path.resolve(path.dirname(mod.abs), spec);
        const depExpr = depAbs === path.resolve(VENDOR_THREE_PATH)
          ? '__THREE__'
          : `__MODS__[${JSON.stringify(path.relative(ROOT, depAbs).replace(/\\/g, '/'))}]`;
        const trimmed = clause.trim();
        if (trimmed.startsWith('* as ')) {
          const alias = trimmed.slice(5).trim();
          return `const ${alias} = ${depExpr};`;
        }
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
          const inner = trimmed.slice(1, -1).replace(/\s+as\s+/g, ': ');
          return `const { ${inner} } = ${depExpr};`;
        }
        return `const ${trimmed} = ${depExpr};`;
      }
    );

    transformed = transformed
      .replace(/^export\s+(const|let|var)\s+([$\w]+)/gm, (_, kw, name) => {
        exportedNames.add(name);
        return `${kw} ${name}`;
      })
      .replace(/^export\s+function\s+([$\w]+)/gm, (_, name) => {
        exportedNames.add(name);
        return `function ${name}`;
      })
      .replace(/^export\s+class\s+([$\w]+)/gm, (_, name) => {
        exportedNames.add(name);
        return `class ${name}`;
      });

    const retObj = Array.from(exportedNames).join(', ');
    chunks.push(
      `__MODS__[${JSON.stringify(id)}] = (function(){\n${transformed}\nreturn { ${retObj} };\n})();\n`
    );
  }

  return `(function(){\n'use strict';\n${chunks.join('\n')}\n})();\n`;
}

async function main() {
  const indexHtml = fs.readFileSync(INDEX_PATH, 'utf8');
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  const forcePureNode = process.argv.includes('--pure-node');

  let jsBundle;
  let bundlerUsed = 'esbuild';
  if (forcePureNode) {
    bundlerUsed = 'pure-node-fallback';
    jsBundle = bundlePureNode();
  } else {
    try {
      jsBundle = await bundleWithEsbuild();
    } catch {
      bundlerUsed = 'pure-node-fallback';
      jsBundle = bundlePureNode();
    }
  }

  let offlineHtml = indexHtml
    // Remove external manifest link (not needed in standalone single-file HTML)
    .replace(/<link\s+rel=["']manifest["'][^>]*>\s*/i, '')
    // Inline stylesheet
    .replace(
      /<link\s+rel=["']stylesheet["']\s+href=["']\.\/styles\.css["']\s*>/i,
      () => `<style>\n${css}\n</style>`
    )
    // Inline bundled JS (classic IIFE script so it also works over file:// without CORS)
    .replace(
      /<script\s+type=["']module["']\s+src=["']\.\/src\/main\.js["']\s*><\/script>/i,
      () => `<script>\n${escapeClosingScript(jsBundle)}\n</script>`
    );

  // Verify zero external HTTP(S) scripts or stylesheets
  const externalRefCheck = offlineHtml.match(/<(?:script|link)[^>]+(?:src|href)=["']https?:\/\//gi);
  if (externalRefCheck) {
    throw new Error(`Found disallowed external links in offline build: ${externalRefCheck.join(', ')}`);
  }

  fs.writeFileSync(OUT_PATH, offlineHtml, 'utf8');
  const sizeKb = (Buffer.byteLength(offlineHtml, 'utf8') / 1024).toFixed(1);
  console.log(`Built ${path.relative(ROOT, OUT_PATH)} (${sizeKb} KB) using ${bundlerUsed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

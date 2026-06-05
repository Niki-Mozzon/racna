#!/usr/bin/env node
import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = resolve(ROOT, 'dist');
const SRC = resolve(ROOT, 'src');
const PUBLIC = resolve(ROOT, 'public');

const isDev = process.env.NODE_ENV === 'development';

const ENTRY_POINTS = [
  { in: resolve(SRC, 'interceptor/index.ts'), out: 'interceptor' },
  { in: resolve(SRC, 'overlay/index.ts'), out: 'overlay' },
  { in: resolve(SRC, 'popup/index.ts'), out: 'popup/popup' },
];

async function clean() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
}

async function bundle() {
  const start = performance.now();
  await build({
    entryPoints: ENTRY_POINTS,
    outdir: DIST,
    bundle: true,
    format: 'iife',
    target: ['chrome120'],
    sourcemap: isDev ? 'linked' : false,
    minify: false,
    logLevel: 'info',
    treeShaking: true,
    legalComments: 'none',
  });
  const ms = Math.round(performance.now() - start);
  console.log(`✓ bundled in ${ms}ms`);
}

async function copyStaticAssets() {
  // manifest.json
  await cp(resolve(PUBLIC, 'manifest.json'), resolve(DIST, 'manifest.json'));

  // Sync version from package.json into manifest.json
  const pkg = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf-8'));
  const manifest = JSON.parse(await readFile(resolve(DIST, 'manifest.json'), 'utf-8'));
  manifest.version = pkg.version;
  await writeFile(resolve(DIST, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  // popup HTML/CSS (the JS is bundled by esbuild into dist/popup/popup.js)
  await mkdir(resolve(DIST, 'popup'), { recursive: true });
  for (const file of ['popup.html', 'popup.css']) {
    await cp(resolve(SRC, 'popup', file), resolve(DIST, 'popup', file));
  }

  // icons
  await mkdir(resolve(DIST, 'icons'), { recursive: true });
  for (const file of ['icon16.png', 'icon48.png', 'icon128.png']) {
    await cp(resolve(ROOT, 'icons', file), resolve(DIST, 'icons', file));
  }

  console.log('✓ static assets copied to dist/');
}

async function main() {
  await clean();
  await bundle();
  await copyStaticAssets();
  console.log(`✓ build complete → ${DIST}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

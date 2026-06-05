#!/usr/bin/env node
import { context } from 'esbuild';
import { cp, mkdir, readFile, rm, watch, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = resolve(ROOT, 'dist');
const SRC = resolve(ROOT, 'src');
const PUBLIC = resolve(ROOT, 'public');

process.env.NODE_ENV = 'development';

const ENTRY_POINTS = [
  { in: resolve(SRC, 'interceptor/index.ts'), out: 'interceptor' },
  { in: resolve(SRC, 'overlay/index.ts'), out: 'overlay' },
  { in: resolve(SRC, 'popup/index.ts'), out: 'popup/popup' },
];

async function clean() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
}

async function copyStaticAssets() {
  await cp(resolve(PUBLIC, 'manifest.json'), resolve(DIST, 'manifest.json'));
  const pkg = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf-8'));
  const manifest = JSON.parse(await readFile(resolve(DIST, 'manifest.json'), 'utf-8'));
  manifest.version = pkg.version;
  await writeFile(resolve(DIST, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  await mkdir(resolve(DIST, 'popup'), { recursive: true });
  for (const file of ['popup.html', 'popup.css']) {
    await cp(resolve(SRC, 'popup', file), resolve(DIST, 'popup', file));
  }

  await mkdir(resolve(DIST, 'icons'), { recursive: true });
  for (const file of ['icon16.png', 'icon48.png', 'icon128.png']) {
    await cp(resolve(ROOT, 'icons', file), resolve(DIST, 'icons', file));
  }
}

async function watchStaticAssets() {
  const dirs = [PUBLIC, resolve(SRC, 'popup'), resolve(ROOT, 'icons')];
  for (const dir of dirs) {
    (async () => {
      try {
        for await (const event of watch(dir, { recursive: true })) {
          console.log(`[asset] ${event.eventType}: ${event.filename ?? '(unknown)'}`);
          try {
            await copyStaticAssets();
            console.log('✓ static assets re-copied');
          } catch (err) {
            console.error('static asset copy failed:', err);
          }
        }
      } catch (err) {
        console.error(`watch failed for ${dir}:`, err);
      }
    })();
  }
}

async function main() {
  await clean();
  await copyStaticAssets();

  const ctx = await context({
    entryPoints: ENTRY_POINTS,
    outdir: DIST,
    bundle: true,
    format: 'iife',
    target: ['chrome120'],
    sourcemap: 'linked',
    minify: false,
    logLevel: 'info',
    treeShaking: true,
    legalComments: 'none',
  });

  await ctx.watch();
  console.log('▶ esbuild watching for changes…');
  watchStaticAssets();

  // Keep process alive
  process.on('SIGINT', async () => {
    await ctx.dispose();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

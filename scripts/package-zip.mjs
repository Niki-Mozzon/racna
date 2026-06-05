#!/usr/bin/env node
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDeflateRaw } from 'node:zlib';
import { Buffer } from 'node:buffer';

// Minimal STORE/DEFLATE ZIP writer with no external dep; produces CWS-ready zips
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = resolve(ROOT, 'dist');

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (e.isFile()) {
      files.push(full);
    }
  }
  return files;
}

function crc32(buf) {
  let c;
  const table =
    crc32.table ??
    (crc32.table = (() => {
      const t = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let k = n;
        for (let i = 0; i < 8; i++) k = k & 1 ? 0xedb88320 ^ (k >>> 1) : k >>> 1;
        t[n] = k;
      }
      return t;
    })());
  c = 0xffffffff;
  for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function deflate(buf) {
  return new Promise((resolveDeflate, reject) => {
    const chunks = [];
    const z = createDeflateRaw({ level: 9 });
    z.on('data', (c) => chunks.push(c));
    z.on('end', () => resolveDeflate(Buffer.concat(chunks)));
    z.on('error', reject);
    z.end(buf);
  });
}

async function makeZip(files, zipPath) {
  const out = createWriteStream(zipPath);
  const records = [];
  let offset = 0;

  function write(buf) {
    out.write(buf);
    offset += buf.length;
  }

  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf-8');
    const crc = crc32(data);
    const uncompressed = data.length;
    const compressed = await deflate(data);

    // Local file header
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(8, 8); // method = deflate
    localHeader.writeUInt16LE(0, 10); // mtime
    localHeader.writeUInt16LE(0, 12); // mdate
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(uncompressed, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length

    const recordOffset = offset;
    write(localHeader);
    write(nameBuf);
    write(compressed);

    records.push({ name: nameBuf, crc, compressed: compressed.length, uncompressed, recordOffset });
  }

  // Central directory
  const centralStart = offset;
  for (const r of records) {
    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4); // version made by
    cdh.writeUInt16LE(20, 6); // version needed
    cdh.writeUInt16LE(0, 8); // flags
    cdh.writeUInt16LE(8, 10); // method
    cdh.writeUInt16LE(0, 12);
    cdh.writeUInt16LE(0, 14);
    cdh.writeUInt32LE(r.crc, 16);
    cdh.writeUInt32LE(r.compressed, 20);
    cdh.writeUInt32LE(r.uncompressed, 24);
    cdh.writeUInt16LE(r.name.length, 28);
    cdh.writeUInt16LE(0, 30);
    cdh.writeUInt16LE(0, 32);
    cdh.writeUInt16LE(0, 34);
    cdh.writeUInt16LE(0, 36);
    cdh.writeUInt32LE(0, 38); // external attrs
    cdh.writeUInt32LE(r.recordOffset, 42);
    write(cdh);
    write(r.name);
  }
  const centralSize = offset - centralStart;

  // End of central dir
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(records.length, 8);
  eocd.writeUInt16LE(records.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralStart, 16);
  eocd.writeUInt16LE(0, 20);
  write(eocd);

  await new Promise((resolveClose, reject) => {
    out.end((err) => (err ? reject(err) : resolveClose()));
  });
}

async function main() {
  try {
    await stat(DIST);
  } catch {
    console.error(`dist/ not found, run \`npm run build\` first`);
    process.exit(1);
  }

  const pkg = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf-8'));
  const version = pkg.version;
  const outDir = resolve(ROOT, 'releases');
  await mkdir(outDir, { recursive: true });
  const zipPath = join(outDir, `racna-${version}.zip`);

  const filePaths = await walk(DIST);
  filePaths.sort();
  const files = await Promise.all(
    filePaths.map(async (p) => ({
      name: relative(DIST, p).replace(/\\/g, '/'),
      data: await readFile(p),
    })),
  );

  await makeZip(files, zipPath);
  const { size } = await stat(zipPath);
  console.log(`✓ ${zipPath} (${(size / 1024).toFixed(1)} KB, ${files.length} files)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

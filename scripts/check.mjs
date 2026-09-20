import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
async function collect(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(file);
    else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) files.push(file);
  }
}
await collect(path.join(root, 'src'));
await collect(path.join(root, 'scripts'));
await collect(path.join(root, 'tests'));
files.push(path.join(root, 'playwright.config.js'));
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
}

const catalogPath = path.join(root, 'src', 'data', 'catalog.json');
const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.series) || !Array.isArray(catalog.videos))
  throw new Error('src/data/catalog.json must use schemaVersion 1 with series and videos arrays.');
const seriesIds = new Set();
for (const record of catalog.series) {
  if (!/^\d{1,12}$/.test(record?.id) || typeof record.title !== 'string' || !record.title.trim())
    throw new Error('Each bundled series needs a numeric string id and a nonempty title.');
  if (seriesIds.has(record.id)) throw new Error(`Duplicate bundled series id: ${record.id}`);
  if (
    record.lastKnownVideoCount != null &&
    (!Number.isInteger(record.lastKnownVideoCount) || record.lastKnownVideoCount < 0)
  )
    throw new Error(`Invalid lastKnownVideoCount for bundled series ${record.id}.`);
  seriesIds.add(record.id);
}
const videoIds = new Set();
for (const record of catalog.videos) {
  if (
    !/^\d{1,12}$/.test(record?.id) ||
    typeof record.title !== 'string' ||
    !record.title.trim() ||
    typeof record.href !== 'string' ||
    !record.href.startsWith('/player?')
  )
    throw new Error('Each bundled video needs a numeric string id, a nonempty title, and a /player URL.');
  if (videoIds.has(record.id)) throw new Error(`Duplicate bundled video id: ${record.id}`);
  if (record.seriesId != null && !seriesIds.has(record.seriesId))
    throw new Error(`Bundled video ${record.id} refers to missing series ${record.seriesId}.`);
  videoIds.add(record.id);
}
console.log(`Syntax checks passed for ${files.length} JavaScript files.`);
console.log(`Catalog data passed for ${seriesIds.size} series and ${videoIds.size} videos.`);

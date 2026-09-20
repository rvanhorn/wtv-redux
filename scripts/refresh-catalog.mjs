import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOME_DATA_MAX_CHARS, HOME_DATA_PATH, HOME_DATA_TIMEOUT_MS, SERIES_TIMEOUT } from '../src/constants.js';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const defaultCatalogPath = path.join(root, 'src', 'data', 'catalog.json');
export const SITE_ORIGIN = 'https://www.warhammertv.com';
const SERIES_DATA_ROUTE = 'routes/$';
const MAX_CONCURRENT_SERIES_REQUESTS = 2;

// The app modules read `location.origin` and `window.location` inside their functions, never at
// import time. This stub gives them the site origin so the same normalizers parse the seed.
globalThis.location ??= new URL(SITE_ORIGIN);
globalThis.window ??= globalThis;
const { findFeedPayload, normalizeHomeData } = await import('../src/api/normalize.js');
const { normalizeSeriesPayload } = await import('../src/api/series.js');
const { isExcludedSeriesId } = await import('../src/utils/url.js');

function isSourceId(value) {
  return /^\d{1,12}$/.test(String(value ?? ''));
}

function compareIds(left, right) {
  return left.length - right.length || (left < right ? -1 : left > right ? 1 : 0);
}

async function fetchJson(fetchImplementation, url, timeoutMilliseconds) {
  const response = await fetchImplementation(url, {
    method: 'GET',
    redirect: 'error',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMilliseconds),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (Number(response.headers.get('content-length')) > HOME_DATA_MAX_CHARS) throw new Error('Response too large');
  if (!/\bjson\b/i.test(response.headers.get('content-type') || ''))
    throw new Error('The endpoint did not return JSON');
  const body = await response.text();
  if (body.length > HOME_DATA_MAX_CHARS) throw new Error('Response too large');
  const payload = findFeedPayload(JSON.parse(body));
  if (!payload) throw new Error('The response holds no catalog feeds');
  return payload;
}

async function readCatalog(catalogPath) {
  try {
    return JSON.parse(await fs.readFile(catalogPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { schemaVersion: 1, updatedAt: '', series: [], videos: [] };
    throw error;
  }
}

async function mapWithLimit(values, limit, task) {
  const results = Array.from({ length: values.length });
  let next = 0;
  async function worker() {
    while (next < values.length) {
      const index = next++;
      results[index] = await task(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

function seriesRecord(id, result, homeItem, existing) {
  const releaseDate = result.releaseDate || homeItem?.releaseDate || existing?.releaseDate || '';
  const year = result.year ?? homeItem?.year ?? existing?.year ?? null;
  return {
    id,
    title: result.item.title,
    lastKnownVideoCount: result.count,
    videoCountIsExact: result.partial !== true,
    ...(releaseDate ? { releaseDate } : {}),
    ...(year != null ? { year } : {}),
  };
}

function summarizeChanges(previous, next) {
  const previousSeries = new Map(previous.series.map((record) => [record.id, record]));
  const nextSeries = new Map(next.series.map((record) => [record.id, record]));
  const added = [...nextSeries.keys()].filter((id) => !previousSeries.has(id));
  const removed = [...previousSeries.keys()].filter((id) => !nextSeries.has(id));
  const changed = [...nextSeries.keys()].filter(
    (id) => previousSeries.has(id) && JSON.stringify(previousSeries.get(id)) !== JSON.stringify(nextSeries.get(id)),
  );
  const label = (map, id) => `${id} (${map.get(id).title})`;
  return {
    added: added.map((id) => label(nextSeries, id)),
    removed: removed.map((id) => label(previousSeries, id)),
    changed: changed.map((id) => label(nextSeries, id)),
  };
}

/**
 * Rebuilds the bundled catalog seed from the public Warhammer TV JSON routes.
 *
 * The homepage names a few series directly and links every listed episode to its series. Each
 * series page is then fetched, so every series known to the homepage, to an episode, or to the
 * previous seed keeps a verified title, video count, and year. Videos stay out of the seed: their
 * player links carry autoplay chains that change whenever an episode is added anywhere, and the
 * app learns them from the live site when a series is opened. A series whose page no longer
 * describes a series is dropped and reported. Any failed request aborts the run before the file
 * is written, so the seed is never partially replaced.
 *
 * @returns {Promise<{ written: boolean, catalog: object, dropped: string[], summary: object }>}
 */
export async function refreshCatalog({
  fetch: fetchImplementation = globalThis.fetch,
  catalogPath = defaultCatalogPath,
  now = () => new Date(),
  log = console.log,
} = {}) {
  const previous = await readCatalog(catalogPath);
  const home = normalizeHomeData(
    await fetchJson(fetchImplementation, `${SITE_ORIGIN}${HOME_DATA_PATH}`, HOME_DATA_TIMEOUT_MS),
  );
  const homeSeries = new Map(
    home.items
      .filter((item) => item.type === 'Series' && isSourceId(item.sourceId))
      .map((item) => [item.sourceId, item]),
  );
  const existingSeries = new Map(previous.series.map((record) => [String(record.id), record]));
  const seriesIds = [
    ...new Set([
      ...homeSeries.keys(),
      ...home.items.filter((item) => item.type === 'Episode').map((item) => item.parentSeriesId),
      ...existingSeries.keys(),
    ]),
  ]
    .filter((id) => isSourceId(id) && !isExcludedSeriesId(id))
    .sort(compareIds);

  const results = await mapWithLimit(seriesIds, MAX_CONCURRENT_SERIES_REQUESTS, async (id) => {
    const existing = existingSeries.get(id);
    const item = homeSeries.get(id) || {
      id: `series:${id}`,
      sourceId: id,
      type: 'Series',
      title: existing?.title || `Series ${id}`,
      href: `${SITE_ORIGIN}/series/${id}`,
      releaseDate: existing?.releaseDate || '',
      year: existing?.year ?? null,
    };
    const url = `${SITE_ORIGIN}/series/${id}?_data=${encodeURIComponent(SERIES_DATA_ROUTE)}`;
    let payload;
    try {
      payload = await fetchJson(fetchImplementation, url, SERIES_TIMEOUT);
    } catch (error) {
      throw new Error(`Series ${id} could not be fetched: ${error.message}`, { cause: error });
    }
    return { id, item, existing, result: normalizeSeriesPayload(payload, item) };
  });

  const series = [];
  const dropped = [];
  for (const { id, item, existing, result } of results) {
    if (!result.usable) {
      dropped.push(`${id} (${item.title})`);
      continue;
    }
    series.push(seriesRecord(id, result, homeSeries.get(id), existing));
  }

  const next = { schemaVersion: 1, updatedAt: previous.updatedAt || '', series, videos: [] };
  const summary = summarizeChanges(previous, next);
  const unchanged = JSON.stringify(previous.series) === JSON.stringify(series) && !previous.videos?.length;
  if (!unchanged) {
    next.updatedAt = now().toISOString();
    await fs.writeFile(catalogPath, `${JSON.stringify(next, null, 2)}\n`);
  }

  log(`Fetched ${seriesIds.length} series pages; kept ${series.length} series.`);
  for (const entry of summary.added) log(`  added   ${entry}`);
  for (const entry of summary.removed) log(`  removed ${entry}`);
  for (const entry of summary.changed) log(`  changed ${entry}`);
  for (const entry of dropped) log(`  dropped ${entry}: the series page no longer describes a series`);
  log(unchanged ? 'The bundled catalog is unchanged.' : `Wrote ${path.relative(root, catalogPath)}.`);
  return { written: !unchanged, catalog: next, dropped, summary };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await refreshCatalog();
  } catch (error) {
    console.error(`[catalog:refresh] ${error.message}`);
    process.exit(1);
  }
}

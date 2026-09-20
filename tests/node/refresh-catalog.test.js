import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { refreshCatalog } from '../../scripts/refresh-catalog.mjs';
import { homePayload, paintingDeskPayload, seriesPayload } from '../browser/fixtures.js';

const quietLog = () => {};
const previousSeed = {
  schemaVersion: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
  series: [
    { id: '25751', title: 'Painting Desk', lastKnownVideoCount: 20, videoCountIsExact: false },
    { id: '303', title: 'Gone Series', lastKnownVideoCount: 4, videoCountIsExact: true },
  ],
  videos: [],
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

function fakeFetch(seriesResponses) {
  return async (url) => {
    const { pathname, searchParams } = new URL(url);
    if (pathname === '/' && searchParams.get('_data') === 'routes/_index') return jsonResponse(homePayload);
    const id = pathname.match(/^\/series\/(\d+)$/)?.[1];
    if (id && searchParams.get('_data') === 'routes/$' && id in seriesResponses) return seriesResponses[id]();
    return new Response('not found', { status: 404 });
  };
}

async function temporaryCatalog(context, seed = previousSeed) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wtv-catalog-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const catalogPath = path.join(directory, 'catalog.json');
  await fs.writeFile(catalogPath, JSON.stringify(seed));
  return catalogPath;
}

test('rebuilds the seed from the homepage, the previous seed, and each series page', async (context) => {
  const catalogPath = await temporaryCatalog(context);
  const fetch = fakeFetch({
    101: () => jsonResponse(seriesPayload),
    25751: () => jsonResponse(paintingDeskPayload),
    303: () => jsonResponse({ serverLoadedFeeds: [] }),
  });

  const first = await refreshCatalog({
    fetch,
    catalogPath,
    now: () => new Date('2026-09-20T12:00:00Z'),
    log: quietLog,
  });
  const written = JSON.parse(await fs.readFile(catalogPath, 'utf8'));

  assert.equal(first.written, true);
  assert.equal(written.updatedAt, '2026-09-20T12:00:00.000Z');
  assert.deepEqual(written.videos, []);
  assert.deepEqual(written.series, [
    {
      id: '101',
      title: 'Example Series',
      lastKnownVideoCount: 2,
      videoCountIsExact: true,
      releaseDate: '2025-01-10',
      year: 2025,
    },
    { id: '25751', title: 'Painting Desk', lastKnownVideoCount: 26, videoCountIsExact: true, year: 2025 },
  ]);
  assert.deepEqual(first.dropped, ['303 (Gone Series)']);
  assert.deepEqual(first.summary.added, ['101 (Example Series)']);

  const second = await refreshCatalog({
    fetch,
    catalogPath,
    now: () => new Date('2026-09-21T12:00:00Z'),
    log: quietLog,
  });
  assert.equal(second.written, false);
  assert.equal(JSON.parse(await fs.readFile(catalogPath, 'utf8')).updatedAt, '2026-09-20T12:00:00.000Z');
});

test('leaves the seed untouched when a series page cannot be fetched', async (context) => {
  const catalogPath = await temporaryCatalog(context);
  const fetch = fakeFetch({
    101: () => jsonResponse({ message: 'Unexpected Server Error' }, 500),
    25751: () => jsonResponse(paintingDeskPayload),
    303: () => jsonResponse(paintingDeskPayload),
  });

  await assert.rejects(
    refreshCatalog({ fetch, catalogPath, log: quietLog }),
    /Series 101 could not be fetched: HTTP 500/,
  );
  assert.deepEqual(JSON.parse(await fs.readFile(catalogPath, 'utf8')), previousSeed);
});

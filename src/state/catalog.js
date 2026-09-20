import bundledCatalog from '../data/catalog.json';
import { imageHref, isExcludedSeriesHref, isExcludedSeriesId, stableItemId } from '../utils/url.js';

const DATABASE_NAME = 'whtv-redux-catalog';
const DATABASE_VERSION = 1;
const SERIES_STORE = 'series';
const VIDEO_STORE = 'videos';
const MAX_SERIES = 500;
const MAX_VIDEOS = 10000;
const MAX_KEYWORDS = 20;
const JSON_DATA_SOURCES = new Set(['homepage-json', 'series-json']);

function sourceId(value) {
  const id = String(value ?? '');
  return /^\d{1,12}$/.test(id) ? id : '';
}

function text(value, maximumLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maximumLength) : '';
}

function timestamp(value, fallback = '') {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
}

function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return '';
  const day = value.slice(0, 10);
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : '';
}

function count(value) {
  return Number.isInteger(value) && value >= 0 && value <= 100000 ? value : null;
}

function catalogPath(value, type) {
  try {
    const url = new URL(value, location.origin);
    const expectedPath = type === 'Series' ? /^\/series\/\d{1,12}\/?$/ : /^\/player$/;
    return url.origin === location.origin && expectedPath.test(url.pathname) ? `${url.pathname}${url.search}` : '';
  } catch {
    return '';
  }
}

function normalizeSeries(value, fallbackVerifiedAt = '') {
  const id = sourceId(value?.id);
  const title = text(value?.title);
  const href = catalogPath(value.href || `/series/${id}`, 'Series');
  if (!id || !title || !href || isExcludedSeriesId(id) || isExcludedSeriesHref(href)) return null;
  return {
    id,
    title,
    href,
    lastKnownVideoCount: count(value.lastKnownVideoCount),
    videoCountIsExact: value.videoCountIsExact === true,
    lastVerifiedAt: timestamp(value.lastVerifiedAt, fallbackVerifiedAt),
    releaseDate: date(value.releaseDate),
    year: Number.isInteger(value.year) && value.year >= 1800 && value.year <= 2200 ? value.year : null,
  };
}

function normalizeVideo(value, fallbackVerifiedAt = '') {
  const id = sourceId(value?.id);
  const title = text(value?.title);
  const href = catalogPath(value?.href, 'Episode');
  if (!id || !title || !href) return null;
  return {
    id,
    title,
    href,
    seriesId: value.seriesId === null || isExcludedSeriesId(value.seriesId) ? null : sourceId(value.seriesId) || null,
    lastVerifiedAt: timestamp(value.lastVerifiedAt, fallbackVerifiedAt),
    releaseDate: date(value.releaseDate),
    year: Number.isInteger(value.year) && value.year >= 1800 && value.year <= 2200 ? value.year : null,
    duration: text(value.duration, 40),
    // `null` means the artwork is unknown, so the series is fetched once more when it is opened.
    // An empty string means the source confirmed that the video has no artwork.
    image: typeof value.image === 'string' ? imageHref(value.image) : null,
    // The same rule applies to the synopsis and topics: `null` is unknown, an empty value is confirmed.
    description: typeof value.description === 'string' ? text(value.description, 1000) : null,
    keywords: Array.isArray(value.keywords)
      ? value.keywords
          .map((keyword) => text(keyword, 96))
          .filter(Boolean)
          .slice(0, MAX_KEYWORDS)
      : null,
  };
}

function isNewer(incoming, existing) {
  return Date.parse(incoming.lastVerifiedAt || '') >= Date.parse(existing?.lastVerifiedAt || '');
}

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('IndexedDB is unavailable'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SERIES_STORE))
        database.createObjectStore(SERIES_STORE, { keyPath: 'id' });
      if (!database.objectStoreNames.contains(VIDEO_STORE)) database.createObjectStore(VIDEO_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Catalog database could not be opened'));
    request.onblocked = () => reject(new Error('Catalog database upgrade was blocked'));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Catalog database request failed'));
  });
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('Catalog database transaction failed'));
    transaction.onabort = () => reject(transaction.error || new Error('Catalog database transaction was aborted'));
  });
}

export function createCatalogStore({ state, onChange }) {
  let databasePromise;
  let didWarn = false;

  function warn(error) {
    if (didWarn) return;
    didWarn = true;
    console.warn('[Warhammer TV Redux] The learned catalog could not be persisted.', error);
  }

  function database() {
    databasePromise ||= openDatabase();
    return databasePromise;
  }

  // The newer record wins each field, but an older record still fills the fields the newer one
  // lacks: a homepage scan learns a series before the stored catalog loads and carries no count.
  function mergeSeries(record, preferIncoming = false) {
    if (!record) return false;
    const existing = state.catalogSeries.get(record.id);
    const incomingWins = !existing || preferIncoming || isNewer(record, existing);
    const [primary, secondary] = incomingWins ? [record, existing] : [existing, record];
    const hasCount = primary.lastKnownVideoCount != null;
    state.catalogSeries.set(record.id, {
      ...secondary,
      ...primary,
      lastKnownVideoCount: hasCount ? primary.lastKnownVideoCount : (secondary?.lastKnownVideoCount ?? null),
      videoCountIsExact: hasCount ? primary.videoCountIsExact === true : (secondary?.videoCountIsExact ?? false),
      releaseDate: primary.releaseDate || secondary?.releaseDate || '',
      year: primary.year ?? secondary?.year ?? null,
    });
    return incomingWins;
  }

  function mergeVideo(record, preferIncoming = false) {
    if (!record) return false;
    const existing = state.catalogVideos.get(record.id);
    const incomingWins = !existing || preferIncoming || isNewer(record, existing);
    const [primary, secondary] = incomingWins ? [record, existing] : [existing, record];
    state.catalogVideos.set(record.id, {
      ...secondary,
      ...primary,
      seriesId: primary.seriesId || secondary?.seriesId || null,
      releaseDate: primary.releaseDate || secondary?.releaseDate || '',
      year: primary.year ?? secondary?.year ?? null,
      duration: primary.duration || secondary?.duration || '',
      image: primary.image || secondary?.image || (primary.image ?? secondary?.image ?? null),
      description:
        primary.description || secondary?.description || (primary.description ?? secondary?.description ?? null),
      keywords: primary.keywords?.length
        ? primary.keywords
        : secondary?.keywords?.length
          ? secondary.keywords
          : (primary.keywords ?? secondary?.keywords ?? null),
    });
    return incomingWins;
  }

  function loadBundled() {
    const verifiedAt = timestamp(bundledCatalog.updatedAt);
    for (const value of (bundledCatalog.series || []).slice(0, MAX_SERIES))
      mergeSeries(normalizeSeries(value, verifiedAt));
    for (const value of (bundledCatalog.videos || []).slice(0, MAX_VIDEOS))
      mergeVideo(normalizeVideo(value, verifiedAt));
    state.catalogStatus = 'seeded';
  }

  let hydration = null;

  async function loadStoredCatalog() {
    try {
      const connection = await database();
      const transaction = connection.transaction([SERIES_STORE, VIDEO_STORE], 'readonly');
      const [seriesRecords, videoRecords] = await Promise.all([
        requestResult(transaction.objectStore(SERIES_STORE).getAll(null, MAX_SERIES)),
        requestResult(transaction.objectStore(VIDEO_STORE).getAll(null, MAX_VIDEOS)),
      ]);
      for (const value of seriesRecords) mergeSeries(normalizeSeries(value));
      for (const value of videoRecords) mergeVideo(normalizeVideo(value));
      state.catalogStatus = 'ready';
      onChange?.();
    } catch (error) {
      state.catalogStatus = 'unavailable';
      warn(error);
    }
  }

  function hydrate() {
    hydration ||= loadStoredCatalog();
    return hydration;
  }

  // A page scan can learn a video before the stored catalog loads. Writing that record at once
  // would replace a stored record that holds more, such as artwork, so a write waits for hydration
  // and then stores the merged record.
  async function persist(seriesRecords, videoRecords) {
    if (!seriesRecords.length && !videoRecords.length) return;
    try {
      await hydration;
      const connection = await database();
      const stores = [seriesRecords.length && SERIES_STORE, videoRecords.length && VIDEO_STORE].filter(Boolean);
      const transaction = connection.transaction(stores, 'readwrite');
      const completion = transactionComplete(transaction);
      const seriesStore = seriesRecords.length ? transaction.objectStore(SERIES_STORE) : null;
      const videoStore = videoRecords.length ? transaction.objectStore(VIDEO_STORE) : null;
      seriesRecords.forEach((record) => seriesStore.put(state.catalogSeries.get(record.id) || record));
      videoRecords.forEach((record) => videoStore.put(state.catalogVideos.get(record.id) || record));
      await completion;
    } catch (error) {
      warn(error);
    }
  }

  function recordsFromItems(items, verifiedAt = new Date().toISOString()) {
    const seriesRecords = [];
    const videoRecords = [];
    for (const item of items) {
      if (item.type === 'Series') {
        const record = normalizeSeries({
          id: item.sourceId || String(item.id || '').replace(/^series:/, ''),
          title: item.title,
          href: item.href,
          lastVerifiedAt: verifiedAt,
          releaseDate: item.releaseDate,
          year: item.year,
        });
        if (record && mergeSeries(record, true)) seriesRecords.push(state.catalogSeries.get(record.id));
      } else if (item.type === 'Episode') {
        const record = normalizeVideo({
          id: item.sourceId || String(item.id || '').match(/^video:(\d+):/)?.[1],
          title: item.title,
          href: item.href,
          seriesId: item.parentSeriesId || null,
          lastVerifiedAt: verifiedAt,
          releaseDate: item.releaseDate,
          year: item.year,
          duration: item.duration,
          // Only a JSON payload can confirm that a video has no artwork. A page scan can miss an
          // image that has not loaded yet, so its blank stays unknown.
          image: item.image || (JSON_DATA_SOURCES.has(item.dataSource) ? '' : null),
          description: item.description || (JSON_DATA_SOURCES.has(item.dataSource) ? '' : null),
          keywords: item.keywords?.length ? item.keywords : JSON_DATA_SOURCES.has(item.dataSource) ? [] : null,
        });
        if (record && mergeVideo(record, true)) videoRecords.push(state.catalogVideos.get(record.id));
      }
    }
    return { seriesRecords, videoRecords };
  }

  async function clearArtwork() {
    const videoRecords = [];
    for (const [id, record] of state.catalogVideos) {
      if (record.image === null) continue;
      const cleared = { ...record, image: null };
      state.catalogVideos.set(id, cleared);
      videoRecords.push(cleared);
    }
    await persist([], videoRecords);
  }

  function learnItems(items) {
    const { seriesRecords, videoRecords } = recordsFromItems(items);
    void persist(seriesRecords, videoRecords);
  }

  function learnSeriesResult(id, result) {
    const verifiedAt = new Date(result.savedAt || Date.now()).toISOString();
    const normalizedId = sourceId(id);
    const existing = state.catalogSeries.get(normalizedId);
    const preservesKnownCount =
      result.partial === true && existing?.lastKnownVideoCount != null && existing.lastKnownVideoCount >= result.count;
    const seriesRecord = normalizeSeries({
      id: normalizedId,
      title: result.item?.title,
      href: result.item?.href,
      lastKnownVideoCount: preservesKnownCount ? existing.lastKnownVideoCount : result.count,
      videoCountIsExact: preservesKnownCount ? existing.videoCountIsExact : result.partial !== true,
      lastVerifiedAt: verifiedAt,
      releaseDate: result.releaseDate,
      year: result.year,
    });
    const { videoRecords } = recordsFromItems(
      (result.episodes || []).map((episode) => ({ ...episode, parentSeriesId: normalizedId })),
      verifiedAt,
    );
    if (seriesRecord) mergeSeries(seriesRecord, true);
    void persist(seriesRecord ? [state.catalogSeries.get(seriesRecord.id)] : [], videoRecords);
    onChange?.();
  }

  function seriesItemFromRecord(record, index = 0) {
    return {
      id: `series:${record.id}`,
      sourceId: record.id,
      type: 'Series',
      title: record.title,
      href: new URL(record.href || `/series/${record.id}`, location.origin).href,
      categories: [],
      keywords: [],
      order: 900000 + index,
      year: record.year,
      releaseDate: record.releaseDate,
      dataSource: 'catalog',
    };
  }

  function seriesItems() {
    return [...state.catalogSeries.values()].map(seriesItemFromRecord);
  }

  function videoItems(seriesId = '') {
    return [...state.catalogVideos.values()]
      .filter((record) => !seriesId || record.seriesId === seriesId)
      .map((record, index) => ({
        id: stableItemId(new URL(record.href, location.origin).href, record.title),
        sourceId: record.id,
        type: 'Episode',
        title: record.title,
        href: new URL(record.href, location.origin).href,
        parentSeriesId: record.seriesId || '',
        series: record.seriesId ? state.catalogSeries.get(record.seriesId)?.title || '' : '',
        seriesHref: record.seriesId ? new URL(`/series/${record.seriesId}`, location.origin).href : '',
        category: 'Catalog',
        categories: ['Catalog'],
        keywords: [...(record.keywords || [])],
        description: record.description || '',
        order: 900000 + index,
        year: record.year,
        releaseDate: record.releaseDate,
        duration: record.duration,
        image: record.image || '',
        dataSource: 'catalog-cache',
      }));
  }

  return {
    loadBundled,
    hydrate,
    learnItems,
    learnSeriesResult,
    clearArtwork,
    seriesItems,
    videoItems,
    seriesItem: (id) => {
      const record = state.catalogSeries.get(id);
      return record ? seriesItemFromRecord(record) : null;
    },
    seriesRecord: (id) => state.catalogSeries.get(id),
    hasCompleteSeries: (id) => {
      const record = state.catalogSeries.get(id);
      if (!record || record.lastKnownVideoCount == null || !record.videoCountIsExact) return false;
      const learnedVideos = [...state.catalogVideos.values()].filter((video) => video.seriesId === id);
      return (
        learnedVideos.length >= record.lastKnownVideoCount &&
        learnedVideos.every((video) => video.image !== null && video.description !== null)
      );
    },
  };
}

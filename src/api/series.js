import {
  HOME_DATA_MAX_CHARS,
  SERIES_CACHE_KEY,
  SERIES_CACHE_TTL,
  SERIES_AUTO_LIMIT,
  SERIES_TIMEOUT,
} from '../constants.js';
import { cleanText } from '../utils/text.js';
import {
  catalogHref,
  dateValue,
  episodeKey,
  fieldText,
  imageHref,
  isPlayerPage,
  isExcludedSeriesId,
  seriesIdFromHref,
  stableItemId,
  yearValue,
} from '../utils/url.js';
import {
  extractDuration,
  extractEpisodeLabel,
  extractYear,
  firstUsefulLine,
  isInsideApp,
  jsonLiteral,
} from '../utils/dom.js';
import { currentPayload } from './client.js';
import { normalizeHomeData, payloadFromScripts } from './normalize.js';

function seriesId(item) {
  const id = item?.sourceId || String(item?.id || '').replace(/^series:/, '');
  const hrefId = seriesIdFromHref(item?.href);
  return /^\d{1,12}$/.test(id) && !isExcludedSeriesId(id) && !isExcludedSeriesId(hrefId) ? id : '';
}

function numberField(value) {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value))) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 100000 ? number : null;
}

export function normalizeSeriesPayload(payload, item) {
  const id = seriesId(item);
  const all = normalizeHomeData(payload).items;
  const episodes = new Map();
  for (const episode of all)
    if (
      episode.type === 'Episode' &&
      (episode.parentSeriesId === id || (!episode.parentSeriesId && /^(?:season\b|episodes?$)/i.test(episode.category)))
    ) {
      episode.parentSeriesId = id;
      episode.series = item.title;
      episode.seriesHref = item.href;
      episode.dataSource = 'series-json';
      episodes.set(episodeKey(episode), episode);
    }
  const entries = (payload.serverLoadedFeeds || []).flatMap((wrapper) =>
    Array.isArray(wrapper?.feed?.entry) ? wrapper.feed.entry : [],
  );
  const hero = [payload.screenEntry, ...entries].find((entry) => String(entry?.id) === id && entry?.extensions) || null;
  const extensions = hero?.extensions || {};
  const metadata = all.find((entry) => entry.type === 'Series' && seriesId(entry) === id);
  const declared = numberField(extensions.episode_count ?? extensions.episodes_count ?? extensions.total_episodes);
  const failed = (payload.serverLoadedFeeds || []).some(
    (wrapper) => wrapper?.feed?.error || Number(wrapper?.feed?.statusCode) >= 400,
  );
  const hasNext = (payload.serverLoadedFeeds || []).some((wrapper) => wrapper?.feed?.next || wrapper?.feed?.next_page);
  const caps = all.length >= 5000;
  const values = [...episodes.values()].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  const title = fieldText(extensions.title, 500) || fieldText(hero?.title, 500) || item.title;
  values.forEach((episode) => {
    episode.series = title;
  });
  return {
    item: { ...item, title },
    episodes: values,
    count: declared != null && declared >= values.length ? declared : values.length,
    exact: declared != null && declared >= values.length,
    partial: failed || hasNext || caps || (declared != null && declared > values.length),
    status: 'ready',
    savedAt: Date.now(),
    year: yearValue(extensions.production_year ?? extensions.year) || metadata?.year || item.year || null,
    description:
      fieldText(extensions.description) || fieldText(hero?.summary) || metadata?.description || item.description || '',
    releaseDate: dateValue(extensions.release_date) || metadata?.releaseDate || '',
    failedFeeds: failed,
    usable: values.length > 0 || (!failed && (Boolean(hero) || declared === 0)),
  };
}

export function createSeriesService({
  state,
  renderCatalog,
  refreshSeriesDetails,
  onSeriesResult,
  catalogSeriesItem,
  catalogSeriesEpisodes,
  catalogHasCompleteSeries,
}) {
  function seriesItem(id) {
    return (
      state.apiItems.find((item) => item.type === 'Series' && seriesId(item) === id) ||
      state.items.find((item) => item.type === 'Series' && seriesId(item) === id) ||
      state.seriesData.get(id)?.item ||
      catalogSeriesItem?.(id) || {
        id: `series:${id}`,
        sourceId: id,
        type: 'Series',
        title: `Series ${id}`,
        href: new URL(`/series/${id}`, location.origin).href,
        categories: [],
        keywords: [],
        order: 0,
      }
    );
  }

  function activeSeries() {
    return state.activeSeriesId ? seriesItem(state.activeSeriesId) : null;
  }
  function runtimeText(item) {
    return item.duration ? `${item.durationApproximate ? '≈ ' : ''}${item.duration}` : '';
  }
  function listedEpisodes(id) {
    const loaded = state.seriesData.get(id)?.episodes || [];
    const episodes = new Map();
    for (const item of [
      ...(catalogSeriesEpisodes?.(id) || []),
      ...state.items.filter((candidate) => candidate.type === 'Episode' && candidate.parentSeriesId === id),
      ...loaded,
    ])
      episodes.set(episodeKey(item), item);
    return [...episodes.values()];
  }

  function seriesCountLabel(item) {
    if (item?.type !== 'Series') return '';
    const id = seriesId(item);
    const record = state.seriesData.get(id);
    if (record?.status === 'loading') return 'Loading Videos…';
    const count = listedEpisodes(id).length;
    return `${count} ${count === 1 ? 'Video' : 'Videos'}`;
  }

  function loadCache() {
    try {
      const value = JSON.parse(localStorage.getItem(SERIES_CACHE_KEY) || '{}');
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      for (const [id, record] of Object.entries(value).slice(0, 200)) {
        if (
          !/^\d{1,12}$/.test(id) ||
          !record ||
          !Number.isFinite(record.savedAt) ||
          Date.now() - record.savedAt > SERIES_CACHE_TTL ||
          record.savedAt > Date.now() + 60000
        )
          continue;
        if (!Number.isInteger(record.count) || record.count < 0 || record.count > 100000) continue;
        state.seriesData.set(id, {
          status: 'cached',
          count: record.count,
          exact: record.exact === true,
          partial: record.partial === true,
          savedAt: record.savedAt,
          year: yearValue(record.year),
          description: fieldText(record.description),
          releaseDate: dateValue(record.releaseDate),
          episodes: [],
        });
      }
    } catch {}
  }

  function saveCache() {
    const values = Object.create(null);
    for (const [id, record] of [...state.seriesData].slice(-200))
      if (record.count != null && record.savedAt)
        values[id] = {
          count: record.count,
          exact: record.exact,
          partial: record.partial,
          savedAt: record.savedAt,
          year: record.year,
          description: record.description,
          releaseDate: record.releaseDate,
        };
    try {
      localStorage.setItem(SERIES_CACHE_KEY, JSON.stringify(values));
    } catch {}
  }

  function seriesDOM(fragment, item) {
    const episodes = new Map();
    const id = seriesId(item);
    for (const link of fragment.querySelectorAll('a[href]')) {
      const href = catalogHref(link.getAttribute('href'));
      if (!href || !new URL(href).pathname.startsWith('/player') || isInsideApp(link)) continue;
      const title = fieldText(
        link.getAttribute('aria-label')?.replace(/^Play\s*/i, '') ||
          link.querySelector('img[alt]')?.getAttribute('alt') ||
          firstUsefulLine(link),
        500,
      );
      if (!title) continue;
      const text = cleanText(link.textContent);
      const episode = {
        id: stableItemId(href, title),
        href,
        title,
        type: 'Episode',
        sourceId: '',
        parentSeriesId: id,
        series: item.title,
        seriesHref: item.href,
        image: imageHref(link.querySelector('img')?.getAttribute('src')),
        description: '',
        year: extractYear(text),
        duration: extractDuration(text),
        episodeLabel: extractEpisodeLabel(title),
        category: 'Episodes',
        categories: ['Episodes'],
        keywords: [],
        dataSource: 'series-page',
        order: episodes.size,
      };
      episode.sourceId = episode.id.match(/^video:(\d+):/)?.[1] || '';
      episodes.set(episodeKey(episode), episode);
    }
    return {
      item,
      episodes: [...episodes.values()],
      count: episodes.size,
      exact: false,
      partial: true,
      status: 'ready',
      savedAt: Date.now(),
      description: item.description || '',
      year: item.year || null,
      usable: episodes.size > 0,
    };
  }

  function parseSeriesHTML(text, item) {
    const template = document.createElement('template');
    template.innerHTML = text;
    const payload = payloadFromScripts(template.content.querySelectorAll('script'), jsonLiteral);
    if (payload) {
      const result = normalizeSeriesPayload(payload, item);
      if (result.usable) return result;
    }
    const result = seriesDOM(template.content, item);
    if (!result.usable) throw new Error('Series data unavailable');
    return result;
  }

  function adoptResult(id, result) {
    state.seriesData.set(id, result);
    onSeriesResult?.(id, result);
    for (const item of [...state.apiItems, ...state.items].filter(
      (candidate) => candidate.type === 'Series' && seriesId(candidate) === id,
    )) {
      if (result.year && !item.year) item.year = result.year;
      if (result.description && !item.description) item.description = result.description;
      if (result.releaseDate) item.releaseDate = result.releaseDate;
    }
    saveCache();
    if (state.mounted && !state.disabled) {
      renderCatalog({ preserveScroll: true });
      refreshSeriesDetails(id);
    }
  }

  function pump() {
    if (state.disabled || isPlayerPage() || state.seriesRequests.size >= 2 || !state.seriesQueue.length) return;
    const job = state.seriesQueue.shift();
    const request = { controller: new AbortController(), timer: null };
    state.seriesRequests.set(job.id, request);
    request.timer = setTimeout(() => request.controller.abort(), SERIES_TIMEOUT);
    (async () => {
      try {
        let result;
        if (location.pathname.replace(/\/$/, '') === `/series/${job.id}`) {
          const payload = currentPayload();
          if (payload) {
            const local = normalizeSeriesPayload(payload, job.item);
            if (local.usable) result = local;
          }
        }
        if (!result) {
          const response = await fetch(job.item.href, {
            method: 'GET',
            credentials: 'same-origin',
            mode: 'same-origin',
            redirect: 'error',
            headers: { Accept: 'text/html, application/json' },
            signal: request.controller.signal,
          });
          if (!response.ok) throw new Error('Series data unavailable');
          if (Number(response.headers.get('content-length')) > HOME_DATA_MAX_CHARS)
            throw new Error('Series data unavailable');
          const text = await response.text();
          if (text.length > HOME_DATA_MAX_CHARS) throw new Error('Series data unavailable');
          result = /\bjson\b/i.test(response.headers.get('content-type') || '')
            ? normalizeSeriesPayload(JSON.parse(text), job.item)
            : parseSeriesHTML(text, job.item);
          if (!result.usable) throw new Error('Series data unavailable');
        }
        if (!state.disabled && state.seriesRequests.get(job.id) === request) adoptResult(job.id, result);
      } catch {
        if (!state.disabled && state.seriesRequests.get(job.id) === request) {
          const old = state.seriesData.get(job.id) || {};
          state.seriesData.set(job.id, {
            ...old,
            status: 'failed',
            error: 'Series details could not be loaded. Use Retry or open the original series page.',
          });
          if (state.mounted) {
            renderCatalog({ preserveScroll: true });
            refreshSeriesDetails(job.id);
          }
        }
      } finally {
        clearTimeout(request.timer);
        state.seriesRequests.delete(job.id);
        state.seriesPending.delete(job.id);
        clearTimeout(state.seriesPumpTimer);
        state.seriesPumpTimer = setTimeout(pump, 400);
      }
    })();
    clearTimeout(state.seriesPumpTimer);
    state.seriesPumpTimer = setTimeout(pump, 400);
  }

  function queue(item, explicit = false) {
    const id = seriesId(item);
    if (!id || state.disabled || isPlayerPage()) return;
    const record = state.seriesData.get(id);
    const isFresh = record ? Date.now() - record.savedAt < SERIES_CACHE_TTL : false;
    if (isFresh && record.status === 'ready') return;
    // A restored cache record holds only the count. The learned catalog holds the episodes, so a
    // complete catalog entry makes the fetch redundant.
    if (isFresh && record.status === 'cached' && catalogHasCompleteSeries?.(id)) return;
    if (
      !explicit &&
      (record?.status === 'failed' || record?.status === 'cached' || state.seriesAutoCount >= SERIES_AUTO_LIMIT)
    )
      return;
    if (state.seriesPending.has(id)) {
      if (explicit) {
        const index = state.seriesQueue.findIndex((job) => job.id === id);
        if (index >= 0) state.seriesQueue.unshift(state.seriesQueue.splice(index, 1)[0]);
      }
      return;
    }
    if (!explicit) state.seriesAutoCount += 1;
    state.seriesPending.add(id);
    state.seriesData.set(id, { ...record, status: 'loading', item, episodes: record?.episodes || [] });
    const job = { id, item, explicit };
    if (explicit) state.seriesQueue.unshift(job);
    else state.seriesQueue.push(job);
    pump();
  }

  function cancel() {
    clearTimeout(state.seriesPumpTimer);
    state.seriesQueue = [];
    state.seriesPending.clear();
    state.seriesRequests.forEach((request) => {
      clearTimeout(request.timer);
      request.controller.abort();
    });
    state.seriesRequests.clear();
    state.seriesObserver?.disconnect();
  }

  function observeCards(itemById) {
    if (!state.refs.scroller || typeof IntersectionObserver !== 'function' || !state.activeSeriesId) return;
    if (!state.seriesObserver)
      state.seriesObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries)
            if (entry.isIntersecting && !entry.target.hidden) {
              const item = itemById(entry.target.dataset.id);
              if (item?.type === 'Series') {
                queue(item);
                state.seriesObserver.unobserve(entry.target);
              }
            }
        },
        { root: state.refs.scroller, rootMargin: '80px', threshold: 0.01 },
      );
    for (const ref of state.cardNodes.values())
      if (ref.article.dataset.contentType === 'Series' && !ref.article.hidden)
        state.seriesObserver.observe(ref.article);
  }

  return {
    seriesId,
    seriesItem,
    activeSeries,
    activeEpisodes: listedEpisodes,
    runtimeText,
    listedEpisodes,
    seriesCountLabel,
    loadCache,
    saveCache,
    queue,
    cancel,
    observeCards,
    normalizeSeriesPayload,
  };
}

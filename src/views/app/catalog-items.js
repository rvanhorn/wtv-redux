import { ALL_TITLES, OTHER_VIDEOS } from '../../constants.js';
import { accessLabel, mergeItemData } from '../../api/normalize.js';
import { isSaved, isWatched, matchingStoreKey, readStore, storedItem } from '../../state/store.js';
import { durationSeconds, episodeKey } from '../../utils/url.js';

/**
 * Item queries derived from application state, the learned catalog, and loaded series records.
 * Reads `context.catalog` and `context.series` at call time.
 */
export function createCatalogItems(context) {
  const { state } = context;

  function allVideoItems() {
    const collectionIds = new Set(knownSeriesItems().map((item) => context.series.seriesId(item)));
    const loaded = [...state.seriesData.values()].flatMap((record) => record.episodes || []);
    const videos = new Map();
    for (const item of [...context.catalog.videoItems(), ...state.items, ...loaded]) {
      if (item.type !== 'Episode') continue;
      const key = episodeKey(item);
      const video = { ...item, categories: [...(item.categories || [])] };
      if (videos.has(key)) mergeItemData(video, videos.get(key));
      videos.set(key, video);
    }
    return [...videos.values()].map((item) =>
      collectionIds.has(item.parentSeriesId)
        ? item
        : { ...item, categories: [...(item.categories || []), OTHER_VIDEOS] },
    );
  }

  function availableItems(store = readStore()) {
    if (state.mode === 'catalog' && state.activeSeriesId)
      return allVideoItems().filter((item) => item.parentSeriesId === state.activeSeriesId);
    if (state.mode === 'catalog') return state.type === 'Series' ? knownSeriesItems() : allVideoItems();
    const map = new Map(state.items.map((item) => [item.id, item]));
    if (state.mode !== 'catalog') {
      const bucket = state.mode === 'library' ? store.saved : store.watched;
      Object.values(bucket).forEach((entry, index) => {
        const item = storedItem(entry, index);
        if (item && !map.has(item.id)) map.set(item.id, item);
      });
      for (const record of state.seriesData.values())
        for (const item of record.episodes || []) if (!map.has(item.id)) map.set(item.id, item);
    }
    return [...map.values()];
  }

  function knownItems(store = readStore()) {
    const map = new Map();
    const add = (item) => {
      if (item && !map.has(item.id)) map.set(item.id, item);
    };
    state.items.forEach(add);
    knownSeriesItems().forEach(add);
    allVideoItems().forEach(add);
    for (const bucket of [store.saved, store.watched])
      Object.values(bucket).forEach((entry, index) => add(storedItem(entry, index)));
    for (const record of state.seriesData.values()) (record.episodes || []).forEach(add);
    return [...map.values()];
  }

  function itemById(id) {
    return (
      state.items.find((item) => item.id === id) ||
      availableItems().find((item) => item.id === id) ||
      [...state.seriesData.values()].flatMap((record) => record.episodes || []).find((item) => item.id === id) ||
      (id?.startsWith('series:') ? context.series.seriesItem(id.slice(7)) : null)
    );
  }

  function knownSeriesItems() {
    const { series, catalog } = context;
    const items = new Map(
      state.items
        .filter((item) => item.type === 'Series' && series.seriesId(item))
        .map((item) => [series.seriesId(item), item]),
    );
    for (const item of catalog.seriesItems()) {
      const id = series.seriesId(item);
      if (id && !items.has(id)) items.set(id, item);
    }
    for (const record of state.seriesData.values()) {
      const id = series.seriesId(record.item);
      if (id && !items.has(id)) items.set(id, record.item);
    }
    return [...items.values()];
  }

  function refreshKnownSeries() {
    knownSeriesItems().forEach((item) => context.series.queue(item));
  }

  function savedAt(store, item) {
    const key = matchingStoreKey(store.saved, item);
    return Number(store.saved[key]?.savedAt || 0);
  }

  function filterOptions() {
    return { allTitles: ALL_TITLES, isSaved, isWatched, accessLabel, durationSeconds, savedAt };
  }

  return { allVideoItems, availableItems, knownItems, itemById, knownSeriesItems, refreshKnownSeries, filterOptions };
}

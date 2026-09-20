import { ALL_TITLES, COLLECTION_SORTS, defaultStore, PLAYER_PATH, STORAGE_KEY } from '../constants.js';
import {
  canonicalHref,
  stableItemId,
  catalogHref,
  dateValue,
  isExcludedSeriesHref,
  isExcludedSeriesId,
} from '../utils/url.js';
import { fieldText } from '../utils/url.js';
import { migrateStore } from '../storage/migrations.js';
import { CURRENT_SCHEMA_VERSION } from '../storage/schema.js';
import { DEFAULT_ACCENT_ID, isAccentId } from '../features/accent.js';

export function readStore() {
  try {
    const parsed = migrateStore(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
    return {
      saved: parsed.saved && typeof parsed.saved === 'object' ? parsed.saved : {},
      watched: parsed.watched && typeof parsed.watched === 'object' ? parsed.watched : {},
      prefs: {
        sort: parsed.prefs && typeof parsed.prefs.sort === 'string' ? parsed.prefs.sort : defaultStore.prefs.sort,
        view: parsed.prefs && typeof parsed.prefs.view === 'string' ? parsed.prefs.view : defaultStore.prefs.view,
        showHero: parsed.prefs?.showHero !== false,
        accent: isAccentId(parsed.prefs?.accent) ? parsed.prefs.accent : DEFAULT_ACCENT_ID,
        collectionSort: COLLECTION_SORTS.includes(parsed.prefs?.collectionSort)
          ? parsed.prefs.collectionSort
          : defaultStore.prefs.collectionSort,
      },
    };
  } catch {
    return JSON.parse(JSON.stringify(defaultStore));
  }
}

export function writeStore(state, nextStore, showToast) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...nextStore, schemaVersion: CURRENT_SCHEMA_VERSION }));
    return true;
  } catch (error) {
    if (!state.storageWarningShown) {
      state.storageWarningShown = true;
      console.warn('[Warhammer TV Redux] Browser storage is unavailable; list changes may not persist.', error);
    }
    if (state.refs.toast && showToast) showToast('Browser storage is unavailable. This change could not be saved.');
    return false;
  }
}

export function matchingStoreKey(bucket, item) {
  if (bucket[item.id]) return item.id;
  return (
    Object.keys(bucket).find((key) => {
      const entry = bucket[key];
      return (
        entry &&
        (canonicalHref(entry.href) === canonicalHref(item.href) || stableItemId(entry.href, entry.title) === item.id)
      );
    }) || ''
  );
}

export function isSaved(store, item) {
  return Boolean(matchingStoreKey(store.saved, item));
}

export function isWatched(store, item) {
  return Boolean(matchingStoreKey(store.watched, item));
}

export function savePreference(state, name, value, showToast) {
  const store = readStore();
  store.prefs[name] = value;
  writeStore(state, store, showToast);
}

export function snapshotItem(item) {
  const {
    id,
    href,
    title,
    image,
    category,
    categories,
    type,
    description,
    year,
    duration,
    episodeLabel,
    series,
    sourceId,
    parentSeriesId,
    seriesHref,
    keywords,
    ageRating,
    ageRatingDescription,
    ageRatingCountry,
    sourceFree,
    requiresAuthentication,
    durationApproximate,
    dataSource,
    releaseDate,
    seasonLabel,
  } = item;
  return {
    id,
    href,
    title,
    image,
    category,
    categories,
    type,
    description,
    year,
    duration,
    episodeLabel,
    series,
    sourceId,
    parentSeriesId,
    seriesHref,
    keywords,
    ageRating,
    ageRatingDescription,
    ageRatingCountry,
    sourceFree,
    requiresAuthentication,
    durationApproximate,
    dataSource,
    releaseDate,
    seasonLabel,
  };
}

export function storedItem(entry, index = 0) {
  if (!entry || typeof entry.href !== 'string' || typeof entry.title !== 'string') return null;
  try {
    const url = new URL(entry.href, location.origin);
    if (url.origin !== location.origin || !(url.pathname === PLAYER_PATH || url.pathname.startsWith('/series/')))
      return null;
    if (isExcludedSeriesHref(url.href)) return null;
    const snapshot = entry.snapshot && typeof entry.snapshot === 'object' ? entry.snapshot : {};
    const type = url.pathname.startsWith('/series/') ? 'Series' : 'Episode';
    return {
      id: stableItemId(url.href, entry.title),
      href: url.href,
      title: entry.title,
      image: typeof snapshot.image === 'string' ? snapshot.image : '',
      category: snapshot.category || 'Library',
      categories: Array.isArray(snapshot.categories) ? snapshot.categories : ['Library'],
      type,
      description: snapshot.description || '',
      year: snapshot.year || null,
      duration: snapshot.duration || '',
      episodeLabel: snapshot.episodeLabel || '',
      series: snapshot.series || '',
      progress: null,
      order: 100000 + index,
      sourceId: fieldText(snapshot.sourceId, 100),
      parentSeriesId: isExcludedSeriesId(snapshot.parentSeriesId) ? '' : fieldText(snapshot.parentSeriesId, 100),
      seriesHref: catalogHref(snapshot.seriesHref),
      keywords: Array.isArray(snapshot.keywords) ? snapshot.keywords : [],
      ageRating: fieldText(snapshot.ageRating, 80),
      ageRatingDescription: fieldText(snapshot.ageRatingDescription, 1000),
      ageRatingCountry: fieldText(snapshot.ageRatingCountry, 12),
      sourceFree: typeof snapshot.sourceFree === 'boolean' ? snapshot.sourceFree : null,
      requiresAuthentication:
        typeof snapshot.requiresAuthentication === 'boolean' ? snapshot.requiresAuthentication : null,
      durationApproximate: Boolean(snapshot.durationApproximate),
      releaseDate: dateValue(snapshot.releaseDate),
      seasonLabel: fieldText(snapshot.seasonLabel, 100),
      dataSource: 'local-snapshot',
    };
  } catch {
    return null;
  }
}

export function resetFilters(state) {
  state.query = '';
  state.category = ALL_TITLES;
  state.type = 'all';
  state.status = 'all';
  state.year = 'all';
}

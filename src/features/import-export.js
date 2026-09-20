import {
  fieldText,
  portableHref,
  portableImage,
  dateValue,
  durationSeconds,
  stableItemId,
  yearValue,
  isExcludedSeriesId,
} from '../utils/url.js';
import { sourceKeywords } from '../api/normalize.js';
import { makeElement } from '../utils/dom.js';
import { actionButton } from '../components/icons.js';
import { isAccentId } from './accent.js';
import { matchingStoreKey, readStore, writeStore } from '../storage/storage.js';

const BACKUP_FORMAT = 'whtv-redux';
const LEGACY_BACKUP_FORMAT = 'whtv-better-ui';

export function validateBackup(data) {
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    (data.format && ![BACKUP_FORMAT, LEGACY_BACKUP_FORMAT].includes(data.format)) ||
    ![1, 2].includes(data.version)
  )
    throw new Error('This is not a supported Warhammer TV list backup.');
  if (
    !data.saved ||
    !data.watched ||
    Array.isArray(data.saved) ||
    Array.isArray(data.watched) ||
    typeof data.saved !== 'object' ||
    typeof data.watched !== 'object'
  )
    throw new Error('The backup must contain saved and watched lists.');
  const result = { saved: Object.create(null), watched: Object.create(null), prefs: {}, skipped: 0 };
  let count = 0;
  for (const bucket of ['saved', 'watched'])
    for (const [key, entry] of Object.entries(data[bucket])) {
      if (++count > 10000) throw new Error('The backup exceeds 10,000 entries.');
      if (['__proto__', 'prototype', 'constructor'].includes(key) || !entry || typeof entry !== 'object') {
        result.skipped += 1;
        continue;
      }
      const href = portableHref(entry.href);
      const title = fieldText(entry.title, 500);
      if (!href || !title) {
        result.skipped += 1;
        continue;
      }
      const id = stableItemId(href, title);
      const snapshot = entry.snapshot && typeof entry.snapshot === 'object' ? entry.snapshot : {};
      const item = {
        id,
        href,
        title,
        type: href.includes('/series/') ? 'Series' : 'Episode',
        image: portableImage(snapshot.image),
        description: fieldText(snapshot.description),
        year: yearValue(snapshot.year),
        duration: fieldText(snapshot.duration, 40),
        categories: sourceKeywords(snapshot.categories).slice(0, 30),
        keywords: sourceKeywords(snapshot.keywords),
        episodeLabel: fieldText(snapshot.episodeLabel, 100),
        seasonLabel: fieldText(snapshot.seasonLabel, 100),
        series: fieldText(snapshot.series, 500),
        sourceId: /^\d{1,12}$/.test(String(snapshot.sourceId)) ? String(snapshot.sourceId) : '',
        parentSeriesId:
          /^\d{1,12}$/.test(String(snapshot.parentSeriesId)) && !isExcludedSeriesId(snapshot.parentSeriesId)
            ? String(snapshot.parentSeriesId)
            : '',
        seriesHref: portableHref(snapshot.seriesHref),
        ageRating: fieldText(snapshot.ageRating, 80),
        durationApproximate: snapshot.durationApproximate === true,
        releaseDate: dateValue(snapshot.releaseDate),
      };
      item.category = item.categories[0] || 'Library';
      if (!durationSeconds(item.duration)) item.duration = '';
      const stamp = bucket === 'saved' ? 'savedAt' : 'watchedAt';
      const timestamp = Number(entry[stamp]);
      result[bucket][id] = {
        title,
        href,
        [stamp]:
          Number.isFinite(timestamp) && timestamp >= 0 && timestamp <= Date.now() + 86400000 ? timestamp : Date.now(),
        snapshot: item,
      };
    }
  const prefs = data.prefs || {};
  if (['grid', 'list', 'compact'].includes(prefs.view)) result.prefs.view = prefs.view;
  if (['recommended', 'alphabetical', 'year', 'duration', 'saved', 'unwatched', 'category'].includes(prefs.sort))
    result.prefs.sort = prefs.sort;
  if (typeof prefs.showHero === 'boolean') result.prefs.showHero = prefs.showHero;
  if (isAccentId(prefs.accent)) result.prefs.accent = prefs.accent;
  return result;
}

export function exportData(state, { showToast }) {
  try {
    const clean = validateBackup({ version: 2, ...readStore() });
    const data = {
      format: BACKUP_FORMAT,
      version: 2,
      exportedAt: new Date().toISOString(),
      saved: clean.saved,
      watched: clean.watched,
      prefs: clean.prefs,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = makeElement('a');
    link.href = url;
    link.download = 'WarhammerTV-lists.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(
      `Exported ${Object.keys(clean.saved).length} favorites and ${Object.keys(clean.watched).length} watched entries${clean.skipped ? `; ${clean.skipped} invalid entries skipped` : ''}.`,
    );
  } catch {
    showToast('The lists could not be exported. No data was changed.');
  }
}

export async function readImportFile(state, file, { showToast }) {
  if (!file) return;
  state.pendingImport = null;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('Choose a JSON backup smaller than 5 MB.');
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      throw new Error('The file is not valid JSON.');
    }
    const clean = validateBackup(data);
    state.pendingImport = clean;
    const area = state.refs.dialog.querySelector('[data-import-preview]');
    if (!area) return;
    area.replaceChildren(
      makeElement(
        'p',
        '',
        `${Object.keys(clean.saved).length} watchlist entries · ${Object.keys(clean.watched).length} watched entries · ${clean.skipped} invalid entries skipped. Existing lists will be kept.`,
      ),
      actionButton('confirm-import', 'Merge Into My Lists', 'check', 'whtv-button whtv-primary'),
    );
    area.hidden = false;
  } catch (error) {
    const area = state.refs.dialog?.querySelector('[data-import-preview]');
    if (area) {
      area.hidden = false;
      area.textContent = error.message;
    }
    showToast(error.message);
  }
}

export function applyImport(state, { renderCatalog, showToast, closeDialog }) {
  const data = state.pendingImport;
  if (!data) return;
  const store = readStore();
  for (const bucket of ['saved', 'watched'])
    for (const [id, entry] of Object.entries(data[bucket])) {
      const key = matchingStoreKey(store[bucket], entry.snapshot);
      const old = key ? store[bucket][key] : null;
      const stamp = bucket === 'saved' ? 'savedAt' : 'watchedAt';
      if (!old || Number(entry[stamp]) >= Number(old[stamp] || 0)) {
        if (key && key !== id) delete store[bucket][key];
        store[bucket][id] = entry;
      }
    }
  if (!writeStore(state, store, showToast)) return;
  state.pendingImport = null;
  if (closeDialog) closeDialog();
  else state.refs.dialog.close();
  renderCatalog({ preserveScroll: true });
  showToast('Watchlist and watched entries imported. Existing entries retained.');
}

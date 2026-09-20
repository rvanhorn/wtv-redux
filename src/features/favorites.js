import { isSaved, matchingStoreKey, readStore, snapshotItem, writeStore } from '../storage/storage.js';

export function toggleSaved(state, item, { renderCatalog, showToast }) {
  const store = readStore();
  const key = matchingStoreKey(store.saved, item);
  const previous = key ? store.saved[key] : null;
  if (key) delete store.saved[key];
  else store.saved[item.id] = { title: item.title, href: item.href, savedAt: Date.now(), snapshot: snapshotItem(item) };
  if (!writeStore(state, store, showToast)) return;
  renderCatalog({ preserveScroll: true });
  showToast(key ? 'Removed from your watchlist' : 'Added to your watchlist', () => {
    const latest = readStore();
    if (previous) latest.saved[key] = previous;
    else delete latest.saved[item.id];
    if (!writeStore(state, latest, showToast)) return;
    renderCatalog({ preserveScroll: true });
    showToast('Change undone');
  });
}

export { isSaved };

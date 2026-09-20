import { isWatched, matchingStoreKey, readStore, snapshotItem, writeStore } from '../storage/storage.js';

export function toggleWatched(state, item, { renderCatalog, showToast }) {
  const store = readStore();
  const key = matchingStoreKey(store.watched, item);
  if (key) delete store.watched[key];
  else
    store.watched[item.id] = {
      title: item.title,
      href: item.href,
      watchedAt: Date.now(),
      snapshot: snapshotItem(item),
    };
  if (!writeStore(state, store, showToast)) return;
  renderCatalog({ preserveScroll: true });
}

export { isWatched };

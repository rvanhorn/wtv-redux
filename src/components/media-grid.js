import { createMediaCard, updateMediaCard } from './media-card.js';

export function renderMediaGrid(state, items, store, options) {
  const visibleIds = new Set(items.map((item) => item.id));
  state.cardNodes.forEach((ref, id) => {
    ref.article.hidden = !visibleIds.has(id);
  });
  let previous = null;
  items.forEach((item) => {
    let ref = state.cardNodes.get(item.id);
    if (!ref) {
      ref = createMediaCard(item);
      state.cardNodes.set(item.id, ref);
    }
    updateMediaCard(ref, item, store, options);
    ref.article.hidden = false;
    const next = previous ? previous.nextElementSibling : state.refs.grid.firstElementChild;
    if (next !== ref.article) state.refs.grid.insertBefore(ref.article, next);
    previous = ref.article;
  });
  // Cards outside the current view stay in the grid as hidden nodes so that their decoded artwork
  // survives a visit to a series and back. Only cards for items that left every view are removed.
  const knownIds = new Set(options.knownItems(store).map((item) => item.id));
  state.cardNodes.forEach((ref, id) => {
    if (!knownIds.has(id)) {
      ref.article.remove();
      state.cardNodes.delete(id);
    }
  });
}

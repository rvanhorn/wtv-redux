import { dedupeStrings } from '../utils/text.js';
import { makeElement } from '../utils/dom.js';

export function renderMetadata(container, parts) {
  const values = dedupeStrings(parts.filter((value) => value !== null && value !== undefined && value !== ''));
  const signature = values.join('|');
  if (container.dataset.signature === signature) return;
  container.replaceChildren(...values.map((value) => makeElement('span', '', value)));
  container.dataset.signature = signature;
}

export function filterItems(state, items, store, options, ignoreCategory = false) {
  const terms = state.query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const filtered = items.filter((item) => {
    if (state.mode === 'library' && !options.isSaved(store, item)) return false;
    if (state.mode === 'watched' && !options.isWatched(store, item)) return false;
    if (
      !ignoreCategory &&
      state.category !== options.allTitles &&
      !(item.categories || [item.category]).includes(state.category)
    )
      return false;
    if (state.type !== 'all' && item.type !== state.type) return false;
    if (
      state.activeSeriesId &&
      state.season !== 'all' &&
      (item.seasonLabel || item.episodeLabel?.match(/^Season \d+/)?.[0]) !== state.season
    )
      return false;
    if (state.year !== 'all' && String(item.year) !== state.year) return false;
    if (state.status === 'unwatched' && options.isWatched(store, item)) return false;
    if (state.status === 'watched' && !options.isWatched(store, item)) return false;
    if (state.status === 'progress' && !(item.progress > 0 && item.progress < 100)) return false;
    if (!terms.length) return true;
    const haystack = [
      item.title,
      item.description,
      item.series,
      item.type,
      item.year,
      item.episodeLabel,
      ...(item.categories || []),
      ...(item.keywords || []),
      item.ageRating,
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase();
    return terms.every((term) =>
      /^\d+$/.test(term) ? new RegExp(`\\b${term}\\b`).test(haystack) : haystack.includes(term),
    );
  });
  const compare = (a, b) =>
    (state.category === options.allTitles
      ? a.order - b.order
      : (a.collectionPositions?.[state.category] ?? a.order) - (b.collectionPositions?.[state.category] ?? b.order)) ||
    a.title.localeCompare(b.title);
  return filtered.sort((a, b) => {
    if (state.sort === 'alphabetical') return a.title.localeCompare(b.title, undefined, { numeric: true });
    if (state.sort === 'year') return (b.year || 0) - (a.year || 0) || compare(a, b);
    if (state.sort === 'duration')
      return (
        (options.durationSeconds(a.duration) ?? Infinity) - (options.durationSeconds(b.duration) ?? Infinity) ||
        compare(a, b)
      );
    if (state.sort === 'category') return a.category.localeCompare(b.category) || a.title.localeCompare(b.title);
    if (state.sort === 'saved') return options.savedAt(store, b) - options.savedAt(store, a) || compare(a, b);
    if (state.sort === 'unwatched')
      return Number(options.isWatched(store, a)) - Number(options.isWatched(store, b)) || compare(a, b);
    return compare(a, b);
  });
}

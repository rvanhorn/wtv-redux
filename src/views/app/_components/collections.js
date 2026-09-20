import { ALL_TITLES, OTHER_VIDEOS } from '../../../constants.js';
import { actionButton, setText } from '../../../components/icons.js';
import { syncChoiceMenu } from '../../../components/navbar.js';
import { filterItems } from '../../../features/metadata.js';
import { makeElement } from '../../../utils/dom.js';
import { dedupeStrings } from '../../../utils/text.js';

/** The collection buttons in the sidebar plus the category and year filter menus. */
export function createCollectionsNav(context) {
  const { state } = context;

  function collectionUpdatedAt(item) {
    const record = state.seriesData.get(context.series.seriesId(item));
    const dates = [
      item.releaseDate,
      record?.releaseDate,
      ...(record?.episodes || []).map((episode) => episode.releaseDate),
    ]
      .map((value) => Date.parse(value || ''))
      .filter(Number.isFinite);
    if (dates.length) return Math.max(...dates);
    const year = item.year || record?.year;
    return year ? Date.UTC(year, 0, 1) : 0;
  }

  function sortCollections(collections) {
    const sorted = [...collections];
    if (state.collectionSort === 'alphabetical')
      sorted.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));
    else if (state.collectionSort === 'updated') {
      const updatedAt = new Map(sorted.map((item) => [item, collectionUpdatedAt(item)]));
      sorted.sort((a, b) => updatedAt.get(b) - updatedAt.get(a));
    }
    return sorted;
  }

  function renderCollections(items, store) {
    const { series } = context;
    const counts = new Map([[ALL_TITLES, 0]]);
    const categories = dedupeStrings(items.flatMap((item) => item.categories || [item.category]));
    categories.forEach((name) => counts.set(name, 0));
    (state.activeSeriesId ? items : filterItems(state, items, store, context.filterOptions(), true)).forEach((item) => {
      counts.set(ALL_TITLES, counts.get(ALL_TITLES) + 1);
      (item.categories || [item.category]).forEach((name) => counts.set(name, (counts.get(name) || 0) + 1));
    });
    const names = [ALL_TITLES, ...categories];
    if (!names.includes(state.category)) names.push(state.category);
    const collections = context.knownSeriesItems();
    const videos = context.allVideoItems();
    const otherVideos = videos.filter((item) => item.categories.includes(OTHER_VIDEOS));
    const activeCollections = new Set([OTHER_VIDEOS, ...collections.map((item) => series.seriesId(item))]);
    state.collectionNodes.forEach((ref, key) => {
      if (!activeCollections.has(key)) {
        ref.button.remove();
        state.collectionNodes.delete(key);
      }
    });
    const isLoadingVideos =
      state.apiStatus === 'loading' || [...state.seriesData.values()].some((record) => record.status === 'loading');
    state.refs.navs
      .filter((ref) => ref.mode === 'catalog')
      .forEach((ref) => {
        ref.count.dataset.loading = String(isLoadingVideos);
        ref.count.setAttribute('aria-hidden', String(isLoadingVideos));
        ref.button.setAttribute('aria-busy', String(isLoadingVideos));
        setText(ref.count, isLoadingVideos ? '' : videos.length);
      });
    collections.forEach((item) => {
      const id = series.seriesId(item);
      let ref = state.collectionNodes.get(id);
      if (!ref) {
        const button = actionButton('series', '', '', 'whtv-navbutton whtv-collection');
        button.dataset.id = item.id;
        const label = makeElement('span', 'whtv-collection-label', item.title);
        const count = makeElement('span', 'whtv-count');
        button.append(label, count);
        ref = { button, count, label };
        state.collectionNodes.set(id, ref);
        state.refs.collections.append(button);
      }
      ref.button.dataset.id = item.id;
      setText(ref.label, item.title);
      ref.button.setAttribute('aria-pressed', String(state.activeSeriesId === id));
      const record = state.seriesData.get(id);
      const isLoading = record?.status === 'loading';
      const videoCount = videos.filter((video) => video.parentSeriesId === id).length;
      ref.count.dataset.loading = String(isLoading);
      ref.count.setAttribute('aria-hidden', String(isLoading));
      ref.button.setAttribute('aria-busy', String(isLoading));
      if (isLoading) ref.button.setAttribute('aria-label', `${item.title}, Updating Video Count`);
      else ref.button.removeAttribute('aria-label');
      setText(ref.count, isLoading ? '' : videoCount);
      ref.button.title =
        record?.status === 'failed' || record?.partial
          ? `${videoCount} Videos Available. Open This Collection to Check Its Loading Status.`
          : `${videoCount} Videos`;
    });
    state.refs.collections.append(
      ...sortCollections(collections).map((item) => state.collectionNodes.get(series.seriesId(item)).button),
    );
    let other = state.collectionNodes.get(OTHER_VIDEOS);
    if (!other && otherVideos.length) {
      const button = actionButton('other-videos', '', '', 'whtv-navbutton whtv-collection');
      const count = makeElement('span', 'whtv-count');
      button.append(makeElement('span', 'whtv-collection-label', OTHER_VIDEOS), count);
      other = { button, count };
      state.collectionNodes.set(OTHER_VIDEOS, other);
    }
    if (other) {
      other.button.hidden = !otherVideos.length;
      other.button.setAttribute('aria-pressed', String(state.mode === 'catalog' && state.category === OTHER_VIDEOS));
      setText(other.count, otherVideos.length);
      state.refs.collections.append(other.button);
    }
    state.refs.collectionSort.querySelectorAll('input').forEach((input) => {
      input.checked = input.value === state.collectionSort;
    });
    syncChoiceMenu(
      state.refs.categoryControl,
      names.map((name) => [name, `${name === ALL_TITLES ? 'All Collections' : name} (${counts.get(name) || 0})`]),
      state.category,
    );
    const years = [...new Set(items.map((item) => item.year).filter(Boolean))]
      .sort((a, b) => b - a)
      .map((year) => [String(year), String(year)]);
    syncChoiceMenu(state.refs.yearControl, [['all', 'Any Year'], ...years], state.year);
  }

  return { renderCollections };
}

import { ALL_TITLES, OTHER_VIDEOS } from '../../constants.js';
import { sourceSignature } from '../../api/catalog.js';
import { accessLabel } from '../../api/normalize.js';
import { icon, setText } from '../../components/icons.js';
import { renderMediaGrid } from '../../components/media-grid.js';
import { syncChoiceMenu } from '../../components/navbar.js';
import { filterItems, renderMetadata } from '../../features/metadata.js';
import { readStore } from '../../state/store.js';
import { dedupeStrings } from '../../utils/text.js';
import { homeDescription } from '../home.js';
import { libraryDescription } from '../library.js';
import { renderEmpty } from './_components/empty-state.js';

/** The page-level render pass: header, filters, collections, hero, grid, and empty state. */
export function createCatalogView(context) {
  const { state } = context;

  function renderSeriesHeader() {
    const { series } = context;
    const refs = state.refs;
    const item = series.activeSeries();
    refs.seriesActions.hidden = !item;
    refs.backBrowse.hidden = !item;
    refs.breadcrumbSeparator.hidden = !item;
    refs.typeButtons.forEach((button) => {
      button.parentElement.hidden = Boolean(item);
    });
    refs.filterPanel.hidden = Boolean(item);
    if (!item) return;
    const id = series.seriesId(item);
    const record = state.seriesData.get(id);
    const episodes = series.activeEpisodes(id);
    const seasons = dedupeStrings(
      episodes.map((episode) => episode.seasonLabel || episode.episodeLabel?.match(/^Season \d+/)?.[0] || ''),
    ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    syncChoiceMenu(
      refs.seasonControl,
      [['all', 'All Seasons'], ...seasons.map((season) => [season, season])],
      state.season,
    );
    refs.seasonControl.menu.hidden = seasons.length < 2;
    refs.seriesRetry.dataset.id = item.id;
    refs.seriesRetry.hidden = record?.status !== 'failed' && !record?.partial;
  }

  function emptyReason(store, active) {
    const bucket = state.mode === 'library' ? store.saved : store.watched;
    const record = active ? state.seriesData.get(context.series.seriesId(active)) : null;
    if (active)
      return record?.status === 'failed' ? 'series-source' : record?.status === 'ready' ? 'filter' : 'loading';
    if (state.mode !== 'catalog' && !Object.keys(bucket).length) return state.mode;
    if (state.mode === 'catalog' && !state.items.length) return state.sourceStatus === 'loading' ? 'loading' : 'source';
    return 'filter';
  }

  function renderCatalog({ preserveScroll = false } = {}) {
    if (!state.mounted) return;
    const { series } = context;
    const refs = state.refs;
    const before = refs.grid?.querySelector(':not([hidden])');
    const scrollTop = refs.scroller?.scrollTop || 0;
    const anchorOffset = before ? before.getBoundingClientRect().top : 0;
    const store = readStore();
    const items = context.availableItems(store);
    const visible = filterItems(state, items, store, context.filterOptions());
    const active = series.activeSeries();
    const isAllVideos = state.mode === 'catalog' && !active && state.type !== 'Series';
    const name = active
      ? state.seriesData.get(series.seriesId(active))?.item?.title || active.title
      : state.mode === 'library'
        ? 'My Watchlist'
        : state.mode === 'watched'
          ? 'Watched'
          : isAllVideos
            ? state.category === OTHER_VIDEOS
              ? OTHER_VIDEOS
              : 'All Videos'
            : 'All Videos';
    refs.navs.forEach((ref) => {
      if (ref.mode === state.mode && !active) ref.button.setAttribute('aria-current', 'page');
      else ref.button.removeAttribute('aria-current');
      setText(
        ref.count,
        ref.mode === 'library'
          ? Object.keys(store.saved).length
          : ref.mode === 'watched'
            ? Object.keys(store.watched).length
            : '',
      );
    });
    setText(refs.pageTitle, name);
    refs.pageTitle.classList.toggle('whtv-breadcrumb-current', Boolean(active));
    refs.pageDescription.hidden = Boolean(active);
    if (!active)
      setText(
        refs.pageDescription,
        isAllVideos
          ? 'Browse videos from all your collections.'
          : state.mode === 'catalog'
            ? homeDescription
            : libraryDescription(state.mode),
      );
    setText(
      refs.pageCount,
      isAllVideos
        ? `${items.length} videos`
        : `${items.length} titles${state.apiItems.length ? ' · Homepage selections' : ''}`,
    );
    refs.pageCount.hidden = Boolean(active);
    setText(
      refs.resultTitle,
      active
        ? 'Episodes'
        : state.query
          ? 'Search Results'
          : state.category !== ALL_TITLES
            ? state.category
            : state.mode === 'library'
              ? 'Saved for Later'
              : state.mode === 'watched'
                ? 'Your Viewing History'
                : state.type === 'Series'
                  ? 'Collections'
                  : 'Explore the Catalog',
    );
    const isLoadingCollections =
      isAllVideos && [...state.seriesData.values()].some((record) => record.status === 'loading');
    setText(
      refs.resultCount,
      `${visible.length} ${active ? (visible.length === 1 ? 'episode' : 'episodes') : isAllVideos ? 'videos' : 'titles'}${isLoadingCollections ? ' · Loading collections…' : ''}`,
    );
    refs.resultCount.classList.toggle('whtv-resultcount-emphasis', Boolean(active));
    if (refs.searchInput.value !== state.query) refs.searchInput.value = state.query;
    refs.searchClear.hidden = !state.query;
    refs.searchKey.hidden = Boolean(state.query);
    refs.sortInputs.forEach((input) => {
      input.checked = input.value === state.sort;
    });
    syncChoiceMenu(refs.statusControl, null, state.status);
    refs.typeButtons.forEach((button) =>
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.value === (state.type === 'Series' ? 'Series' : 'all')),
      ),
    );
    refs.viewInputs.forEach((input) => {
      input.checked = input.value === state.view;
    });
    refs.grid.dataset.view = state.view;
    const displayIcon = state.view === 'compact' ? 'compact' : state.view === 'list' ? 'list' : 'browse';
    refs.viewMenu.querySelector('summary .whtv-icon').replaceWith(icon(displayIcon));
    context.renderCollections(active ? state.items : items, store);
    renderSeriesHeader();
    context.renderHero(visible);
    const reason = visible.length ? '' : emptyReason(store, active);
    const wasHidden = refs.grid.hidden;
    renderEmpty(state, reason);
    refs.grid.hidden = Boolean(reason);
    refs.grid.setAttribute('aria-busy', String(reason === 'loading'));
    renderMediaGrid(state, visible, store, {
      knownItems: context.knownItems,
      sourceSignature,
      seriesCountLabel: series.seriesCountLabel,
      runtimeText: series.runtimeText,
      seriesData: state.seriesData,
      seriesId: series.seriesId,
      accessLabel,
      renderMetadata,
    });
    if (wasHidden && !reason && !matchMedia('(prefers-reduced-motion: reduce)').matches)
      refs.grid.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: 'ease-out' });
    setText(
      refs.footerScope,
      active
        ? 'Counts show the videos available in this collection.'
        : isAllVideos
          ? 'Videos from all collections, including videos without a named collection.'
          : state.mode === 'catalog'
            ? `${state.items.length} loaded titles · Homepage selections, not the full service catalog`
            : 'Watchlist and watched marks are local. Export/import them in Display & data.',
    );
    if (preserveScroll) {
      if (before?.isConnected && !before.hidden)
        refs.scroller.scrollTop = scrollTop + (before.getBoundingClientRect().top - anchorOffset);
      else
        refs.scroller.scrollTop = Math.min(
          scrollTop,
          Math.max(0, refs.scroller.scrollHeight - refs.scroller.clientHeight),
        );
    } else refs.scroller.scrollTop = 0;
    if (state.detailId) context.updateDetailActions();
    series.observeCards(context.itemById);
  }

  return { renderCatalog };
}

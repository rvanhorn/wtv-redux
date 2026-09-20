import { FILTER_KEYS, STYLE_ID, createState } from '../../constants.js';
import { createCatalogClient } from '../../api/client.js';
import { createSeriesService } from '../../api/series.js';
import { createShell } from '../../components/navbar.js';
import { applyAccent } from '../../features/accent.js';
import { createRouter } from '../../router/router.js';
import { createCatalogStore } from '../../state/catalog.js';
import { readStore, resetFilters } from '../../state/store.js';
import {
  currentRouteKey,
  isExcludedSeriesId,
  isPlayerPage,
  seriesIdFromHref,
  shouldEagerMount,
} from '../../utils/url.js';
import { createActionHandlers } from './actions.js';
import { createCatalogItems } from './catalog-items.js';
import { createCatalogView } from './catalog-view.js';
import { createCollectionsNav } from './_components/collections.js';
import { createDetailsDialog } from './_components/details-dialog.js';
import { createDialogHost } from './_components/dialog.js';
import { createHero } from './_components/hero.js';
import { createSettingsDialog } from './_components/settings-dialog.js';
import { createToast } from './_components/toast.js';
import { createSourceLoader } from './source-loading.js';

const SORT_OPTIONS = ['recommended', 'alphabetical', 'category', 'year', 'saved', 'unwatched', 'duration'];
const VIEW_OPTIONS = ['grid', 'compact', 'list'];
const SEARCH_DEBOUNCE_MS = 100;
const SCROLL_SAVE_DEBOUNCE_MS = 120;

/**
 * Compose the application from its parts and own its lifecycle.
 *
 * The parts share one context object. This function fills it in creation order, and each part
 * reads a collaborator from it at call time, so parts that call each other in both directions do
 * not depend on that order. The context holds:
 * - `state`: the application state object.
 * - `catalog`, `series`, `client`, `router`: the learned catalog, series service, homepage data
 *   client, and router.
 * - Every public function returned by the part factories under this folder.
 * - `mountApp`, `removeApp`, `rememberScroll`, `restoreScroll`, and `queueSeries` from here.
 */
export function createApplication({ state = createState(), styleText = '' } = {}) {
  const context = { state };

  function addStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = styleText;
    document.head.append(style);
  }

  function rememberScroll() {
    if (state.refs.scroller) state.scrollMemory.set(state.routeKey, state.refs.scroller.scrollTop);
  }

  function restoreScroll(routeKey, fallback = 0) {
    const scroller = state.refs.scroller;
    if (!scroller) return;
    const value = state.scrollMemory.has(routeKey) ? state.scrollMemory.get(routeKey) : fallback;
    requestAnimationFrame(() => {
      if (state.refs.scroller === scroller) scroller.scrollTop = value;
    });
  }

  function mountApp() {
    if (state.mounted || state.disabled || isPlayerPage()) return;
    addStyle();
    state.refs = createShell(state);
    applyAccent(state.refs.app, state.accent);
    state.cardNodes = new Map();
    state.collectionNodes = new Map();
    for (const node of document.body.children)
      if (!['SCRIPT', 'STYLE', 'LINK'].includes(node.tagName)) {
        state.inertOriginal.set(node, node.inert);
        node.inert = true;
      }
    document.body.classList.add('whtv-redux-active');
    document.body.append(state.refs.app);
    state.mounted = true;
    state.refs.app.addEventListener('click', context.interceptCatalogLinks, true);
    state.refs.app.addEventListener('click', context.handleAction);
    state.refs.app.addEventListener('change', context.handleFilterChange);
    state.refs.searchInput.addEventListener('input', () => {
      state.query = state.refs.searchInput.value;
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => {
        if (state.mounted) context.renderCatalog({ preserveScroll: false });
      }, SEARCH_DEBOUNCE_MS);
    });
    state.refs.scroller.addEventListener(
      'scroll',
      () => {
        clearTimeout(state.scrollSaveTimer);
        state.scrollSaveTimer = setTimeout(rememberScroll, SCROLL_SAVE_DEBOUNCE_MS);
      },
      { passive: true },
    );
    context.installDialogListeners();
    context.startHeroRotation();
    context.renderCatalog({ preserveScroll: false });
  }

  function removeApp() {
    rememberScroll();
    clearTimeout(state.heroSwapTimer);
    state.heroSwapToken = 0;
    state.seriesObserver?.disconnect();
    state.seriesObserver = null;
    clearTimeout(state.searchTimer);
    clearTimeout(state.toastTimer);
    clearTimeout(state.scrollSaveTimer);
    if (state.refs.dialog?.open) state.refs.dialog.close();
    state.refs.app?.remove();
    state.inertOriginal.forEach((wasInert, node) => {
      if (node.isConnected) node.inert = wasInert;
    });
    state.inertOriginal.clear();
    document.body.classList.remove('whtv-redux-active');
    state.refs = {};
    state.mounted = false;
    state.cardNodes = new Map();
    state.collectionNodes = new Map();
  }

  // Explicit series requests wait for the learned catalog to load. Before that, the queue cannot
  // tell that a series' episodes are already known and would fetch them again on every reload.
  let catalogHydration = null;
  function queueSeries(item, explicit = false) {
    if (!catalogHydration) {
      context.series.queue(item, explicit);
      return;
    }
    void catalogHydration.then(() => {
      if (!state.disabled) context.series.queue(item, explicit);
    });
  }

  Object.assign(
    context,
    { mountApp, removeApp, rememberScroll, restoreScroll, queueSeries },
    createToast(state),
    createDialogHost(state),
    createCatalogItems(context),
    createHero(context),
    createCollectionsNav(context),
    createDetailsDialog(context),
    createSettingsDialog(context),
    createCatalogView(context),
    createSourceLoader(context),
    createActionHandlers(context),
  );

  context.catalog = createCatalogStore({
    state,
    onChange: () => {
      if (state.mounted) context.renderCatalog({ preserveScroll: true });
      context.refreshKnownSeries();
    },
  });
  context.series = createSeriesService({
    state,
    renderCatalog: context.renderCatalog,
    refreshSeriesDetails: context.refreshSeriesDetails,
    onSeriesResult: context.catalog.learnSeriesResult,
    catalogSeriesItem: context.catalog.seriesItem,
    catalogSeriesEpisodes: context.catalog.videoItems,
    catalogHasCompleteSeries: context.catalog.hasCompleteSeries,
  });
  context.client = createCatalogClient({
    state,
    onData: (result) => context.renderSource(result),
    onFailure: () => {
      context.settleSourceStatus();
      context.renderCatalog({ preserveScroll: true });
    },
  });
  context.router = createRouter(state, {
    snapshot: () => ({
      filters: Object.fromEntries(FILTER_KEYS.map((key) => [key, state[key]])),
      scroll: state.refs.scroller?.scrollTop || 0,
    }),
    resetFilters: () => resetFilters(state),
    queueSeries,
    seriesItem: context.series.seriesItem,
    activeSeries: context.series.activeSeries,
    loadHomeData: () => context.client.load(),
    renderCatalog: context.renderCatalog,
    rememberScroll,
    cancelHomeRequest: context.client.cancel,
    cancelSeriesRequests: context.series.cancel,
    installObserver: context.installObserver,
    mountApp,
    removeApp,
    restoreScroll,
    beginLoading: context.beginLoading,
    queueSourceRefresh: context.queueSourceRefresh,
    stopLoadTimer: context.stopLoadTimer,
  });

  function start() {
    if (window.__WHTV_REDUX_STARTED) return;
    window.__WHTV_REDUX_STARTED = true;
    const { catalog, series, router } = context;
    const store = readStore();
    state.sort = SORT_OPTIONS.includes(store.prefs.sort) ? store.prefs.sort : 'recommended';
    state.view = VIEW_OPTIONS.includes(store.prefs.view) ? store.prefs.view : 'grid';
    state.showHero = store.prefs.showHero !== false;
    state.accent = store.prefs.accent;
    state.collectionSort = store.prefs.collectionSort;
    state.routeKey = currentRouteKey();
    const routeSeriesId = seriesIdFromHref(location.href);
    state.activeSeriesId = isExcludedSeriesId(routeSeriesId) ? '' : routeSeriesId;
    catalog.loadBundled();
    series.loadCache();
    addStyle();
    router.install();
    context.installKeyboardShortcuts();
    if (isPlayerPage()) return;
    context.installObserver();
    catalogHydration = catalog.hydrate().finally(() => {
      catalogHydration = null;
    });
    if (shouldEagerMount()) mountApp();
    router.sync();
    context.beginLoading('Reading the Warhammer TV catalog…', true);
    if (state.activeSeriesId) queueSeries(series.activeSeries(), true);
    context.refreshKnownSeries();
  }

  return { state, start, renderCatalog: context.renderCatalog, showToast: context.showToast };
}

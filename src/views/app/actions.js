import { COLLECTION_SORTS, OTHER_VIDEOS, SERIES_CACHE_KEY, STORAGE_KEY } from '../../constants.js';
import { setText } from '../../components/icons.js';
import { applyAccent } from '../../features/accent.js';
import { toggleSaved } from '../../features/favorites.js';
import { applyImport, exportData } from '../../features/import-export.js';
import { toggleWatched } from '../../features/watched.js';
import { resetFilters, savePreference } from '../../state/store.js';

const FILTER_KEYS_FROM_CONTROLS = ['category', 'year', 'status', 'sort', 'view', 'season'];

/** Event handlers for buttons, filter controls, keyboard shortcuts, and in-app catalog links. */
export function createActionHandlers(context) {
  const { state } = context;

  function handleFilterChange(event) {
    const target = event.target;
    if (!target.matches('select[data-filter],input[data-filter],input[data-preference]')) return;
    if (target.dataset.preference === 'showHero') {
      state.showHero = target.checked;
      savePreference(state, 'showHero', state.showHero, context.showToast);
      context.renderCatalog({ preserveScroll: true });
      return;
    }
    if (target.dataset.preference === 'accent') {
      state.accent = target.value;
      applyAccent(state.refs.app, state.accent);
      savePreference(state, 'accent', state.accent, context.showToast);
      return;
    }
    const key = target.dataset.filter;
    if (key === 'collectionSort') {
      state.collectionSort = COLLECTION_SORTS.includes(target.value) ? target.value : 'page';
      savePreference(state, key, state.collectionSort, context.showToast);
      state.refs.collectionSort.open = false;
      state.refs.collectionSort.querySelector('summary').focus();
      context.renderCatalog({ preserveScroll: true });
      return;
    }
    if (!FILTER_KEYS_FROM_CONTROLS.includes(key)) return;
    if (key === 'category' && state.activeSeriesId) context.router.navigate('catalog');
    state[key] = target.value;
    if (key === 'sort' || key === 'view') savePreference(state, key, target.value, context.showToast);
    const choiceMenu = target.closest('.whtv-choice-menu');
    if (choiceMenu) {
      choiceMenu.open = false;
      choiceMenu.querySelector('summary').focus();
    }
    context.renderCatalog({ preserveScroll: key === 'view' });
  }

  function leaveForOriginalSite() {
    state.disabled = true;
    context.client.cancel();
    context.series.cancel();
    state.domLoading = false;
    context.stopLoadTimer();
    clearTimeout(state.refreshTimer);
    state.observer?.disconnect();
    context.removeApp();
  }

  function toggleHeroPause(button) {
    state.heroPaused = !state.heroPaused;
    state.refs.hero.dataset.paused = String(state.heroPaused);
    button.setAttribute('aria-pressed', String(state.heroPaused));
    button.setAttribute('aria-label', state.heroPaused ? 'Resume Featured Rotation' : 'Pause Featured Rotation');
    setText(button.querySelector('span'), state.heroPaused ? 'Resume' : 'Pause');
  }

  function clearSeriesCountCache(message = 'Series count cache cleared. Visible series will be checked again.') {
    const { series } = context;
    for (const [key, value] of state.seriesData)
      if (!state.seriesPending.has(key) && value.status !== 'loading') state.seriesData.delete(key);
    try {
      localStorage.removeItem(SERIES_CACHE_KEY);
    } catch {}
    state.seriesAutoCount = 0;
    context.closeDialog();
    context.renderCatalog({ preserveScroll: true });
    if (state.activeSeriesId) series.queue(series.activeSeries(), true);
    else context.refreshKnownSeries();
    context.showToast(message);
  }

  async function refreshArtwork() {
    await context.catalog.clearArtwork();
    clearSeriesCountCache('Stored artwork cleared. Series fetch their artwork again when opened.');
  }

  function handleAction(event) {
    const button = event.target.closest('button[data-action]');
    if (!button || !state.refs.app?.contains(button)) return;
    const { router, series, renderCatalog, closeDialog, showToast } = context;
    const action = button.dataset.action;
    const id = button.dataset.id;
    const item = id ? context.itemById(id) || (state.detailId === id ? state.detailItem : null) : null;
    if (action === 'mode') router.navigate(button.dataset.mode);
    else if (action === 'browse') router.navigate('catalog');
    else if (action === 'other-videos') {
      router.navigate('catalog');
      resetFilters(state);
      state.category = OTHER_VIDEOS;
      state.type = 'Episode';
      context.knownSeriesItems().forEach((candidate) => series.queue(candidate, true));
      renderCatalog({ preserveScroll: false });
    } else if (action === 'series' && item) router.navigate('catalog', series.seriesId(item));
    else if (action === 'category' || action === 'detail-category') {
      closeDialog();
      if (state.activeSeriesId) router.navigate('catalog');
      state.category = button.dataset.category;
      renderCatalog({ preserveScroll: false });
    } else if (action === 'type') {
      state.type = button.dataset.value === 'all' && state.mode === 'catalog' ? 'Episode' : button.dataset.value;
      renderCatalog({ preserveScroll: false });
    } else if (action === 'clear-search') {
      state.query = '';
      renderCatalog({ preserveScroll: false });
      state.refs.searchInput.focus({ preventScroll: true });
    } else if (action === 'reset') {
      resetFilters(state);
      state.season = 'all';
      renderCatalog({ preserveScroll: false });
    } else if (action === 'keyword') {
      router.navigate('catalog');
      resetFilters(state);
      state.query = button.dataset.keyword || '';
      renderCatalog({ preserveScroll: false });
    } else if (action === 'save' && item) toggleSaved(state, item, { renderCatalog, showToast });
    else if (action === 'watched' && item) toggleWatched(state, item, { renderCatalog, showToast });
    else if (action === 'details') context.showDetails(item, button);
    else if (action === 'close-dialog') closeDialog();
    else if (action === 'settings') context.openSettings(button);
    else if (action === 'original') leaveForOriginalSite();
    else if (action === 'refresh') {
      closeDialog();
      context.beginLoading('Refreshing catalog…', false, true);
    } else if (action === 'hero-prev' || action === 'hero-next') context.advanceHero(action === 'hero-next' ? 1 : -1);
    else if (action === 'hero-pause') toggleHeroPause(button);
    else if (action === 'dismiss-toast') {
      state.refs.toast.hidden = true;
      state.undoAction = null;
    } else if (action === 'undo') {
      const undo = state.undoAction;
      state.undoAction = null;
      if (undo) undo();
    } else if (action === 'export') exportData(state, { showToast });
    else if (action === 'import') state.refs.dialog.querySelector('[data-import-file]')?.click();
    else if (action === 'confirm-import') applyImport(state, { renderCatalog, showToast, closeDialog });
    else if (action === 'retry-series' && item) {
      const seriesId = series.seriesId(item);
      state.seriesData.delete(seriesId);
      series.queue(item, true);
      renderCatalog({ preserveScroll: true });
      context.refreshSeriesDetails(seriesId);
    } else if (action === 'clear-count-cache') clearSeriesCountCache();
    else if (action === 'refresh-artwork') void refreshArtwork();
  }

  function installKeyboardShortcuts() {
    window.addEventListener('keydown', (event) => {
      if (state.disabled || !state.mounted || state.refs.dialog?.open) return;
      const active = document.activeElement;
      const typing = active?.matches('input,textarea,select,[contenteditable="true"]');
      if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        state.refs.searchInput.focus({ preventScroll: true });
      }
      if (event.key === 'Escape' && active === state.refs.searchInput && state.query) {
        state.query = '';
        context.renderCatalog({ preserveScroll: false });
      }
    });
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY && state.mounted) context.renderCatalog({ preserveScroll: true });
    });
  }

  /** Route clicks on in-app series and home links through the router instead of the host page. */
  function interceptCatalogLinks(event) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const anchor = event.target.closest('a[href]');
    if (!anchor || !state.refs.app?.contains(anchor) || anchor.dataset.native === 'true' || anchor.target === '_blank')
      return;
    if (anchor.dataset.whtvHome) {
      event.preventDefault();
      event.stopPropagation();
      context.router.navigate('catalog');
      return;
    }
    const id = new URL(anchor.href).pathname.match(/^\/series\/(\d{1,12})\/?$/)?.[1];
    if (id) {
      event.preventDefault();
      event.stopPropagation();
      context.router.navigate('catalog', id);
    }
  }

  return { handleAction, handleFilterChange, installKeyboardShortcuts, interceptCatalogLinks };
}

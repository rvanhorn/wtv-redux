import { currentRouteKey, isExcludedSeriesId, isPlayerPage, seriesIdFromHref, shouldEagerMount } from '../utils/url.js';
import { parseOverlay, overlayHash } from './routes.js';

export function createRouter(state, handlers) {
  function overlayPathname(mode, seriesId) {
    return mode === 'catalog' && !seriesId && location.pathname.startsWith('/series/') ? '/' : location.pathname;
  }

  function navigate(mode, seriesId = '', push = true) {
    if (isExcludedSeriesId(seriesId)) seriesId = '';
    if (state.refs.dialog?.open) state.refs.dialog.close();
    if (seriesId && !state.activeSeriesId) state.browseSnapshot = handlers.snapshot();
    const restore = mode === 'catalog' && !seriesId && state.activeSeriesId && state.browseSnapshot;
    state.mode = mode;
    state.activeSeriesId = seriesId;
    state.season = 'all';
    handlers.resetFilters();
    if (mode === 'catalog' && !seriesId) state.type = 'Episode';
    if (restore) Object.assign(state, state.browseSnapshot.filters);
    if (push) {
      const hash = overlayHash(mode, seriesId);
      const pathname = overlayPathname(mode, seriesId);
      const routeChangedByNavigation = location.pathname !== pathname;
      if (location.hash !== hash || location.pathname !== pathname) {
        state.overlayHistoryWrite = true;
        try {
          history.pushState({ whtv: true }, '', `${pathname}${location.search}${hash}`);
        } finally {
          state.overlayHistoryWrite = false;
        }
        if (routeChangedByNavigation) {
          routeChanged();
          return;
        }
      }
    }
    state.overlayHash = location.hash || '';
    if (seriesId) handlers.queueSeries(handlers.seriesItem(seriesId), true);
    handlers.loadHomeData();
    handlers.renderCatalog({ preserveScroll: false });
    if (restore && state.refs.scroller) state.refs.scroller.scrollTop = state.browseSnapshot.scroll;
    else state.refs.pageTitle?.focus({ preventScroll: true });
  }

  function sync() {
    const parsed = parseOverlay(location.hash || '');
    if (location.hash && location.hash.startsWith('#whtv-')) {
      const pathname = overlayPathname(parsed.mode, parsed.seriesId);
      if (location.pathname !== pathname) {
        state.overlayHistoryWrite = true;
        try {
          history.replaceState({ whtv: true }, '', `${pathname}${location.search}${location.hash}`);
        } finally {
          state.overlayHistoryWrite = false;
        }
        routeChanged();
        return true;
      }
      navigate(parsed.mode, parsed.seriesId, false);
      return true;
    }
    return false;
  }

  function routeChanged() {
    const nextRoute = currentRouteKey();
    if (nextRoute === state.routeKey) {
      if ((location.hash || '') === (state.overlayHash || '')) {
        if (!state.disabled) handlers.queueSourceRefresh(250);
        return;
      }
      sync();
      return;
    }
    handlers.rememberScroll();
    handlers.cancelHomeRequest();
    state.apiAttempted = false;
    state.domItems = [];
    state.domLoading = false;
    state.routeKey = nextRoute;
    state.sourceSignature = '';
    handlers.resetFilters();
    state.heroId = '';
    if (state.refs.dialog?.open) state.refs.dialog.close();
    state.mode = 'catalog';
    const routeSeriesId = seriesIdFromHref(location.href);
    state.activeSeriesId = isExcludedSeriesId(routeSeriesId) ? '' : routeSeriesId;
    state.season = 'all';
    state.loadAttempt = 0;
    state.refreshQueuedAt = 0;
    handlers.stopLoadTimer();
    clearTimeout(state.refreshTimer);
    if (state.disabled || isPlayerPage()) {
      handlers.cancelSeriesRequests();
      handlers.removeApp();
      return;
    }
    handlers.installObserver();
    if (shouldEagerMount()) {
      handlers.mountApp();
      sync();
      handlers.restoreScroll(nextRoute, 0);
    } else handlers.removeApp();
    handlers.beginLoading('Loading Warhammer TV data…', true);
    if (state.activeSeriesId) handlers.queueSeries(handlers.activeSeries(), true);
  }

  function install() {
    if (state.historyHooked) return;
    state.historyHooked = true;
    ['pushState', 'replaceState'].forEach((method) => {
      const original = history[method];
      history[method] = function patchedHistory(...args) {
        const result = original.apply(this, args);
        if (!state.overlayHistoryWrite) setTimeout(routeChanged, 0);
        return result;
      };
    });
    window.addEventListener('popstate', () => setTimeout(routeChanged, 0));
    window.addEventListener('hashchange', () => {
      if (!state.disabled && state.mounted && (location.hash || '') !== (state.overlayHash || '')) sync();
    });
  }

  return { navigate, sync, routeChanged, install };
}

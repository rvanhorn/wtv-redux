import { APP_ID, MAX_LOAD_ATTEMPTS, SOURCE_REFRESH_DELAY } from '../../constants.js';
import { combinedSourceItems, extractItems, mergeSourceItems, sourceSignature } from '../../api/catalog.js';
import { isInsideApp } from '../../utils/dom.js';
import { isPlayerPage, shouldEagerMount } from '../../utils/url.js';

/**
 * Reads catalog titles from the host page and the homepage data request, retries the page scan
 * while the host is still rendering, and watches the host for later changes.
 */
export function createSourceLoader(context) {
  const { state } = context;

  function setSourceStatus(status, message) {
    state.sourceStatus = status;
    state.sourceMessage = message;
  }

  function sourceReadyMessage() {
    if (state.apiItems.length) {
      const extra = state.items.length - state.apiItems.length;
      return `${state.apiItems.length} homepage feed titles${extra > 0 ? ` + ${extra} page titles` : ''} · ${state.apiReport?.contentFeeds || 0} collections${state.apiReport?.failedFeeds ? ` · ${state.apiReport.failedFeeds} unavailable feed${state.apiReport.failedFeeds === 1 ? '' : 's'} skipped` : ''}`;
    }
    if (state.apiStatus === 'loading') return `${state.items.length} page titles · Loading homepage data…`;
    if (state.apiStatus === 'failed')
      return `${state.items.length} page titles · Homepage data unavailable; using page scan`;
    return `${state.items.length} titles found on this page`;
  }

  function settleSourceStatus() {
    if (state.items.length) setSourceStatus('ready', sourceReadyMessage());
    else if (state.apiStatus === 'loading' || state.domLoading)
      setSourceStatus('loading', 'Waiting for Warhammer TV catalog data…');
    else setSourceStatus('empty', state.apiError || 'Automatic loading stopped; no usable titles were returned');
  }

  function stopLoadTimer() {
    window.clearTimeout(state.loadTimer);
    state.loadTimer = null;
  }

  function applySourceItems(extracted, { reset = false } = {}) {
    if (!extracted.length) return false;
    const nextItems = reset ? extracted : mergeSourceItems(state.items, extracted);
    const signature = sourceSignature(nextItems);
    stopLoadTimer();
    state.domLoading = false;
    const changed = signature !== state.sourceSignature;
    state.items = nextItems;
    state.sourceSignature = signature;
    if (changed) {
      context.catalog.learnItems(nextItems);
      context.refreshKnownSeries();
    }
    if (!state.mounted) context.mountApp();
    setSourceStatus('ready', sourceReadyMessage());
    if (changed) context.renderCatalog({ preserveScroll: true });
    return changed;
  }

  /** Store a homepage data result and merge it with the titles scanned from the page. */
  function renderSource(result, reset = true) {
    state.apiItems = result.items;
    state.apiReport = result.report;
    state.apiStatus = result.items.length ? 'ready' : 'empty';
    const next = combinedSourceItems(state);
    if (next.length) applySourceItems(next, { reset });
    else {
      state.items = [];
      state.sourceSignature = '';
    }
  }

  function scanSource({ reset = false } = {}) {
    if (state.disabled || isPlayerPage()) return [];
    try {
      const extracted = extractItems();
      state.domItems = reset ? extracted : mergeSourceItems(state.domItems, extracted);
      const combined = combinedSourceItems(state);
      if (combined.length) applySourceItems(combined, { reset: true });
      return extracted;
    } catch {
      return [];
    }
  }

  function runLoadAttempt(reset) {
    if (state.disabled || isPlayerPage()) return;
    scanSource({ reset });
    if (state.items.length) {
      stopLoadTimer();
      state.domLoading = false;
      state.loadAttempt = 0;
      return;
    }
    state.loadAttempt += 1;
    if (state.loadAttempt >= MAX_LOAD_ATTEMPTS) {
      stopLoadTimer();
      state.domLoading = false;
      settleSourceStatus();
      context.renderCatalog({ preserveScroll: true });
      return;
    }
    setSourceStatus('loading', `Waiting for Warhammer TV… scan ${state.loadAttempt}/${MAX_LOAD_ATTEMPTS}`);
    context.renderCatalog({ preserveScroll: true });
    state.loadTimer = setTimeout(() => runLoadAttempt(false), Math.min(350 + state.loadAttempt * 140, 1100));
  }

  function beginLoading(message = 'Reading the Warhammer TV catalog…', reset = false, forceApi = false) {
    if (state.disabled || isPlayerPage()) return;
    stopLoadTimer();
    state.loadAttempt = 0;
    state.domLoading = true;
    if (shouldEagerMount()) context.client.load(forceApi);
    else state.apiStatus = 'unsupported';
    setSourceStatus(state.items.length ? 'ready' : 'loading', message);
    if (state.mounted || shouldEagerMount()) context.mountApp();
    context.renderCatalog({ preserveScroll: true });
    runLoadAttempt(reset);
  }

  function queueSourceRefresh(delay = SOURCE_REFRESH_DELAY) {
    if (state.disabled || isPlayerPage() || document.hidden) return;
    if (!state.refreshQueuedAt) state.refreshQueuedAt = Date.now();
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(
      () => {
        state.refreshQueuedAt = 0;
        const extracted = scanSource({ reset: false });
        if (
          !extracted.length &&
          !state.items.length &&
          state.sourceStatus !== 'loading' &&
          state.apiStatus !== 'loading'
        ) {
          setSourceStatus('empty', 'No catalog titles detected on this route');
          context.renderCatalog({ preserveScroll: true });
        }
      },
      Math.max(0, Math.min(delay, 1800 - (Date.now() - state.refreshQueuedAt))),
    );
  }

  function mutationTouchesSource(record) {
    if (isInsideApp(record.target)) return false;
    const nodes = [...record.addedNodes, ...record.removedNodes];
    return (
      !nodes.length ||
      !nodes.every((node) =>
        node.nodeType === Node.TEXT_NODE
          ? isInsideApp(node)
          : node.nodeType === Node.ELEMENT_NODE &&
            (node.id === APP_ID || isInsideApp(node) || Boolean(node.querySelector?.(`#${APP_ID}`))),
      )
    );
  }

  function installObserver() {
    if (state.observer) state.observer.disconnect();
    state.observer = new MutationObserver((records) => {
      if (state.disabled || isPlayerPage()) return;
      if (!records.some(mutationTouchesSource)) return;
      queueSourceRefresh();
    });
    state.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        'src',
        'srcset',
        'data-src',
        'data-lazy-src',
        'href',
        'value',
        'aria-valuenow',
        'aria-valuemax',
      ],
    });
  }

  return { renderSource, beginLoading, stopLoadTimer, settleSourceStatus, queueSourceRefresh, installObserver };
}

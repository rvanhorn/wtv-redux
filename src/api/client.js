import { HOME_DATA_MAX_CHARS, HOME_DATA_PATH, HOME_DATA_TIMEOUT_MS } from '../constants.js';
import { currentRouteKey, isPlayerPage, shouldEagerMount } from '../utils/url.js';
import { jsonLiteral } from '../utils/dom.js';
import { findFeedPayload, normalizeHomeData, payloadFromScripts } from './normalize.js';

export function currentPayload() {
  try {
    return (
      findFeedPayload(window.__remixContext) || payloadFromScripts(document.querySelectorAll('script'), jsonLiteral)
    );
  } catch {
    return null;
  }
}

export function createCatalogClient({ state, onData, onFailure, isLive }) {
  function cancel() {
    state.apiEpoch += 1;
    const request = state.apiRequest;
    state.apiRequest = null;
    if (request) {
      clearTimeout(request.timer);
      request.controller.abort();
    }
  }

  function load(force = false) {
    if (state.disabled || isPlayerPage() || !shouldEagerMount()) return null;
    if (state.apiRequest) return state.apiRequest.promise;
    if (state.apiAttempted && !force) return null;
    state.apiAttempted = true;
    state.apiStatus = 'loading';
    state.apiError = '';
    const request = {
      epoch: ++state.apiEpoch,
      route: state.routeKey,
      controller: new AbortController(),
      timer: null,
      timedOut: false,
      promise: null,
    };
    const live = () =>
      state.apiRequest === request &&
      state.apiEpoch === request.epoch &&
      state.routeKey === request.route &&
      currentRouteKey() === request.route &&
      !state.disabled &&
      !isPlayerPage() &&
      (!isLive || isLive(request));
    state.apiRequest = request;
    request.timer = setTimeout(() => {
      request.timedOut = true;
      request.controller.abort();
    }, HOME_DATA_TIMEOUT_MS);
    request.promise = (async () => {
      try {
        const response = await fetch(new URL(HOME_DATA_PATH, location.origin).href, {
          method: 'GET',
          credentials: 'same-origin',
          mode: 'same-origin',
          cache: 'no-store',
          redirect: 'error',
          headers: { Accept: 'application/json' },
          signal: request.controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (Number(response.headers.get('content-length')) > HOME_DATA_MAX_CHARS)
          throw new Error('Catalog response too large');
        if (!/\bjson\b/i.test(response.headers.get('content-type') || ''))
          throw new Error('The endpoint did not return JSON');
        const body = await response.text();
        if (body.length > HOME_DATA_MAX_CHARS) throw new Error('Catalog response too large');
        if (!live()) return;
        let payload;
        try {
          payload = JSON.parse(body);
        } catch {
          throw new Error('Invalid catalog JSON');
        }
        const result = normalizeHomeData(payload);
        if (!live()) return;
        onData(result);
      } catch (error) {
        if (!live()) return;
        state.apiStatus = 'failed';
        const known = [
          'Catalog response too large',
          'The endpoint did not return JSON',
          'Invalid catalog JSON',
          'Unexpected catalog response',
        ];
        state.apiError = request.timedOut
          ? 'Homepage request timed out; using page scan'
          : /^HTTP \d{3}$/.test(error?.message || '')
            ? `Homepage request failed (${error.message}); using page scan`
            : known.includes(error?.message)
              ? `${error.message}; using page scan`
              : 'Homepage request unavailable; using page scan';
        onFailure?.(error);
      } finally {
        clearTimeout(request.timer);
        if (live()) {
          state.apiRequest = null;
        }
      }
    })();
    return request.promise;
  }

  return { load, cancel };
}

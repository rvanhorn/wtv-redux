import { isExcludedSeriesId } from '../utils/url.js';

export function parseOverlay(hash) {
  const series = hash.match(/^#whtv-series=(\d{1,12})$/)?.[1];
  if (series && !isExcludedSeriesId(series)) return { mode: 'catalog', seriesId: series };
  if (hash === '#whtv-watchlist') return { mode: 'library', seriesId: '' };
  if (hash === '#whtv-watched') return { mode: 'watched', seriesId: '' };
  return { mode: 'catalog', seriesId: '' };
}

export function overlayHash(mode, seriesId = '') {
  return seriesId
    ? `#whtv-series=${seriesId}`
    : mode === 'library'
      ? '#whtv-watchlist'
      : mode === 'watched'
        ? '#whtv-watched'
        : '#whtv-browse';
}

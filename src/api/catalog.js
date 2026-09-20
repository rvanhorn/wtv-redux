import { PLAYER_PATH } from '../constants.js';
import { isExcludedSeriesHref, stableItemId } from '../utils/url.js';
import {
  getDocumentOrder,
  getSectionMarkers,
  getPageSeriesContext,
  sectionForLink,
  getItemContext,
  getMetadataText,
  getImageSource,
  getDescription,
  extractYear,
  extractDuration,
  extractEpisodeLabel,
  extractProgress,
  getTitle,
  isInsideApp,
  isVisible,
} from '../utils/dom.js';
import { mergeItemData } from './normalize.js';

export function extractItems() {
  const order = getDocumentOrder();
  const markers = getSectionMarkers(order);
  const pageSeries = getPageSeriesContext();
  const itemMap = new Map();
  let orderIndex = 0;
  const links = Array.from(document.querySelectorAll('a[href]'))
    .filter((link) => !isInsideApp(link))
    .filter((link) => {
      try {
        const url = new URL(link.href, window.location.origin);
        return (
          url.origin === window.location.origin &&
          !isExcludedSeriesHref(url.href) &&
          (url.pathname === PLAYER_PATH || url.pathname.startsWith('/series/'))
        );
      } catch {
        return false;
      }
    })
    .filter(isVisible);
  links.forEach((link) => {
    const href = link.href;
    const title = getTitle(link);
    if (!href || !title || title === 'Untitled') return;
    const type = href.includes('/series/') ? 'Series' : 'Episode';
    const category = sectionForLink(link, markers, order);
    const context = getItemContext(link);
    const metadataText = getMetadataText(context);
    const image = getImageSource(link) || getImageSource(context.querySelector?.('a[href]') || link);
    const item = {
      id: stableItemId(href, title),
      href,
      title,
      image,
      category,
      categories: [category],
      type,
      description: getDescription(context, title),
      year: extractYear(metadataText),
      duration: extractDuration(metadataText),
      episodeLabel: extractEpisodeLabel(metadataText),
      progress: extractProgress(context),
      series: type === 'Episode' ? pageSeries.title : '',
      order: orderIndex++,
    };
    if (itemMap.has(item.id)) mergeItemData(itemMap.get(item.id), item);
    else itemMap.set(item.id, item);
  });
  return [...itemMap.values()];
}

export function mergeSourceItems(existing, incoming) {
  const byId = new Map(existing.map((item) => [item.id, { ...item, categories: [...(item.categories || [])] }]));
  incoming.forEach((item) => {
    if (byId.has(item.id)) mergeItemData(byId.get(item.id), item);
    else byId.set(item.id, item);
  });
  return [...byId.values()].sort((a, b) => a.order - b.order);
}

export function combinedSourceItems(state) {
  if (!state.apiItems.length) return state.domItems.map((item) => ({ ...item }));
  const byId = new Map(
    state.apiItems.map((item) => [
      item.id,
      {
        ...item,
        categories: [...item.categories],
        keywords: [...(item.keywords || [])],
        collectionPositions: { ...item.collectionPositions },
      },
    ]),
  );
  for (const dom of state.domItems) {
    const item = byId.get(dom.id);
    if (item) {
      for (const key of ['description', 'image', 'year', 'duration', 'episodeLabel', 'series'])
        if (!item[key] && dom[key]) {
          item[key] = dom[key];
          if (key === 'duration') item.durationApproximate = false;
        }
      if (dom.progress != null) item.progress = dom.progress;
    } else if (!location.pathname.startsWith('/series/'))
      byId.set(dom.id, { ...dom, order: state.apiItems.length + dom.order });
  }
  return [...byId.values()];
}

export function sourceSignature(items) {
  return items
    .map((item) =>
      [
        item.id,
        item.href,
        item.series,
        item.title,
        item.image,
        item.description,
        item.year,
        item.releaseDate,
        item.seasonLabel,
        item.duration,
        item.episodeLabel,
        item.progress,
        item.dataSource,
        item.parentSeriesId,
        item.seriesHref,
        item.ageRating,
        item.ageRatingDescription,
        item.ageRatingCountry,
        item.sourceFree,
        item.requiresAuthentication,
        item.durationApproximate,
        (item.keywords || []).join('|'),
        JSON.stringify(item.collectionPositions || {}),
        (item.categories || []).join('|'),
      ].join('::'),
    )
    .join('||');
}

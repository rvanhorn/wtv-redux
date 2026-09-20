import { HOME_DATA_MAX_CHARS } from '../constants.js';
import { dedupeStrings } from '../utils/text.js';
import { catalogHref, dateValue, fieldText, imageHref, stableItemId } from '../utils/url.js';
import { extractEpisodeLabel } from '../utils/dom.js';

export function mergeItemData(target, incoming) {
  target.categories = dedupeStrings([...(target.categories || []), ...(incoming.categories || [])]);
  target.category = target.categories[0] || target.category || incoming.category || 'Library';
  for (const key of [
    'image',
    'year',
    'duration',
    'episodeLabel',
    'series',
    'sourceId',
    'parentSeriesId',
    'seriesHref',
    'ageRating',
    'ageRatingDescription',
    'ageRatingCountry',
    'dataSource',
  ])
    if (!target[key] && incoming[key]) target[key] = incoming[key];
  if (incoming.description && (!target.description || target.description.length < incoming.description.length))
    target.description = incoming.description;
  target.keywords = dedupeStrings([...(target.keywords || []), ...(incoming.keywords || [])]);
  target.collectionPositions = { ...incoming.collectionPositions, ...target.collectionPositions };
  for (const key of ['sourceFree', 'requiresAuthentication', 'durationApproximate'])
    if (target[key] == null && incoming[key] != null) target[key] = incoming[key];
  if (incoming.progress != null) target.progress = incoming.progress;
  if (!target.href && incoming.href) target.href = incoming.href;
  return target;
}

export function sourceKeywords(value) {
  const parts = Array.isArray(value)
    ? value.map((entry) => (typeof entry === 'string' ? entry : entry?.name))
    : typeof value === 'string'
      ? value.split(',')
      : [];
  return dedupeStrings(parts.map((entry) => fieldText(entry, 96)))
    .filter((entry) => !/^filter:/i.test(entry))
    .slice(0, 100);
}

export function normalizeHomeData(payload) {
  if (!payload || !Array.isArray(payload.serverLoadedFeeds)) throw new Error('Unexpected catalog response');
  const byId = new Map();
  const report = { feeds: 0, contentFeeds: 0, emptyFeeds: 0, failedFeeds: 0, entries: 0, duplicates: 0, ignored: 0 };
  const feeds = payload.serverLoadedFeeds.slice(0, 500);
  let order = 0;
  for (const wrapper of feeds) {
    const feed = wrapper?.feed;
    if (!feed || typeof feed !== 'object') continue;
    report.feeds += 1;
    if (feed.error || Number(feed.statusCode) >= 400 || Number(feed.status) >= 400) {
      report.failedFeeds += 1;
      continue;
    }
    const entries = Array.isArray(feed.entry) ? feed.entry.slice(0, 5000) : [];
    if (!entries.length) report.emptyFeeds += 1;
    const category = fieldText(feed.title, 160) || 'Library';
    let usable = 0;
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const kind = entry?.type?.value;
      if (!['series', 'episodes', 'video'].includes(kind)) {
        report.ignored += 1;
        continue;
      }
      const href = catalogHref(entry._webLink);
      const title = fieldText(entry.title, 500);
      if (!href || !title) {
        report.ignored += 1;
        continue;
      }
      const type = kind === 'series' ? 'Series' : 'Episode';
      const path = new URL(href).pathname;
      if ((type === 'Series') !== path.startsWith('/series/')) {
        report.ignored += 1;
        continue;
      }
      const extensions = entry.extensions && typeof entry.extensions === 'object' ? entry.extensions : {};
      const images = (Array.isArray(entry.media_group) ? entry.media_group : [])
        .filter((group) => group?.type === 'image')
        .flatMap((group) => (Array.isArray(group.media_item) ? group.media_item : []))
        .filter((image) => imageHref(image?.src));
      const image = images.find((candidate) => candidate.key === 'image_base') || images[0];
      const year =
        typeof extensions.production_year === 'number' &&
        Number.isInteger(extensions.production_year) &&
        extensions.production_year >= 1800 &&
        extensions.production_year <= 2200
          ? extensions.production_year
          : null;
      const length =
        typeof extensions.length === 'number' &&
        Number.isFinite(extensions.length) &&
        extensions.length > 0 &&
        extensions.length < 10000
          ? extensions.length
          : null;
      const duration = length === null ? '' : `${length} min`;
      const keywords = sourceKeywords(extensions.seo_keywords).length
        ? sourceKeywords(extensions.seo_keywords)
        : sourceKeywords(extensions.seo?.keywords);
      let parentSeriesId = '';
      let seasonLabel = '';
      try {
        const social =
          typeof extensions.social_url === 'string' ? new URL(extensions.social_url, location.origin) : null;
        if (social?.origin === location.origin && type === 'Episode') {
          parentSeriesId = social.pathname.match(/^\/tv-show\/(\d+)(?:-[^/]*)?\/season\//)?.[1] || '';
          const season = social.pathname.match(/\/season\/\d+-season-(\d+)(?:\/|$)/)?.[1];
          if (season) seasonLabel = `Season ${Number(season)}`;
        }
      } catch {}
      const position =
        typeof extensions.position === 'number' && Number.isInteger(extensions.position) && extensions.position >= 0
          ? extensions.position
          : index;
      const item = {
        id: stableItemId(href, title),
        sourceId: fieldText(String(entry.id ?? ''), 100),
        href,
        title,
        image: image ? imageHref(image.src) : '',
        type,
        category,
        categories: [category],
        description: fieldText(entry.summary) || fieldText(extensions.description),
        year,
        duration,
        episodeLabel: [seasonLabel, extractEpisodeLabel(title)].filter(Boolean).join(' · '),
        seasonLabel,
        releaseDate: dateValue(extensions.release_date),
        progress: null,
        series: '',
        seriesHref: '',
        parentSeriesId,
        keywords,
        ageRating: fieldText(extensions.age_rating?.name, 80),
        ageRatingDescription: fieldText(extensions.age_rating?.description, 1000),
        ageRatingCountry: fieldText(extensions.age_rating?.country_code, 12),
        sourceFree: typeof extensions.free === 'boolean' ? extensions.free : null,
        requiresAuthentication:
          typeof extensions.requires_authentication === 'boolean' ? extensions.requires_authentication : null,
        durationApproximate: Boolean(duration),
        dataSource: 'homepage-json',
        collectionPositions: { [category]: position },
        order: order++,
      };
      report.entries += 1;
      usable += 1;
      if (byId.has(item.id)) {
        report.duplicates += 1;
        mergeItemData(byId.get(item.id), item);
      } else byId.set(item.id, item);
    }
    if (usable) report.contentFeeds += 1;
  }
  const items = [...byId.values()];
  const seriesById = new Map(items.filter((item) => item.type === 'Series').map((item) => [item.sourceId, item]));
  for (const item of items) {
    const parent = seriesById.get(item.parentSeriesId);
    if (parent) {
      item.series = parent.title;
      item.seriesHref = parent.href;
    }
  }
  return { items, report };
}

export function accessLabel(item) {
  if (item.type !== 'Episode') return '';
  if (item.sourceFree === true && item.requiresAuthentication === false) return 'Free episode';
  if (item.requiresAuthentication === true) return 'Sign-in required';
  return '';
}

export function findFeedPayload(value) {
  if (value && Array.isArray(value.serverLoadedFeeds)) return value;
  const data = value?.state?.loaderData || value?.loaderData;
  if (data && typeof data === 'object')
    for (const entry of Object.values(data)) if (entry && Array.isArray(entry.serverLoadedFeeds)) return entry;
  return null;
}

export function payloadFromScripts(scripts, jsonLiteral) {
  for (const script of [...scripts].slice(0, 100)) {
    const text = script.textContent || '';
    if (text.length > HOME_DATA_MAX_CHARS) continue;
    if (/application\/(?:ld\+)?json/i.test(script.getAttribute('type') || '')) {
      try {
        const payload = findFeedPayload(JSON.parse(text));
        if (payload) return payload;
      } catch {}
    }
    const assignment = /\b(?:window\.)?__remixContext\s*=\s*/.exec(text);
    if (!assignment) continue;
    const rest = text.slice(assignment.index + assignment[0].length);
    const value = jsonLiteral(rest, 0);
    const payload = findFeedPayload(value);
    if (payload) return payload;
    const encoded = /^JSON\.parse\(\s*("(?:\\.|[^"\\])*")\s*\)/.exec(rest);
    if (encoded)
      try {
        const found = findFeedPayload(JSON.parse(JSON.parse(encoded[1])));
        if (found) return found;
      } catch {}
  }
  return null;
}

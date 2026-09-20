import { PLAYER_PATH } from '../constants.js';
import { uniqueText, cleanText } from './text.js';

const EXCLUDED_SERIES_IDS = new Set(['25852']);

export function seriesIdFromHref(value) {
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin ? url.pathname.match(/^\/series\/(\d{1,12})\/?$/)?.[1] || '' : '';
  } catch {
    return '';
  }
}

export function isExcludedSeriesId(value) {
  return EXCLUDED_SERIES_IDS.has(String(value ?? ''));
}

export function isExcludedSeriesHref(value) {
  const id = seriesIdFromHref(value);
  return Boolean(id && isExcludedSeriesId(id));
}

export function canonicalHref(href) {
  try {
    const url = new URL(href, window.location.origin);
    url.hash = '';
    url.searchParams.delete('screen-id');
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return String(href || '');
  }
}

export function stableItemId(href, title = '') {
  try {
    const url = new URL(href, window.location.origin);
    if (url.pathname.startsWith('/series/')) return `series:${url.pathname.split('/').filter(Boolean).pop()}`;
    const selfLink = url.searchParams.get('self-link') || '';
    const videoMatch = selfLink.match(/video-preload\/(\d+)\/streams\/(\d+)/i);
    if (videoMatch) return `video:${videoMatch[1]}:${videoMatch[2]}`;
    const compactSelfLink = selfLink.split(/[?&]play_next_/i)[0];
    if (compactSelfLink) return `player:${compactSelfLink}`;
    return `player:${url.pathname}:${uniqueText(title)}`;
  } catch {
    return `${href}::${uniqueText(title)}`;
  }
}

export function currentRouteKey() {
  return `${window.location.pathname}${window.location.search}`;
}

export function isPlayerPage() {
  return /^\/player(?:\/|$)/.test(window.location.pathname);
}

export function shouldEagerMount() {
  return window.location.pathname === '/' || window.location.pathname.startsWith('/series/');
}

export function catalogHref(value) {
  if (typeof value !== 'string' || !value) return '';
  try {
    const url = new URL(value, location.origin);
    if (isExcludedSeriesHref(url.href)) return '';
    return url.origin === location.origin &&
      /^https?:$/.test(url.protocol) &&
      (/^\/player\/?$/.test(url.pathname) || /^\/series\/[\w-]+\/?$/.test(url.pathname))
      ? url.href
      : '';
  } catch {
    return '';
  }
}

export function imageHref(value) {
  if (typeof value !== 'string' || !value) return '';
  try {
    const url = new URL(value, location.origin);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

export function fieldText(value, max = 8000) {
  return typeof value === 'string' ? cleanText(value).slice(0, max) : '';
}

export function yearValue(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1800 && number <= 2200 ? number : null;
}

export function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return '';
  const day = value.slice(0, 10);
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day ? day : '';
}

export function dateText(value) {
  return value
    ? new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : '';
}

export function episodeKey(item) {
  return item.sourceId || item.id.match(/^video:(\d+):/)?.[1] || item.id;
}

export function durationSeconds(value) {
  if (!value) return null;
  if (/^\d+(?::\d{2}){1,2}$/.test(value))
    return value.split(':').reduce((total, number) => total * 60 + Number(number), 0);
  const minutes = value.match(/^(\d+)\s*min/i);
  return minutes ? Number(minutes[1]) * 60 : null;
}

export function portableHref(value, depth = 0) {
  if (typeof value !== 'string' || depth > 4) return '';
  try {
    const url = new URL(value, location.origin);
    if (depth === 0) {
      if (
        !['warhammertv.com', 'www.warhammertv.com', new URL(location.origin).hostname].includes(url.hostname) ||
        url.protocol !== 'https:'
      )
        return '';
      if (/^\/series\/\d{1,12}\/?$/.test(url.pathname))
        return isExcludedSeriesHref(url.href) ? '' : new URL(url.pathname, location.origin).href;
      if (url.pathname !== PLAYER_PATH) return '';
      const self = portableHref(url.searchParams.get('self-link'), depth + 1);
      if (!self) return '';
      const target = new URL(PLAYER_PATH, location.origin);
      target.searchParams.set('self-link', self);
      const screen = url.searchParams.get('screen-id');
      if (screen && /^[\w-]{1,80}$/.test(screen)) target.searchParams.set('screen-id', screen);
      return target.href;
    }
    if (url.origin !== 'https://zapp-gw.web.app' || !/^\/beacon\/video-preload\/\d+\/streams\/\d+$/.test(url.pathname))
      return '';
    const target = new URL(url.origin + url.pathname);
    for (const key of ['ageRating', 'overrideType', 'free', 'play_next_ids']) {
      const parameter = url.searchParams.get(key);
      if (parameter && parameter.length < 20000 && /^[\w,:.-]+$/.test(parameter))
        target.searchParams.set(key, parameter);
    }
    const next = url.searchParams.get('play_next_feed_url');
    if (next) {
      const clean = portableHref(next, depth + 1);
      if (clean) target.searchParams.set('play_next_feed_url', clean);
    }
    return target.href;
  } catch {
    return '';
  }
}

export function portableImage(value) {
  const source = imageHref(value);
  if (!source) return '';
  const url = new URL(source);
  return [
    'warhammertv.com',
    'www.warhammertv.com',
    'beacon.playback.api.brightcove.com',
    'assets-secure.applicaster.com',
    'assets-production.applicaster.com',
  ].includes(url.hostname) && !url.search
    ? source
    : '';
}

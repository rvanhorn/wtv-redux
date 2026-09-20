import { APP_ID, PLAYER_PATH, SECTION_NAMES } from '../constants.js';
import { cleanText, dedupeStrings, uniqueText, clamp } from './text.js';
import { stableItemId } from './url.js';

export function isVisible(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function isInsideApp(node) {
  if (!node) return false;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
  return node.id === APP_ID || Boolean(node.closest && node.closest(`#${APP_ID}`));
}

export function makeElement(tagName, className = '', text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function makeButton(text, className, handler) {
  const button = makeElement('button', className, text);
  button.type = 'button';
  button.addEventListener('click', handler);
  return button;
}

export function getImageSource(link) {
  const images = Array.from(link?.querySelectorAll?.('img') || []);
  for (const image of images) {
    const sources = [
      image.currentSrc,
      image.getAttribute('data-src'),
      image.getAttribute('data-lazy-src'),
      image.getAttribute('data-original'),
      image.src,
    ];
    for (const source of sources) {
      if (!source || source.startsWith('data:')) continue;
      try {
        const url = new URL(source, location.href);
        if (/^https?:$/.test(url.protocol)) return url.href;
      } catch {}
    }
  }
  return images.find((image) => image.src && !image.src.startsWith('data:image/gif'))?.src || '';
}

export function firstUsefulLine(element) {
  const lines = String(element?.innerText || '')
    .split(/\n+/)
    .map(uniqueText)
    .filter(Boolean);
  return lines.find((line) => line.length <= 180) || lines[0] || '';
}

export function getTitle(link) {
  const image = link.querySelector('img[alt]:not([alt=""])');
  const heading = link.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"], [class*="title" i]');
  const headingText = uniqueText(heading?.textContent);
  const rawAria = uniqueText(link.getAttribute('aria-label')).replace(/^Play\s+/i, '');
  const ariaLabel = /^(?:play|video|play video|watch|open)$/i.test(rawAria) ? '' : rawAria;
  const rawImageAlt = uniqueText(image?.alt);
  const imageAlt = /^(?:image|thumbnail|video|play)$/i.test(rawImageAlt) ? '' : rawImageAlt;
  return uniqueText(
    headingText ||
      ariaLabel ||
      imageAlt ||
      uniqueText(link.getAttribute('title')) ||
      firstUsefulLine(link) ||
      'Untitled',
  );
}

export function getDocumentOrder() {
  return new Map(
    Array.from(document.querySelectorAll('body *'))
      .filter((element) => !isInsideApp(element))
      .map((element, index) => [element, index]),
  );
}

export function getSectionMarkers(order) {
  const names = new Set(SECTION_NAMES);
  const preferred = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]'));
  const markers = preferred
    .filter((element) => !isInsideApp(element) && names.has(cleanText(element.textContent)) && isVisible(element))
    .map((element) => ({ name: cleanText(element.textContent), index: order.get(element) ?? -1 }));
  if (markers.length >= 3) return markers.filter((marker) => marker.index >= 0).sort((a, b) => a.index - b.index);
  const fallback = Array.from(document.querySelectorAll('body *'))
    .filter(
      (element) =>
        !isInsideApp(element) &&
        names.has(cleanText(element.textContent)) &&
        element.children.length <= 2 &&
        isVisible(element),
    )
    .map((element) => ({ name: cleanText(element.textContent), index: order.get(element) ?? -1 }));
  return [...markers, ...fallback]
    .filter(
      (marker, index, array) =>
        marker.index >= 0 &&
        array.findIndex((candidate) => candidate.name === marker.name && candidate.index === marker.index) === index,
    )
    .sort((a, b) => a.index - b.index);
}

export function sectionForLink(link, markers, order) {
  const linkIndex = order.get(link) ?? 0;
  let section = 'Library';
  for (const marker of markers) {
    if (marker.index >= linkIndex) break;
    section = marker.name;
  }
  return section;
}

export function getItemContext(link) {
  const directArticle = link.closest('article, li, [role="listitem"]');
  if (directArticle && !isInsideApp(directArticle)) return directArticle;
  let current = link;
  let best = link;
  for (let depth = 0; depth < 6 && current && current !== document.body; depth += 1) {
    current = current.parentElement;
    if (!current || isInsideApp(current)) break;
    const links = Array.from(current.querySelectorAll('a[href]')).filter((anchor) => {
      try {
        const url = new URL(anchor.href, location.origin);
        return url.origin === location.origin && (url.pathname === PLAYER_PATH || url.pathname.startsWith('/series/'));
      } catch {
        return false;
      }
    });
    if (new Set(links.map((anchor) => stableItemId(anchor.href, getTitle(anchor)))).size > 1) break;
    const text = cleanText(current.innerText);
    const linkCount = current.querySelectorAll('a[href]').length;
    if (text.length <= 1600 && linkCount <= 5) best = current;
    if (text.length > 2600 || linkCount > 12) break;
  }
  return best;
}

export function getDescription(context, title) {
  if (!context) return '';
  const selectors = [
    '[class*="description" i]',
    '[class*="summary" i]',
    '[class*="synopsis" i]',
    '[class*="excerpt" i]',
    '[class*="copy" i]',
    'p',
  ];
  const nodes = selectors.flatMap((selector) => Array.from(context.querySelectorAll(selector)));
  if (!nodes.length && context !== document.body) nodes.push(context);
  const titleLower = title.toLowerCase();
  const candidates = [...new Set(nodes)]
    .filter(isVisible)
    .map((node) => uniqueText(node.innerText || node.textContent))
    .map((text) => (text.toLowerCase().startsWith(titleLower) ? uniqueText(text.slice(title.length)) : text))
    .filter((text) => text.length >= 38 && text.length <= 1000)
    .filter((text) => text.toLowerCase() !== titleLower && !SECTION_NAMES.includes(text));
  return candidates.sort((a, b) => Math.abs(a.length - 220) - Math.abs(b.length - 220))[0] || '';
}

export function getMetadataText(context) {
  if (!context) return '';
  const explicit = Array.from(
    context.querySelectorAll(
      'time, [datetime], [data-year], [data-duration], [class*="duration" i], [class*="runtime" i], [class*="year" i], [class*="metadata" i], [class*="episode-number" i], [class*="season-number" i], span',
    ),
  )
    .filter(
      (element) =>
        !isInsideApp(element) &&
        !element.closest('p, [class*="description" i], [class*="synopsis" i], [class*="summary" i]'),
    )
    .map((element) =>
      uniqueText(
        element.getAttribute('data-year') ||
          element.getAttribute('data-duration') ||
          element.getAttribute('datetime') ||
          element.innerText ||
          element.textContent,
      ),
    )
    .filter((text) => text && text.length <= 140);
  if (explicit.length) return dedupeStrings(explicit).join(' · ');
  return String(context.innerText || '')
    .split(/\n+/)
    .map(cleanText)
    .filter(
      (text) =>
        text.length < 70 &&
        /^(?:(?:19|20)\d{2}|\d{1,2}:\d{2}(?::\d{2})?|\d{1,3}\s*min(?:ute)?s?|(?:S(?:eason)?|E(?:pisode)?)\s*\d{1,3}.*)$/i.test(
          text,
        ),
    )
    .join(' · ');
}

export function extractYear(text) {
  const currentYear = new Date().getFullYear() + 1;
  return (
    Array.from(String(text).matchAll(/\b(19\d{2}|20\d{2})\b/g))
      .map((match) => Number(match[1]))
      .find((year) => year >= 1980 && year <= currentYear) || null
  );
}

export function extractDuration(text) {
  const clock = String(text).match(/\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b/);
  if (clock) return clock[0];
  const minutes = String(text).match(/\b\d{1,3}\s*(?:min|mins|minute|minutes)\b/i);
  return minutes ? cleanText(minutes[0]) : '';
}

export function extractEpisodeLabel(text) {
  const compact = String(text).match(/\bS(?:eason)?\s*(\d{1,2})\s*[·\-: ]*E(?:pisode)?\s*(\d{1,3})\b/i);
  if (compact) return `S${compact[1]} · E${compact[2]}`;
  const season = String(text).match(/\bSeason\s+(\d{1,2})\b/i);
  const episode = String(text).match(/\bEpisode\s+(\d{1,3})\b/i);
  if (season && episode) return `S${season[1]} · E${episode[1]}`;
  if (episode) return `Episode ${episode[1]}`;
  return season ? `Season ${season[1]}` : '';
}

export function extractProgress(context) {
  if (!context) return null;
  const nativeProgress = context.querySelector('progress');
  if (nativeProgress) {
    const max = Number(nativeProgress.max || 100);
    const value = Number(nativeProgress.value || 0);
    if (Number.isFinite(max) && max > 0 && Number.isFinite(value))
      return clamp(Math.round((value / max) * 100), 0, 100);
  }
  const ariaProgress = context.querySelector('[role="progressbar"][aria-valuenow]');
  if (ariaProgress) {
    const value = Number(ariaProgress.getAttribute('aria-valuenow'));
    const min = Number(ariaProgress.getAttribute('aria-valuemin') || 0);
    const max = Number(ariaProgress.getAttribute('aria-valuemax') || 100);
    if (Number.isFinite(value) && Number.isFinite(min) && Number.isFinite(max) && max > min)
      return clamp(Math.round(((value - min) / (max - min)) * 100), 0, 100);
  }
  return null;
}

export function getPageSeriesContext() {
  if (!window.location.pathname.startsWith('/series/')) return { title: '', year: null };
  const headings = Array.from(document.querySelectorAll('h1, h2, [role="heading"]'))
    .filter((element) => !isInsideApp(element) && isVisible(element))
    .map((element) => uniqueText(element.innerText || element.textContent))
    .filter((text) => text && !SECTION_NAMES.includes(text) && !/^Episodes?$/i.test(text));
  return { title: headings.find((text) => text.length <= 180) || '', year: null };
}

export function jsonLiteral(text, start = 0) {
  let index = start;
  while (/\s/.test(text[index] || '') && index < text.length) index += 1;
  if (!'{['.includes(text[index] || '!')) return null;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let cursor = index; cursor < text.length; cursor += 1) {
    const character = text[cursor];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{' || character === '[') depth += 1;
    else if (character === '}' || character === ']') {
      if (--depth === 0) {
        try {
          return JSON.parse(text.slice(index, cursor + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

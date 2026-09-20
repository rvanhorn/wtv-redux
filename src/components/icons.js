import {
  ArrowDownWideNarrow,
  ArrowDownAZ,
  Bookmark,
  Check,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  Film,
  Grid2X2,
  Grid3X3,
  Info,
  List,
  Play,
  RefreshCw,
  Search,
  Settings2,
  SlidersHorizontal,
  SquareCheckBig,
  Upload,
  X,
  createElement,
} from 'lucide';
import { makeElement } from '../utils/dom.js';

const ICON_NODES = {
  sort: ArrowDownWideNarrow,
  alphabetical: ArrowDownAZ,
  calendar: Calendar,
  play: Play,
  browse: Grid2X2,
  bookmark: Bookmark,
  check: Check,
  watched: SquareCheckBig,
  search: Search,
  close: X,
  external: ExternalLink,
  info: Info,
  right: ChevronRight,
  left: ChevronLeft,
  list: List,
  compact: Grid3X3,
  filters: SlidersHorizontal,
  settings: Settings2,
  refresh: RefreshCw,
  film: Film,
  download: Download,
  upload: Upload,
  clock: Clock,
};

export function icon(name) {
  return createElement(ICON_NODES[name] ?? Info, {
    class: 'whtv-icon',
    'aria-hidden': 'true',
    focusable: 'false',
  });
}

export function actionButton(action, label, iconName, className = 'whtv-button', itemId = '') {
  const button = makeElement('button', className);
  button.type = 'button';
  button.dataset.action = action;
  if (itemId) button.dataset.id = itemId;
  if (iconName) button.append(icon(iconName));
  if (label) button.append(makeElement('span', '', label));
  return button;
}

export function iconButton(action, label, iconName, className = '', itemId = '') {
  const button = actionButton(action, '', iconName, `whtv-iconbutton ${className}`, itemId);
  button.setAttribute('aria-label', label);
  button.title = label;
  return button;
}

export function playbackLink(item, className = 'whtv-button whtv-primary') {
  const link = makeElement('a', className);
  link.href = item.href;
  link.append(
    icon(item.type === 'Series' ? 'film' : 'play'),
    makeElement('span', '', item.type === 'Series' ? 'View Episodes' : 'Watch Now'),
  );
  link.dataset.whtvCardLink = 'true';
  return link;
}

export function setText(node, text) {
  const value = String(text ?? '');
  if (node && node.textContent !== value) node.textContent = value;
}
export function setImage(image, url) {
  if (!image || image.dataset.url === (url || '')) return;
  image.dataset.url = url || '';
  image.hidden = !url;
  image.classList.remove('whtv-img-loaded');
  if (url) image.src = url;
  else image.removeAttribute('src');
  if (url && image.complete && image.naturalWidth > 4) image.classList.add('whtv-img-loaded');
}
export function createImage(className, lazy = true) {
  const image = makeElement('img', className);
  image.alt = '';
  image.decoding = 'async';
  image.loading = lazy ? 'lazy' : 'eager';
  image.addEventListener('load', () => {
    if (image.naturalWidth <= 4 || image.naturalHeight <= 4) image.hidden = true;
    else image.classList.add('whtv-img-loaded');
  });
  image.addEventListener('error', () => {
    image.hidden = true;
  });
  return image;
}
export function fallbackArtwork() {
  const node = makeElement('div', 'whtv-art-fallback');
  node.setAttribute('aria-hidden', 'true');
  node.append(icon('film'));
  return node;
}
export function loader(label = 'Loading Titles', small = false) {
  const box = makeElement('div', `whtv-loader ${small ? 'whtv-loader-small' : ''}`);
  box.setAttribute('role', 'status');
  box.setAttribute('aria-live', 'polite');
  const motion = makeElement('span', 'whtv-loader-orbit');
  motion.setAttribute('aria-hidden', 'true');
  box.append(motion, makeElement('span', '', label));
  return box;
}

import { makeElement } from '../utils/dom.js';
import { iconButton, actionButton, icon, createImage, fallbackArtwork, setImage, setText } from './icons.js';
import { isSaved, isWatched } from '../storage/storage.js';

export function createMediaCard(item) {
  const article = makeElement('article', 'whtv-card');
  article.dataset.id = item.id;
  const art = makeElement('div', 'whtv-card-art');
  const media = makeElement('a', 'whtv-card-media');
  media.dataset.whtvCardLink = 'true';
  const image = createImage('whtv-card-img');
  const overlay = makeElement('span', 'whtv-card-play');
  overlay.append(icon('play'));
  media.append(fallbackArtwork(), image, overlay);
  art.append(media);
  const save = iconButton('save', `Save ${item.title}`, 'bookmark', 'whtv-card-bookmark', item.id);
  const details = iconButton('details', `Details for ${item.title}`, 'info', 'whtv-card-detail', item.id);
  const runtime = makeElement('span', 'whtv-card-runtime');
  const flag = makeElement('span', 'whtv-watchedflag');
  flag.append(icon('check'), makeElement('span', '', 'Watched'));
  const progress = makeElement('div', 'whtv-progress');
  const fill = makeElement('span');
  progress.append(fill);
  art.append(save, runtime, details, flag, progress);
  article.append(art);
  const body = makeElement('div', 'whtv-card-body');
  const heading = makeElement('h3');
  const title = actionButton('details', '', '', 'whtv-card-title', item.id);
  heading.append(title);
  const meta = makeElement('div', 'whtv-metadata');
  const series = makeElement('div', 'whtv-card-series');
  const description = makeElement('p', 'whtv-card-description');
  body.append(heading, meta, series, description);
  article.append(body);
  return {
    article,
    image,
    media,
    save,
    details,
    runtime,
    flag,
    progress,
    fill,
    title,
    meta,
    series,
    description,
    signature: '',
  };
}

export function patchSaveButton(button, item, store, withText = false) {
  const saved = isSaved(store, item);
  button.setAttribute('aria-pressed', String(saved));
  const label = saved ? `Remove ${item.title} from Watchlist` : `Save ${item.title} to Watchlist`;
  button.setAttribute('aria-label', label);
  button.title = label;
  if (withText) setText(button.querySelector('span'), saved ? 'In Watchlist' : 'Add to Watchlist');
}

export function updateMediaCard(ref, item, store, options) {
  const { sourceSignature, seriesCountLabel, runtimeText } = options;
  const record = item.type === 'Series' ? options.seriesData.get(options.seriesId(item)) : null;
  const signature = JSON.stringify([
    sourceSignature([item]),
    seriesCountLabel(item),
    record?.year,
    record?.description,
    isSaved(store, item),
    isWatched(store, item),
  ]);
  if (signature === ref.signature) return;
  ref.signature = signature;
  ref.article.dataset.contentType = item.type;
  ref.media.href = item.href;
  ref.media.setAttribute('aria-label', `${item.type === 'Series' ? 'View Episodes in' : 'Play'}: ${item.title}`);
  setImage(ref.image, item.image);
  setText(ref.title, item.title);
  ref.title.title = item.title;
  const category =
    (item.categories || []).find((entry) => !['New Releases', 'Top Ten This Week', 'Library'].includes(entry)) ||
    item.category;
  options.renderMetadata(ref.meta, [
    item.type === 'Series' ? 'Series' : 'Video',
    record?.year || item.year,
    item.episodeLabel || (category !== 'Library' ? category : ''),
  ]);
  setText(ref.series, item.series);
  ref.series.hidden = !item.series || item.series === item.title;
  setText(ref.description, record?.description || item.description);
  ref.description.hidden = !(record?.description || item.description);
  ref.runtime.hidden = item.type === 'Series' ? false : !item.duration;
  setText(ref.runtime, item.type === 'Series' ? seriesCountLabel(item) : runtimeText(item));
  ref.runtime.title =
    item.type === 'Series'
      ? 'Episode count from the series page.'
      : item.durationApproximate
        ? 'Approximate runtime in minutes, as reported in the feed.'
        : item.duration;
  patchSaveButton(ref.save, item, store);
  ref.flag.hidden = !isWatched(store, item);
  ref.progress.hidden = !(item.progress > 0 && item.progress < 100);
  ref.fill.style.width = `${Number(item.progress) || 0}%`;
  ref.progress.title = `${item.progress}% played on the source page`;
}

import {
  actionButton,
  createImage,
  fallbackArtwork,
  icon,
  iconButton,
  loader,
  playbackLink,
  setImage,
  setText,
} from '../../../components/icons.js';
import { renderMetadata } from '../../../features/metadata.js';
import { isSaved, isWatched, readStore } from '../../../state/store.js';
import { makeElement } from '../../../utils/dom.js';
import { dateText } from '../../../utils/url.js';

/** The title details dialog. Reads `context.series` and the dialog host at call time. */
export function createDetailsDialog(context) {
  const { state } = context;

  function showDetails(item, trigger) {
    if (!item) return;
    const { series } = context;
    state.detailId = item.id;
    state.detailItem = item;
    state.settingsOpen = false;
    state.dialogTrigger = trigger || document.activeElement;
    const art = makeElement('div', 'whtv-dialogart');
    art.append(fallbackArtwork());
    const image = createImage('', false);
    setImage(image, item.image);
    art.append(image);
    const body = makeElement('div', 'whtv-details');
    const header = makeElement('div', 'whtv-details-header');
    const introduction = makeElement('div', 'whtv-details-intro');
    const title = makeElement('h2', '', item.title);
    title.id = 'whtv-dialog-title';
    const meta = makeElement('div', 'whtv-metadata');
    meta.dataset.detailMeta = 'true';
    renderMetadata(meta, [
      item.type === 'Series' ? 'Series' : '',
      item.releaseDate ? dateText(item.releaseDate) : item.year,
      series.runtimeText(item),
      item.episodeLabel,
      item.ageRating,
    ]);
    const actions = makeElement('div', 'whtv-details-actions');
    const save = actionButton('save', 'Add to Watchlist', 'bookmark', 'whtv-button', item.id);
    save.dataset.detailSave = 'true';
    const watched = actionButton(
      'watched',
      item.type === 'Series' ? 'Mark Series Watched' : 'Mark Watched',
      'check',
      'whtv-button',
      item.id,
    );
    watched.dataset.detailWatched = 'true';
    actions.append(playbackLink(item), save, watched);
    const synopsis = makeElement('p', '', item.description || 'No synopsis supplied for this title.');
    synopsis.dataset.synopsis = 'true';
    introduction.append(title);
    if (item.seriesHref && item.type === 'Episode') {
      const link = makeElement('a', 'whtv-details-series');
      link.append(makeElement('span', '', item.series || 'View Series'), icon('right'));
      link.href = item.seriesHref;
      introduction.append(link);
    }
    introduction.append(meta);
    if (item.categories?.length) {
      const collections = makeElement('div', 'whtv-detailcollections');
      collections.setAttribute('role', 'group');
      collections.setAttribute('aria-label', 'Collections');
      item.categories.forEach((category) => {
        const button = actionButton('detail-category', category);
        button.dataset.category = category;
        collections.append(button);
      });
      introduction.append(collections);
    }
    introduction.append(actions);
    header.append(art, introduction);
    const content = makeElement('div', 'whtv-details-content');
    const overview = makeElement('section', 'whtv-details-overview');
    overview.append(makeElement('h3', '', 'Synopsis'), synopsis);
    if (item.ageRatingDescription) {
      const country = item.ageRatingCountry ? ` (${item.ageRatingCountry.toUpperCase()})` : '';
      overview.append(
        makeElement('p', 'whtv-details-classification', `Content advice${country}: ${item.ageRatingDescription}`),
      );
    }
    content.append(overview);
    if (item.type === 'Series') {
      const area = makeElement('div');
      area.dataset.seriesDetails = 'true';
      overview.append(area);
    }
    if (item.keywords?.length) {
      overview.append(makeElement('h3', '', 'Topics'));
      const tags = makeElement('div', 'whtv-taglist');
      item.keywords.forEach((keyword) => {
        const button = actionButton('keyword', keyword);
        button.dataset.keyword = keyword;
        tags.append(button);
      });
      overview.append(tags);
    }
    body.append(header, content);
    context.presentDialog(iconButton('close-dialog', 'Close Details', 'close', 'whtv-dialogclose'), body);
    updateDetailActions();
    if (item.type === 'Series') {
      series.queue(item, true);
      refreshSeriesDetails(series.seriesId(item));
    }
  }

  function updateDetailActions() {
    const item = state.items.find((candidate) => candidate.id === state.detailId) || state.detailItem;
    if (!item || !state.refs.dialog) return;
    const store = readStore();
    const save = state.refs.dialog.querySelector('[data-detail-save]');
    const watched = state.refs.dialog.querySelector('[data-detail-watched]');
    if (save) {
      save.setAttribute('aria-pressed', String(isSaved(store, item)));
      setText(save.querySelector('span'), isSaved(store, item) ? 'In Watchlist' : 'Add to Watchlist');
    }
    if (watched) {
      const value = isWatched(store, item);
      watched.setAttribute('aria-pressed', String(value));
      setText(
        watched.querySelector('span'),
        value
          ? item.type === 'Series'
            ? 'Series Marked Watched'
            : 'Marked Watched'
          : item.type === 'Series'
            ? 'Mark Series Watched'
            : 'Mark Watched',
      );
    }
  }

  function refreshSeriesDetails(id) {
    if (state.detailId !== `series:${id}` || !state.refs.dialog?.open) return;
    const { series } = context;
    const record = state.seriesData.get(id);
    const area = state.refs.dialog.querySelector('[data-series-details]');
    if (!area) return;
    area.replaceChildren();
    const item = series.seriesItem(id);
    area.append(makeElement('h3', '', series.seriesCountLabel(item)));
    if (record?.status === 'loading') area.append(loader('Reading the Series Page…', true));
    else if (record?.status === 'failed')
      area.append(
        makeElement('p', '', record.error),
        actionButton('retry-series', 'Retry Details', 'refresh', 'whtv-button', item.id),
      );
    if (record?.partial)
      area.append(
        makeElement('p', '', 'Some videos could not be loaded. The count shows the videos currently available.'),
      );
    const synopsis = state.refs.dialog.querySelector('[data-synopsis]');
    if (synopsis && record?.description) setText(synopsis, record.description);
  }

  return { showDetails, updateDetailActions, refreshSeriesDetails };
}

import { actionButton, loader } from '../../../components/icons.js';
import { makeElement } from '../../../utils/dom.js';

const TITLES = {
  loading: 'Loading Titles',
  'series-source': 'Series Details Unavailable',
  library: 'Your Watchlist Is Empty',
  watched: 'No Watched Entries Yet',
  filter: 'No Titles Match These Filters',
};

const MESSAGES = {
  loading: 'Warhammer TV is still providing catalog data.',
  'series-source': 'The catalog remains available. Retry the series or open the original page.',
  filter: 'Clear a filter or search for another title.',
};

/** Fill the empty-state panel for `reason`, or hide it when `reason` is empty. */
export function renderEmpty(state, reason) {
  const empty = state.refs.empty;
  empty.hidden = !reason;
  empty.replaceChildren();
  if (!reason) return;
  const title = TITLES[reason] || 'No Catalog Titles Were Found';
  const message = MESSAGES[reason] || 'Use Refresh or return to the original site.';
  empty.append(loader(title), makeElement('h3', '', title), makeElement('p', '', message));
  const actions = makeElement('div', 'whtv-actions');
  if (reason === 'loading' || reason === 'series-source' || reason === 'source')
    actions.append(actionButton('refresh', 'Retry', 'refresh'));
  if (reason === 'filter') actions.append(actionButton('reset', 'Clear Filters', 'refresh'));
  actions.append(actionButton('original', 'Original Site', 'external'));
  empty.append(actions);
}

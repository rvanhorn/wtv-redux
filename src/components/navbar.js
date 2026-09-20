import { makeElement } from '../utils/dom.js';
import { ALL_TITLES } from '../constants.js';
import { actionButton, icon, iconButton, createImage } from './icons.js';

export function makeBrand(className) {
  const link = makeElement('a', className);
  link.href = '/';
  link.dataset.whtvHome = 'true';
  link.setAttribute('aria-label', 'Warhammer TV Redux — Browse Catalog');
  link.append(
    makeElement('span', 'whtv-brand-title', 'Warhammer TV'),
    makeElement('span', 'whtv-brand-edition', 'Redux'),
  );
  return link;
}

export function navButton(mode, label, iconName) {
  const button = actionButton('mode', label, iconName, 'whtv-navbutton');
  button.dataset.mode = mode;
  const count = makeElement('span', 'whtv-count');
  button.append(count);
  return { button, count, mode };
}

export function syncChoiceMenu(control, entries, value) {
  if (entries && control.menu.dataset.signature !== JSON.stringify(entries)) {
    control.menu.dataset.signature = JSON.stringify(entries);
    control.options.replaceChildren(makeElement('legend', '', control.label));
    control.inputs = entries.map(([entryValue, entryLabel, entryIcon]) => {
      const option = makeElement('label');
      const input = makeElement('input');
      input.type = 'radio';
      input.name = `whtv-${control.key}`;
      input.value = entryValue;
      input.dataset.filter = control.key;
      option.append(input);
      if (entryIcon) option.append(icon(entryIcon));
      option.append(makeElement('span', '', entryLabel));
      control.options.append(option);
      return input;
    });
  }
  control.inputs.forEach((input) => {
    input.checked = input.value === value;
  });
  const selected = control.inputs.find((input) => input.checked);
  const isFiltered = !['all', ALL_TITLES].includes(value);
  if (['category', 'year', 'status', 'season'].includes(control.key)) {
    control.toggle.querySelector('span').textContent =
      isFiltered && selected ? selected.nextElementSibling.textContent : control.label;
    control.toggle.classList.toggle('whtv-filter-selected', isFiltered);
  }
}

function makeChoiceMenu(label, iconName, entries, key, value) {
  const menu = makeElement('details', 'whtv-choice-menu');
  const toggle = makeElement('summary', 'whtv-button');
  toggle.setAttribute('aria-label', label);
  toggle.title = label;
  toggle.append(icon(iconName), makeElement('span', '', label));
  const options = makeElement('fieldset', 'whtv-choice-options');
  const control = { menu, toggle, options, inputs: [], label, key };
  syncChoiceMenu(control, entries, value);
  menu.append(toggle, options);
  menu.addEventListener('toggle', () => {
    if (!menu.open) return;
    menu.classList.remove('whtv-menu-align-start');
    menu.classList.toggle('whtv-menu-align-start', options.getBoundingClientRect().left < 12);
  });
  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      menu.open = false;
      toggle.focus();
    }
  });
  return control;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

// The ring's stroke animation is the rotation timer: app.js advances the slide on its animationend event.
function makeCycleRing() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'whtv-heroring');
  svg.setAttribute('viewBox', '0 0 28 28');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  ['whtv-heroring-track', 'whtv-heroring-progress'].forEach((className) => {
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('class', className);
    circle.setAttribute('cx', '14');
    circle.setAttribute('cy', '14');
    circle.setAttribute('r', '11');
    circle.setAttribute('pathLength', '100');
    svg.append(circle);
  });
  return svg;
}

export function createShell(state) {
  const app = makeElement('div');
  app.id = 'whtv-redux-app';
  const sidebar = makeElement('aside', 'whtv-sidebar');
  sidebar.setAttribute('aria-label', 'Library Navigation');
  sidebar.append(makeBrand('whtv-brand'));
  const nav = makeElement('nav', 'whtv-nav');
  nav.setAttribute('aria-label', 'Videos and Personal Lists');
  const navs = [
    ['catalog', 'All Videos', 'browse'],
    ['library', 'My Watchlist', 'bookmark'],
    ['watched', 'Watched', 'watched'],
  ].map((args) => navButton(...args));
  nav.append(...navs.map((ref) => ref.button));
  const collectionsHead = makeElement('div', 'whtv-sidehead');
  const collectionSort = makeElement('details', 'whtv-collection-sort');
  const sortToggle = makeElement('summary', 'whtv-iconbutton');
  sortToggle.setAttribute('aria-label', 'Sort Collections');
  sortToggle.title = 'Sort Collections';
  sortToggle.append(icon('sort'));
  const sortOptions = makeElement('fieldset', 'whtv-sort-options');
  sortOptions.append(makeElement('legend', '', 'Sort Collections'));
  for (const [value, label] of [
    ['page', 'Page Order'],
    ['alphabetical', 'Title: A–Z'],
    ['updated', 'Recently Updated'],
  ]) {
    const option = makeElement('label');
    const input = makeElement('input');
    input.type = 'radio';
    input.name = 'whtv-collection-sort';
    input.value = value;
    input.dataset.filter = 'collectionSort';
    input.checked = state.collectionSort === value;
    option.append(input, makeElement('span', '', label));
    sortOptions.append(option);
  }
  collectionSort.append(sortToggle, sortOptions);
  collectionSort.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      collectionSort.open = false;
      sortToggle.focus();
    }
  });
  const choiceMenus = [collectionSort];
  app.addEventListener('click', (event) => {
    choiceMenus.forEach((menu) => {
      if (!menu.contains(event.target)) menu.open = false;
    });
  });
  collectionsHead.append(makeElement('h2', 'whtv-sideheading', 'Collections'), collectionSort);
  sidebar.append(nav, collectionsHead);
  const collections = makeElement('nav', 'whtv-collections');
  collections.setAttribute('aria-label', 'Collections on This Page');
  sidebar.append(collections);
  app.append(sidebar);
  const workspace = makeElement('div', 'whtv-workspace');
  const topbar = makeElement('header', 'whtv-topbar');
  topbar.append(makeBrand('whtv-mobilebrand'));
  const search = makeElement('div', 'whtv-search');
  search.append(icon('search'));
  const searchInput = makeElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Search Titles, Series, Factions, Techniques…';
  searchInput.autocomplete = 'off';
  searchInput.spellcheck = false;
  searchInput.setAttribute('aria-label', 'Search Titles Loaded on This Page or in Your Selected List');
  const searchKey = makeElement('kbd', 'whtv-shortcut', '/');
  searchKey.setAttribute('aria-hidden', 'true');
  const searchClear = iconButton('clear-search', 'Clear Search', 'close');
  searchClear.hidden = true;
  search.append(searchInput, searchKey, searchClear);
  const topbarActions = makeElement('div', 'whtv-topbar-actions');
  const settingsAction = iconButton('settings', 'Open Settings', 'settings', 'whtv-topbar-action');
  settingsAction.append(makeElement('span', '', 'Settings'));
  const originalSiteAction = iconButton(
    'original',
    'Show Original Warhammer TV Site',
    'external',
    'whtv-topbar-action',
  );
  originalSiteAction.append(makeElement('span', '', 'Original Site'));
  topbarActions.append(settingsAction, originalSiteAction);
  topbar.append(search, topbarActions);
  workspace.append(topbar);
  const scroller = makeElement('div', 'whtv-scroller');
  const main = makeElement('main', 'whtv-content');
  const pagehead = makeElement('div', 'whtv-pagehead');
  const pagecopy = makeElement('div');
  const breadcrumb = makeElement('nav', 'whtv-breadcrumb');
  breadcrumb.setAttribute('aria-label', 'Breadcrumb');
  const backBrowse = actionButton('browse', 'All Videos', '', 'whtv-breadcrumb-link');
  backBrowse.hidden = true;
  const breadcrumbSeparator = icon('right');
  breadcrumbSeparator.classList.add('whtv-breadcrumb-separator');
  breadcrumbSeparator.hidden = true;
  const pageTitle = makeElement('h1', '', 'All Videos');
  pageTitle.tabIndex = -1;
  const pageDescription = makeElement('p', '', 'Browse your Warhammer TV catalog with WTV Redux.');
  const pageCount = makeElement('span', 'whtv-pagecount');
  breadcrumb.append(backBrowse, breadcrumbSeparator, pageTitle);
  pagecopy.append(breadcrumb, pageDescription);
  pagehead.append(pagecopy, pageCount);
  main.append(pagehead);
  const seasonControl = makeChoiceMenu('Season', 'film', [['all', 'All Seasons']], 'season', state.season);
  choiceMenus.push(seasonControl.menu);
  const seriesRetry = actionButton('retry-series', 'Retry Details', 'refresh');
  seriesRetry.hidden = true;
  const seriesActions = makeElement('div', 'whtv-actions whtv-series-actions');
  seriesActions.hidden = true;
  seriesActions.append(seasonControl.menu, seriesRetry);
  const hero = makeElement('section', 'whtv-hero');
  hero.setAttribute('aria-label', 'Featured Title');
  hero.hidden = true;
  const heroImage = createImage('whtv-heroimg', false);
  hero.append(heroImage);
  const heroCopy = makeElement('div', 'whtv-herocopy');
  const heroEyebrow = makeElement('a', 'whtv-eyebrow');
  heroEyebrow.hidden = true;
  const heroTitle = makeElement('h2', 'whtv-herotitle');
  const heroMetadata = makeElement('div', 'whtv-metadata');
  const heroDescription = makeElement('p');
  const heroActions = makeElement('div', 'whtv-actions');
  const heroPlay = makeElement('a', 'whtv-button whtv-primary');
  heroPlay.append(icon('play'), makeElement('span', '', 'Watch Now'));
  heroActions.append(heroPlay);
  const heroFooter = makeElement('div', 'whtv-herofooter');
  const heroPager = makeElement('div', 'whtv-heropager');
  heroFooter.append(heroActions, heroPager);
  heroCopy.append(heroEyebrow, heroTitle, heroMetadata, heroDescription, heroFooter);
  hero.append(heroCopy);
  const heroRing = makeCycleRing();
  hero.append(heroRing);
  const heroPosition = makeElement('span');
  const heroPause = actionButton('hero-pause', 'Pause', '', 'whtv-hero-pause');
  heroPause.setAttribute('aria-label', 'Pause Featured Rotation');
  heroPause.setAttribute('aria-pressed', 'false');
  heroPager.append(
    heroPause,
    iconButton('hero-prev', 'Previous Featured Title', 'left'),
    heroPosition,
    iconButton('hero-next', 'Next Featured Title', 'right'),
  );
  main.append(hero);
  const sectionhead = makeElement('div', 'whtv-sectionhead');
  const resultTitle = makeElement('h2', '', 'Explore the Catalog');
  const resultCount = makeElement('span', 'whtv-resultcount');
  resultCount.setAttribute('role', 'status');
  resultCount.setAttribute('aria-live', 'polite');
  sectionhead.append(resultTitle, resultCount);
  main.append(sectionhead);
  const toolbar = makeElement('section', 'whtv-toolbar');
  toolbar.setAttribute('aria-label', 'Catalog Controls');
  const types = makeElement('div', 'whtv-segment');
  types.setAttribute('role', 'group');
  types.setAttribute('aria-label', 'Content Type');
  const typeButtons = [
    ['all', 'All'],
    ['Series', 'Collections'],
  ].map(([value, label]) => {
    const button = actionButton('type', label);
    button.dataset.value = value;
    button.setAttribute('aria-pressed', String(value === 'all'));
    types.append(button);
    return button;
  });
  const sortControl = makeChoiceMenu(
    'Sort',
    'sort',
    [
      ['recommended', 'Page Order', 'browse'],
      ['alphabetical', 'Title: A–Z', 'alphabetical'],
      ['year', 'Year: Newest', 'calendar'],
      ['duration', 'Runtime: Shortest', 'clock'],
      ['saved', 'Recently Saved', 'bookmark'],
      ['unwatched', 'Unwatched First', 'watched'],
      ['category', 'Collection', 'film'],
    ],
    'sort',
    state.sort,
  );
  const viewControl = makeChoiceMenu(
    'Display',
    'browse',
    [
      ['grid', 'Comfortable Grid', 'browse'],
      ['compact', 'Compact Grid', 'compact'],
      ['list', 'Detailed List', 'list'],
    ],
    'view',
    state.view,
  );
  const filterPanel = makeElement('div', 'whtv-filterpanel');
  const categoryControl = makeChoiceMenu('Collections', 'film', [], 'category', state.category);
  const yearControl = makeChoiceMenu('Year', 'calendar', [], 'year', state.year);
  const statusControl = makeChoiceMenu(
    'Viewing Status',
    'watched',
    [
      ['all', 'Any Status'],
      ['unwatched', 'Unwatched'],
      ['watched', 'Watched'],
      ['progress', 'In Progress'],
    ],
    'status',
    state.status,
  );
  filterPanel.append(categoryControl.menu, statusControl.menu, yearControl.menu);
  choiceMenus.push(categoryControl.menu, statusControl.menu, yearControl.menu, sortControl.menu, viewControl.menu);
  toolbar.append(
    types,
    filterPanel,
    seriesActions,
    makeElement('span', 'whtv-toolbar-spacer'),
    sortControl.menu,
    viewControl.menu,
  );
  main.append(toolbar);
  const empty = makeElement('section', 'whtv-empty');
  empty.hidden = true;
  const grid = makeElement('section', 'whtv-grid');
  grid.setAttribute('aria-label', 'Titles');
  grid.dataset.view = state.view;
  main.append(empty, grid);
  const footer = makeElement('footer', 'whtv-footer');
  const footerScope = makeElement('span', '', 'Only titles loaded on this page are searchable.');
  footer.append(footerScope, actionButton('settings', 'Local Watchlist · Settings', '', 'whtv-textbutton'));
  main.append(footer);
  scroller.append(main);
  workspace.append(scroller);
  app.append(workspace);
  const mobileNav = makeElement('nav', 'whtv-mobilenav');
  const mobileNavs = [
    ['catalog', 'All Videos', 'browse'],
    ['library', 'Watchlist', 'bookmark'],
    ['watched', 'Watched', 'watched'],
  ].map((args) => navButton(...args));
  mobileNav.append(...mobileNavs.map((ref) => ref.button));
  app.append(mobileNav);
  const dialog = makeElement('dialog', 'whtv-dialog');
  dialog.setAttribute('aria-labelledby', 'whtv-dialog-title');
  app.append(dialog);
  const toast = makeElement('div', 'whtv-toast');
  toast.hidden = true;
  const toastText = makeElement('span');
  toastText.setAttribute('role', 'status');
  const toastUndo = actionButton('undo', 'Undo');
  toast.append(toastText, toastUndo, iconButton('dismiss-toast', 'Dismiss Notification', 'close'));
  app.append(toast);
  return {
    app,
    sidebar,
    scroller,
    main,
    backBrowse,
    breadcrumbSeparator,
    seriesActions,
    seasonControl,
    seriesRetry,
    navs: [...navs, ...mobileNavs],
    nav,
    collections,
    collectionSort,
    search,
    searchInput,
    searchKey,
    searchClear,
    pageTitle,
    pageDescription,
    pageCount,
    hero,
    heroImage,
    heroTitle,
    heroEyebrow,
    heroMetadata,
    heroDescription,
    heroPlay,
    heroPager,
    heroPosition,
    heroPause,
    heroRing,
    resultTitle,
    resultCount,
    sortMenu: sortControl.menu,
    sortInputs: sortControl.inputs,
    typeButtons,
    viewMenu: viewControl.menu,
    viewInputs: viewControl.inputs,
    filterPanel,
    categoryControl,
    yearControl,
    statusControl,
    empty,
    grid,
    footerScope,
    dialog,
    toast,
    toastText,
    toastUndo,
  };
}

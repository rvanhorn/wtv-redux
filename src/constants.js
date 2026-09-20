export const APP_ID = 'whtv-redux-app';
export const STYLE_ID = 'whtv-redux-style';
export const STORAGE_KEY = 'whtv-better-ui';
export const SERIES_CACHE_KEY = 'whtv-redux-series-counts-v1';
export const PLAYER_PATH = '/player';
export const ALL_TITLES = 'All Titles';
export const OTHER_VIDEOS = 'Other Videos';
export const MAX_LOAD_ATTEMPTS = 12;
export const SOURCE_REFRESH_DELAY = 650;
export const HERO_CYCLE_MS = 12000;
export const HERO_SWAP_MS = 320;
export const HERO_DESCRIPTION_MAX_CHARS = 220;
export const HOME_DATA_PATH = '/?_data=routes/_index';
export const HOME_DATA_TIMEOUT_MS = 12000;
export const HOME_DATA_MAX_CHARS = 8 * 1024 * 1024;
export const SERIES_CACHE_TTL = 6 * 60 * 60 * 1000;
export const SERIES_TIMEOUT = 12000;
export const SERIES_AUTO_LIMIT = 60;
export const SECTION_NAMES = [
  'New Releases',
  'Animations',
  'Catch Up On: Tale of Four Gamers',
  'Top Ten This Week',
  'Gaming',
  'Painting & Building',
  'Lore',
  'Specials',
  'Cinematic Trailers',
  'Listen While You Paint',
];

export const COLLECTION_SORTS = ['page', 'alphabetical', 'updated'];

export const FILTER_KEYS = ['query', 'category', 'type', 'status', 'year', 'sort', 'heroId'];

export const defaultStore = {
  saved: {},
  watched: {},
  prefs: { sort: 'recommended', view: 'grid', showHero: true, accent: 'gold', collectionSort: 'page' },
};

export function createState() {
  return {
    items: [],
    query: '',
    category: ALL_TITLES,
    sort: 'recommended',
    view: 'grid',
    collectionSort: 'page',
    mode: 'catalog',
    type: 'Episode',
    status: 'all',
    year: 'all',
    showHero: true,
    accent: 'gold',
    heroId: '',
    detailId: '',
    detailItem: null,
    dialogTrigger: null,
    settingsOpen: false,
    cardNodes: new Map(),
    collectionNodes: new Map(),
    activeSeriesId: '',
    season: 'all',
    browseSnapshot: null,
    seriesData: new Map(),
    catalogSeries: new Map(),
    catalogVideos: new Map(),
    catalogStatus: 'idle',
    seriesPending: new Set(),
    seriesQueue: [],
    seriesRequests: new Map(),
    seriesAutoCount: 0,
    seriesObserver: null,
    seriesPumpTimer: null,
    heroContext: '',
    heroPaused: false,
    heroSwapTimer: null,
    heroSwapToken: 0,
    heroCandidates: [],
    overlayHistoryWrite: false,
    overlayHash: '',
    pendingImport: null,
    undoAction: null,
    searchTimer: null,
    toastTimer: null,
    refreshQueuedAt: 0,
    storageWarningShown: false,
    disabled: false,
    mounted: false,
    refs: {},
    observer: null,
    refreshTimer: null,
    loadTimer: null,
    loadAttempt: 0,
    sourceStatus: 'loading',
    sourceMessage: 'Reading the Warhammer TV catalog…',
    routeKey: '',
    sourceSignature: '',
    apiItems: [],
    domItems: [],
    apiStatus: 'idle',
    apiReport: null,
    apiError: '',
    apiAttempted: false,
    apiRequest: null,
    apiEpoch: 0,
    domLoading: false,
    scrollMemory: new Map(),
    scrollSaveTimer: null,
    historyHooked: false,
    inertOriginal: new Map(),
  };
}

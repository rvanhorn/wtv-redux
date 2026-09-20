import { HERO_CYCLE_MS, HERO_DESCRIPTION_MAX_CHARS, HERO_SWAP_MS } from '../../../constants.js';
import { setImage, setText } from '../../../components/icons.js';
import { filterItems, renderMetadata } from '../../../features/metadata.js';
import { isWatched, matchingStoreKey, readStore } from '../../../state/store.js';

function truncateDescription(text) {
  if (text.length <= HERO_DESCRIPTION_MAX_CHARS) return text;
  const cut = text.slice(0, HERO_DESCRIPTION_MAX_CHARS);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > HERO_DESCRIPTION_MAX_CHARS / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:]+$/, '')}…`;
}

export function selectCollectionHeroItem(items, store) {
  const eligible = items.filter((item) => item.image);
  const inProgress = eligible.find((item) => item.progress > 0 && item.progress < 100);
  if (inProgress) return inProgress;
  const mostRecentCompletion = items.reduce((mostRecent, item, index) => {
    const key = matchingStoreKey(store.watched, item);
    if (!key && !(item.progress >= 100)) return mostRecent;
    const watchedAt = Number(store.watched[key]?.watchedAt || 0);
    if (
      !mostRecent ||
      watchedAt > mostRecent.watchedAt ||
      (watchedAt === mostRecent.watchedAt && index > mostRecent.index)
    )
      return { index, watchedAt };
    return mostRecent;
  }, null);
  if (mostRecentCompletion) {
    const nextAvailable = items
      .slice(mostRecentCompletion.index + 1)
      .find((item) => item.image && !isWatched(store, item) && !(item.progress >= 100));
    if (nextAvailable) return nextAvailable;
  }
  return eligible.reduce((latest, item) => {
    if (!latest) return item;
    const latestDate = Date.parse(latest.releaseDate || '');
    const itemDate = Date.parse(item.releaseDate || '');
    if (!Number.isFinite(itemDate)) return latest;
    return !Number.isFinite(latestDate) || itemDate > latestDate ? item : latest;
  }, null);
}

function collectionForItem(context, item, active) {
  const collection = active || (item.parentSeriesId ? context.series.seriesItem(item.parentSeriesId) : null);
  const title = collection?.title || item.series || '';
  const href = collection?.href || item.seriesHref || '';
  return title && href ? { title, href } : null;
}

function heroTopics(item, collection) {
  const repeated = new Set(
    [item.title, item.series, collection?.title, ...(item.categories || [])]
      .filter(Boolean)
      .map((value) => value.toLocaleLowerCase()),
  );
  return (item.keywords || []).filter((keyword) => !repeated.has(keyword.toLocaleLowerCase())).slice(0, 3);
}

/** The featured banner above the grid and its timed rotation. */
export function createHero(context) {
  const { state } = context;

  function renderHero(items) {
    const { series } = context;
    const refs = state.refs;
    if (!refs.hero) return;
    const active = series.activeSeries();
    const store = readStore();
    const eligible = active
      ? [selectCollectionHeroItem(context.availableItems(store), store)].filter(Boolean)
      : items.filter((item) => item.image);
    const isLoading = Boolean(
      active && state.seriesData.get(series.seriesId(active))?.status === 'loading' && !eligible.length,
    );
    state.heroCandidates = eligible.map((item) => item.id);
    refs.hero.hidden = !state.showHero || (!eligible.length && !isLoading);
    refs.hero.dataset.loading = String(isLoading);
    refs.hero.setAttribute('aria-busy', String(isLoading));
    if (isLoading) refs.hero.setAttribute('aria-label', 'Loading Featured Title from This Collection');
    refs.hero.inert = isLoading;
    if (!eligible.length) return;
    if (!state.heroCandidates.includes(state.heroId)) state.heroId = state.heroCandidates[0];
    const item = eligible.find((candidate) => candidate.id === state.heroId) || context.itemById(state.heroId);
    const collection = collectionForItem(context, item, active);
    refs.hero.setAttribute(
      'aria-label',
      isLoading
        ? 'Loading Featured Title from This Collection'
        : collection
          ? `Featured Title from ${collection.title}`
          : 'Featured Title',
    );
    state.heroId = item.id;
    setImage(refs.heroImage, item.image);
    refs.heroEyebrow.hidden = !collection;
    if (collection) {
      refs.heroEyebrow.href = collection.href;
      setText(refs.heroEyebrow, collection.title);
    }
    setText(refs.heroTitle, item.title);
    const topics = heroTopics(item, collection);
    renderMetadata(refs.heroMetadata, [
      item.year,
      series.runtimeText(item),
      topics.length ? `Topics: ${topics.join(', ')}` : '',
    ]);
    setText(refs.heroDescription, truncateDescription(item.description || ''));
    refs.heroPlay.href = item.href;
    setText(refs.heroPlay.querySelector('span'), item.progress > 0 && item.progress < 100 ? 'Resume' : 'Watch Now');
    setText(refs.heroPosition, `${state.heroCandidates.indexOf(item.id) + 1} / ${state.heroCandidates.length}`);
    refs.heroPager.hidden = state.heroCandidates.length < 2;
    const ringWasHidden = refs.heroRing.hidden;
    refs.heroRing.hidden = state.heroCandidates.length < 2;
    if (ringWasHidden && !refs.heroRing.hidden) restartHeroCycle();
  }

  function advanceHero(direction = 1) {
    const ids = state.heroCandidates || [];
    const hero = state.refs.hero;
    if (ids.length < 2 || !hero) return;
    const nextId = ids[(Math.max(0, ids.indexOf(state.heroId)) + direction + ids.length) % ids.length];
    const token = (state.heroSwapToken = (state.heroSwapToken || 0) + 1);
    hero.dataset.swapping = 'true';
    // Fade out while the next artwork preloads so the fade-in shows a painted image, not a blank frame.
    const preload = new Promise((resolve) => {
      const image = new Image();
      image.onload = image.onerror = resolve;
      image.src = context.itemById(nextId)?.image || '';
      setTimeout(resolve, HERO_SWAP_MS * 4);
    });
    const fade = new Promise((resolve) => {
      clearTimeout(state.heroSwapTimer);
      state.heroSwapTimer = setTimeout(resolve, HERO_SWAP_MS);
    });
    Promise.all([fade, preload]).then(() => {
      if (!state.mounted || token !== state.heroSwapToken) return;
      state.heroId = nextId;
      renderHero(filterItems(state, context.availableItems(), readStore(), context.filterOptions()));
      delete hero.dataset.swapping;
      restartHeroCycle();
    });
  }

  function restartHeroCycle() {
    const ring = state.refs.heroRing;
    if (!ring) return;
    delete ring.dataset.running;
    void ring.getBoundingClientRect();
    ring.dataset.running = 'true';
  }

  function startHeroRotation() {
    const refs = state.refs;
    refs.hero.style.setProperty('--hero-cycle', `${HERO_CYCLE_MS}ms`);
    refs.hero.style.setProperty('--hero-swap', `${HERO_SWAP_MS}ms`);
    refs.hero.dataset.paused = String(Boolean(state.heroPaused));
    // Hover, focus, and the pause button hold the ring animation in CSS, so its end is the only tick.
    refs.heroRing.addEventListener('animationend', () => {
      if (!state.mounted || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      if (state.heroPaused || document.hidden || refs.dialog?.open || refs.hero.hidden) {
        restartHeroCycle();
        return;
      }
      advanceHero();
    });
    restartHeroCycle();
  }

  return { renderHero, advanceHero, startHeroRotation };
}

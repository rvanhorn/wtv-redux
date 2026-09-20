import assert from 'node:assert/strict';
import test from 'node:test';
import { selectCollectionHeroItem } from '../../src/views/app/_components/hero.js';

function episode(id, overrides = {}) {
  return {
    id,
    href: `https://warhammertv.com/player?video=${id}`,
    title: `Episode ${id}`,
    image: `https://warhammertv.com/art/${id}.svg`,
    progress: null,
    releaseDate: '',
    ...overrides,
  };
}

test('collection hero resumes a partially watched item before the next unwatched item', () => {
  const items = [episode('one'), episode('two', { progress: 45 }), episode('three')];
  const store = { watched: {} };

  assert.equal(selectCollectionHeroItem(items, store).id, 'two');
});

test('collection hero selects the next item after the most recently completed item', () => {
  const items = [episode('one'), episode('two'), episode('three')];
  const store = {
    watched: {
      one: { href: items[0].href, title: items[0].title, watchedAt: 100 },
    },
  };

  assert.equal(selectCollectionHeroItem(items, store).id, 'two');
});

test('collection hero selects the newest dated item when there is no viewing history', () => {
  const items = [
    episode('one', { releaseDate: '2025-01-10' }),
    episode('two', { releaseDate: '2026-02-20' }),
    episode('three', { releaseDate: '2024-03-30' }),
  ];
  const store = { watched: {} };

  assert.equal(selectCollectionHeroItem(items, store).id, 'two');
});

test('collection hero falls back to the newest dated item after every item is watched', () => {
  const items = [
    episode('one', { releaseDate: '2025-01-10' }),
    episode('two', { releaseDate: '2026-02-20' }),
    episode('three', { releaseDate: '2024-03-30' }),
  ];
  const store = {
    watched: Object.fromEntries(
      items.map((item, index) => [item.id, { href: item.href, title: item.title, watchedAt: index + 1 }]),
    ),
  };

  assert.equal(selectCollectionHeroItem(items, store).id, 'two');
});

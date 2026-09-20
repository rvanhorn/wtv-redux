import { expect, test } from '@playwright/test';
import { artworkHref, homePayload, seriesPayload } from './fixtures.js';
import { injectUserscript, installWarhammerRoutes, openFixture, waitForCatalog } from './harness.js';

test.beforeEach(async ({ page }) => {
  await installWarhammerRoutes(page);
});

test('mounts feed data and isolates the original page', async ({ page }) => {
  await openFixture(page);
  await waitForCatalog(page);

  await expect(page.locator('#whtv-redux-app')).toBeVisible();
  await expect(page.locator('#source-root')).toHaveJSProperty('inert', true);
  await expect(page.getByRole('heading', { name: 'All Videos', level: 1 })).toBeVisible();
  await expect(page.locator('.whtv-card:not([hidden])')).toHaveCount(29);
  await expect(page.getByText('Battle Report ...Report?', { exact: true })).toHaveCount(0);
  await expect(page.locator('a[href*="/series/25852"]')).toHaveCount(0);
  await expect(page.locator('.whtv-sidebar .whtv-sidebottom')).toHaveCount(0);
  await expect(page.locator('.whtv-sidebar').getByRole('button', { name: 'Settings' })).toHaveCount(0);
  await expect(page.locator('.whtv-sidebar').getByRole('button', { name: 'Original Site' })).toHaveCount(0);
  await expect(page.locator('.whtv-collections')).toHaveCSS('flex-grow', '1');
  const brand = page.locator('.whtv-brand');
  await expect(brand).toHaveAccessibleName('Warhammer TV Redux — Browse Catalog');
  await expect(brand.locator('.whtv-brand-title')).toHaveText('Warhammer TV');
  await expect(brand.locator('.whtv-brand-edition')).toHaveText('Redux');
  await expect(brand.locator('img')).toHaveCount(0);

  const allVideos = page.locator('.whtv-sidebar [data-mode="catalog"]');
  await expect(allVideos).toBeVisible();
  expect(
    await allVideos.evaluate((button) => {
      const collectionsHeading = document.querySelector('.whtv-sideheading');
      return Boolean(button.compareDocumentPosition(collectionsHeading) & Node.DOCUMENT_POSITION_FOLLOWING);
    }),
  ).toBe(true);
});

test('shows a skeleton while a bundled collection refreshes', async ({ page }) => {
  let releaseRequest;
  await page.route('**/series/25751', async (route) => {
    await new Promise((resolve) => {
      releaseRequest = resolve;
    });
    await route.fallback();
  });

  await openFixture(page);
  const paintingDesk = page
    .getByRole('navigation', { name: 'Collections on this page' })
    .getByRole('button', { name: /^Painting Desk/ });
  await expect(paintingDesk).toHaveAttribute('aria-busy', 'true');
  await expect(paintingDesk.locator('.whtv-count')).toHaveAttribute('data-loading', 'true');
  const loadingWidth = await paintingDesk
    .locator('.whtv-count')
    .evaluate((count) => count.getBoundingClientRect().width);
  await expect(paintingDesk).toHaveJSProperty(
    'scrollWidth',
    await paintingDesk.evaluate((button) => button.clientWidth),
  );

  await expect.poll(() => Boolean(releaseRequest)).toBe(true);
  releaseRequest();
  await expect(paintingDesk).toHaveAttribute('aria-busy', 'false');
  await expect(paintingDesk.locator('.whtv-count')).toHaveText('26');
  expect(
    await paintingDesk.locator('.whtv-count').evaluate((count) => count.getBoundingClientRect().width),
  ).toBeCloseTo(loadingWidth, 1);
});

test('reserves the hero height while a selected collection loads', async ({ page }) => {
  let releaseRequest;
  const responsePayload = structuredClone(seriesPayload);
  responsePayload.serverLoadedFeeds[0].feed.entry[0].media_group = [
    { type: 'image', media_item: [{ key: 'image_base', src: artworkHref(201) }] },
  ];
  await page.route('**/series/101', async (route) => {
    await new Promise((resolve) => {
      releaseRequest = resolve;
    });
    await route.fulfill({ json: responsePayload });
  });

  await openFixture(page);
  const collection = page
    .getByRole('navigation', { name: 'Collections on this page' })
    .getByRole('button', { name: /^Example Series/ });
  await collection.click();

  const hero = page.locator('.whtv-hero');
  await expect(hero).toBeVisible();
  await expect(hero).toHaveAttribute('data-loading', 'true');
  await expect(hero).toHaveAttribute('aria-busy', 'true');
  const loadingHeight = await hero.evaluate((element) => element.getBoundingClientRect().height);

  await expect.poll(() => Boolean(releaseRequest)).toBe(true);
  releaseRequest();
  await expect(hero).toHaveAttribute('data-loading', 'false');
  await expect(hero.locator('.whtv-herotitle')).toHaveText('Example Battle');
  expect(await hero.evaluate((element) => element.getBoundingClientRect().height)).toBeCloseTo(loadingHeight, 1);
});

test('turns a collection hero into one useful item with direct context', async ({ page }) => {
  const responsePayload = structuredClone(seriesPayload);
  responsePayload.serverLoadedFeeds[0].feed.entry.forEach((entry) => {
    entry.media_group = [{ type: 'image', media_item: [{ key: 'image_base', src: artworkHref(entry.id) }] }];
  });
  await page.route('**/series/101', async (route) => {
    await route.fulfill({ json: responsePayload });
  });

  await openFixture(page);
  await page
    .getByRole('navigation', { name: 'Collections on this page' })
    .getByRole('button', { name: /^Example Series/ })
    .click();

  const hero = page.locator('.whtv-hero');
  await expect(hero.locator('.whtv-herotitle')).toHaveText('Example Battle');
  const collectionLink = hero.getByRole('link', { name: 'Example Series' });
  await expect(collectionLink).toHaveAttribute('href', /\/series\/101$/);
  await expect(hero.locator('.whtv-metadata')).toContainText('2025');
  await expect(hero.locator('.whtv-metadata')).toContainText('24 min');
  await expect(hero.locator('.whtv-metadata')).toContainText('Topics: Warhammer');
  await expect(hero.locator('.whtv-metadata')).not.toContainText('Video');
  await expect(hero.getByRole('button', { name: 'More info' })).toHaveCount(0);
  await expect(hero.locator('.whtv-heropager')).toBeHidden();

  await page.getByRole('button', { name: 'Details for Example Battle' }).click();
  await page.getByRole('button', { name: 'Mark Watched' }).click();
  await page.getByRole('button', { name: 'Close Details' }).click();
  await expect(hero.locator('.whtv-herotitle')).toHaveText('Example Reinforcements');

  await collectionLink.click();
  await expect(page.getByRole('heading', { name: 'Example Series', level: 1 })).toBeVisible();
});

test('keeps long sidebar labels separate from counts and artwork inside its frame', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await openFixture(page);
  await waitForCatalog(page);
  const collection = page.locator('.whtv-collections .whtv-collection').first();
  const measurements = await collection.evaluate((button) => {
    const label = button.querySelector('.whtv-collection-label');
    const count = button.querySelector('.whtv-count');
    label.textContent = 'A very long collection title';
    count.textContent = '999';
    const labelBounds = label.getBoundingClientRect();
    const countBounds = count.getBoundingClientRect();
    return {
      gap: countBounds.left - labelBounds.right,
      wraps: labelBounds.height > parseFloat(getComputedStyle(label).lineHeight),
      overflows: button.scrollWidth > button.clientWidth,
    };
  });
  expect(measurements.gap).toBeGreaterThanOrEqual(12);
  expect(measurements.wraps).toBe(true);
  expect(measurements.overflows).toBe(false);

  const artwork = page.locator('.whtv-card:not([hidden]) .whtv-card-img').first();
  await artwork.evaluate((image) => {
    image.hidden = false;
    image.src =
      'data:image/svg+xml,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120"><rect width="80" height="120" fill="steelblue"/></svg>',
      );
  });
  await expect(artwork).toBeVisible();
  const imageBounds = await artwork.boundingBox();
  const frameBounds = await page.locator('.whtv-card:not([hidden]) .whtv-card-media').first().boundingBox();
  expect(imageBounds).toEqual(frameBounds);
  await expect(artwork).toHaveCSS('object-fit', 'cover');

  await page.setViewportSize({ width: 375, height: 812 });
  const displayToggle = page.locator('.whtv-choice-menu summary[aria-label="Display"]');
  await displayToggle.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await displayToggle.click();
  await page.getByRole('radio', { name: 'Compact Grid' }).check();
  expect(await page.locator('.whtv-scroller').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
});

test('lists series as collections and loads all collection videos', async ({ page }) => {
  await openFixture(page);
  await waitForCatalog(page);

  const collections = page.getByRole('navigation', { name: 'Collections on this page' });
  await expect(collections.getByRole('button', { name: /^Painting Desk/ })).toBeVisible();
  await page.locator('.whtv-sidebar [data-mode="catalog"]').click();

  const visibleCards = page.locator('.whtv-card:not([hidden])');
  await expect(visibleCards).toHaveCount(29);
  const allVideos = page.locator('.whtv-sidebar [data-mode="catalog"]');
  await expect(allVideos.locator('.whtv-count')).toHaveText('29');
  await expect(collections.getByRole('button', { name: /^Example Series/ }).locator('.whtv-count')).toHaveText('2');
  await expect(collections.getByRole('button', { name: /^Painting Desk/ }).locator('.whtv-count')).toHaveText('26');
  await expect(collections.getByRole('button', { name: /^Other Videos/ }).locator('.whtv-count')).toHaveText('1');
  expect(await visibleCards.evaluateAll((cards) => cards.every((card) => card.dataset.contentType === 'Episode'))).toBe(
    true,
  );

  await collections.getByRole('button', { name: /^Painting Desk/ }).click();
  await expect(page).toHaveURL(/#whtv-series=25751$/);
  await expect(page.locator('.whtv-card:not([hidden])')).toHaveCount(26);
  await expect(allVideos.locator('.whtv-count')).toHaveText('29');
  await page.getByRole('searchbox').fill('no matching video');
  await allVideos.click();
  await expect(page.getByRole('searchbox')).toHaveValue('');
  await expect(page.getByRole('heading', { name: 'All Videos', exact: true })).toBeVisible();
  await expect(visibleCards).toHaveCount(29);
  await page.locator('.whtv-sidebar [data-mode="library"]').click();
  await allVideos.click();
  await expect(visibleCards).toHaveCount(29);
  await collections.getByRole('button', { name: /^Other Videos/ }).click();
  await expect(visibleCards).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Details for Brush Control' })).toBeVisible();
});

test('keeps partial collection counts tied to available videos', async ({ page }) => {
  const partial = structuredClone(seriesPayload);
  partial.screenEntry.extensions.episode_count = 10;
  await page.route('**/series/101', (route) => route.fulfill({ json: partial }));
  await openFixture(page);
  await waitForCatalog(page);
  const collection = page.locator('.whtv-collections').getByRole('button', { name: /^Example Series/ });
  await collection.click();
  await expect(collection.locator('.whtv-count')).toHaveText('2');
  await expect(page.locator('.whtv-card:not([hidden])')).toHaveCount(2);
  await expect(page.locator('.whtv-pagecount')).toBeHidden();
  await expect(page.locator('.whtv-resultcount')).toHaveText('2 episodes');
  await expect(page.locator('.whtv-series-panel')).toHaveCount(0);
  await expect(page.locator('.whtv-toolbar .whtv-series-actions')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open site series page' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Filters' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Retry Details' })).toBeVisible();
  await page.locator('.whtv-sidebar [data-mode="catalog"]').click();
  await expect(page.locator('.whtv-card:not([hidden])')).toHaveCount(29);
  await expect(page.locator('.whtv-sidebar [data-mode="catalog"] .whtv-count')).toHaveText('29');
});

test('restores learned videos from browser storage', async ({ page }) => {
  await openFixture(page);
  await waitForCatalog(page);
  await page.locator('.whtv-sidebar [data-mode="catalog"]').click();
  await expect(page.locator('.whtv-card:not([hidden])')).toHaveCount(29);

  const learnedVideoCount = () =>
    page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open('whtv-redux-catalog', 1);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const transaction = request.result.transaction('videos', 'readonly');
            const countRequest = transaction.objectStore('videos').count();
            countRequest.onerror = () => reject(countRequest.error);
            countRequest.onsuccess = () => resolve(countRequest.result);
          };
        }),
    );
  await expect.poll(learnedVideoCount).toBe(29);

  const abortSeriesRequest = (route) => route.abort();
  await page.route('**/series/*', abortSeriesRequest);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await injectUserscript(page);
  await waitForCatalog(page);
  await page.locator('.whtv-sidebar [data-mode="catalog"]').click();
  await expect(page.locator('.whtv-card:not([hidden])')).toHaveCount(29);
  await expect(page.locator('.whtv-card[data-id="video:301:399"]')).toBeVisible();
  await page.getByRole('button', { name: 'Details for Brush Control' }).click();
  await expect(page.getByRole('dialog')).toContainText('Jun 1, 2024');
  await page.getByRole('button', { name: 'Close Details' }).click();
  await page
    .getByRole('navigation', { name: 'Collections on this page' })
    .getByRole('button', { name: /^Painting Desk/ })
    .click();
  await expect(page.locator('.whtv-card:not([hidden])')).toHaveCount(26);
  await page.unroute('**/series/*', abortSeriesRequest);
});

test('keeps learned artwork and the featured banner across repeated reloads', async ({ page }) => {
  const learnedArtwork = () =>
    page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open('whtv-redux-catalog');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const recordRequest = request.result.transaction('videos', 'readonly').objectStore('videos').get('201');
            recordRequest.onerror = () => reject(recordRequest.error);
            recordRequest.onsuccess = () => resolve(recordRequest.result?.image || '');
          };
        }),
    );
  const hero = page.locator('.whtv-hero');
  const responsePayload = structuredClone(seriesPayload);
  responsePayload.serverLoadedFeeds[0].feed.entry.forEach((entry) => {
    entry.media_group = [{ type: 'image', media_item: [{ key: 'image_base', src: artworkHref(entry.id) }] }];
  });
  const fulfillSeries = (route) => route.fulfill({ json: responsePayload });
  await page.route('**/series/101', fulfillSeries);

  await openFixture(page);
  await waitForCatalog(page);
  await expect(hero.locator('.whtv-herotitle')).toHaveText('Example Battle');
  await expect.poll(learnedArtwork).toBe(artworkHref(201));
  await page.unroute('**/series/101', fulfillSeries);
  await page.route('**/series/*', (route) => route.abort());

  for (let reload = 0; reload < 2; reload += 1) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await injectUserscript(page);
    await waitForCatalog(page);
    await expect(hero).toBeVisible();
    await expect(hero.locator('.whtv-herotitle')).toHaveText('Example Battle');
    await expect(hero.locator('.whtv-heroimg')).toHaveAttribute('src', artworkHref(201));
    await expect.poll(learnedArtwork).toBe(artworkHref(201));
    // The second episode is only listed by the series feed, which is blocked now, so its details
    // must come from the learned catalog.
    await hero.getByRole('button', { name: 'Next featured title' }).click();
    await expect(hero.locator('.whtv-herotitle')).toHaveText('Example Reinforcements');
    await expect(hero.locator('p')).toHaveText('The second fixture episode.');
    await expect(hero.locator('.whtv-metadata')).toContainText('2025');
    await expect(hero.locator('.whtv-metadata')).toContainText('27 min');
    await expect(hero.locator('.whtv-metadata')).toContainText('Topics: Episodes, Warhammer');
  }
});

test('does not fetch a series again after a reload when its videos are already learned', async ({ page }) => {
  const seriesRequests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/series/101') seriesRequests.push(request.url());
  });
  await openFixture(page);
  await waitForCatalog(page);
  await page
    .getByRole('navigation', { name: 'Collections on this page' })
    .getByRole('button', { name: /^Example Series/ })
    .click();
  await expect(page.locator('.whtv-resultcount')).toHaveText('2 episodes');
  await expect.poll(() => seriesRequests.length).toBe(1);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await injectUserscript(page);
  await expect(page.getByRole('heading', { name: 'Example Series', level: 1 })).toBeVisible();
  await expect(page.locator('.whtv-resultcount')).toHaveText('2 episodes');
  await expect(page.locator('.whtv-card:not([hidden])')).toHaveCount(2);
  await expect(page.locator('.whtv-card[data-id^="video:201:"] .whtv-card-img')).toHaveClass(/whtv-img-loaded/);
  await page
    .getByRole('navigation', { name: 'Breadcrumb' })
    .getByRole('button', { name: 'All Videos', exact: true })
    .click();
  await page
    .getByRole('navigation', { name: 'Collections on this page' })
    .getByRole('button', { name: /^Example Series/ })
    .click();
  await expect(page.locator('.whtv-resultcount')).toHaveText('2 episodes');
  expect(seriesRequests).toHaveLength(1);
});

const storedArtworkHrefs = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('whtv-redux-catalog', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const getAll = request.result.transaction('videos', 'readonly').objectStore('videos').getAll();
          getAll.onerror = () => reject(getAll.error);
          getAll.onsuccess = () =>
            resolve(getAll.result.filter((record) => record.seriesId === '101').map((record) => record.image));
        };
      }),
  );

const openExampleSeries = async (page) => {
  await page
    .getByRole('navigation', { name: 'Collections on this page' })
    .getByRole('button', { name: /^Example Series/ })
    .click();
  await expect(page.locator('.whtv-resultcount')).toHaveText('2 episodes');
  await expect(page.locator('.whtv-card[data-id^="video:201:"] .whtv-card-img')).toHaveClass(/whtv-img-loaded/);
};

test('fetches a page-scanned series again until its artwork is known', async ({ page }) => {
  const seriesRequests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/series/101') seriesRequests.push(request.url());
  });
  const playerHref = (id) =>
    `/player?self-link=${encodeURIComponent(`https://zapp-gw.web.app/beacon/video-preload/${id}/streams/${id}`)}`;
  const scannedPage = `<!doctype html><html><body>
    <a href="${playerHref(201)}" aria-label="Play Example Battle"><img alt="Example Battle"></a>
    <a href="${playerHref(202)}" aria-label="Play Example Reinforcements"><img alt="Example Reinforcements"></a>
  </body></html>`;
  await page.route('**/series/101', (route, request) =>
    request.resourceType() === 'document'
      ? route.fallback()
      : route.fulfill({ contentType: 'text/html', body: scannedPage }),
  );

  await openFixture(page);
  await waitForCatalog(page);
  await page
    .getByRole('navigation', { name: 'Collections on this page' })
    .getByRole('button', { name: /^Example Series/ })
    .click();
  await expect(page.locator('.whtv-resultcount')).toHaveText('2 episodes');
  await expect.poll(() => storedArtworkHrefs(page)).toEqual(['', null]);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await injectUserscript(page);
  await expect(page.locator('.whtv-resultcount')).toHaveText('2 episodes');
  await expect.poll(() => seriesRequests.length).toBe(2);
});

test('refreshes stored artwork from settings', async ({ page }) => {
  const seriesRequests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/series/101') seriesRequests.push(request.url());
  });
  await openFixture(page);
  await waitForCatalog(page);
  await openExampleSeries(page);
  await expect.poll(() => storedArtworkHrefs(page)).toEqual([artworkHref(201), '']);

  await page.getByRole('button', { name: 'Settings' }).first().click();
  await page
    .getByRole('dialog', { name: 'Settings' })
    .locator('.whtv-setting', { hasText: 'Artwork' })
    .getByRole('button', { name: 'Refresh' })
    .click();
  await expect(page.locator('.whtv-toast')).toContainText('Stored artwork cleared');
  await expect.poll(() => seriesRequests.length).toBe(2);
  await expect(page.locator('.whtv-card[data-id^="video:201:"] .whtv-card-img')).toHaveClass(/whtv-img-loaded/);
  await expect.poll(() => storedArtworkHrefs(page)).toEqual([artworkHref(201), '']);
});

test('keeps loaded artwork when a series is opened and closed', async ({ page }) => {
  const artworkRequests = [];
  page.on('request', (request) => {
    if (request.url() === artworkHref(101)) artworkRequests.push(request.url());
  });
  await openFixture(page);
  await waitForCatalog(page);
  const artwork = page.locator('.whtv-card[data-id="series:101"] .whtv-card-img');
  await page
    .getByRole('group', { name: 'Content type' })
    .getByRole('button', { name: 'Collections', exact: true })
    .click();
  await expect(artwork).toHaveClass(/whtv-img-loaded/);
  await expect(artwork).toHaveCSS('opacity', '1');
  expect(artworkRequests).toHaveLength(1);

  await page.getByRole('link', { name: 'View Episodes in: Example Series' }).click();
  await expect(page.locator('.whtv-resultcount')).toHaveText('2 episodes');
  await page
    .getByRole('navigation', { name: 'Breadcrumb' })
    .getByRole('button', { name: 'All Videos', exact: true })
    .click();
  await expect(page.locator('.whtv-card[data-id="series:101"]')).toBeVisible();
  await expect(artwork).toHaveClass(/whtv-img-loaded/);
  expect(artworkRequests).toHaveLength(1);
});

test('hydrates valid learned collections and ignores invalid records', async ({ page }) => {
  await page.goto('https://warhammertv.com/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('whtv-redux-catalog', 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore('series', { keyPath: 'id' });
          request.result.createObjectStore('videos', { keyPath: 'id' });
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const transaction = request.result.transaction('series', 'readwrite');
          transaction.objectStore('series').put({
            id: '777',
            title: 'Learned Collection',
            href: '/series/777',
            lastKnownVideoCount: 4,
            lastVerifiedAt: '2026-09-20T00:00:00.000Z',
          });
          transaction.objectStore('series').put({ id: 'invalid', title: 'Invalid Collection' });
          transaction.objectStore('series').put({
            id: '25852',
            title: 'Battle Report ...Report?',
            href: '/series/25852',
            lastVerifiedAt: '2026-09-20T00:00:00.000Z',
          });
          transaction.oncomplete = resolve;
          transaction.onerror = () => reject(transaction.error);
        };
      }),
  );

  await injectUserscript(page);
  await waitForCatalog(page);
  const collections = page.getByRole('navigation', { name: 'Collections on this page' });
  await expect(collections.getByRole('button', { name: /^Learned Collection/ })).toBeVisible();
  await expect(collections.getByRole('button', { name: /^Invalid Collection/ })).toHaveCount(0);
  await expect(collections.getByRole('button', { name: /Battle Report/ })).toHaveCount(0);
  await expect(page.locator('a[href*="/series/25852"]')).toHaveCount(0);
});

test('ignores direct overlay navigation to the excluded series', async ({ page }) => {
  await openFixture(page, '/#whtv-series=25852');
  await waitForCatalog(page);

  await expect(page.getByRole('heading', { name: 'All Videos', level: 1 })).toBeVisible();
  await expect(page.locator('.whtv-series-actions')).toBeHidden();
  await expect(page.locator('a[href*="/series/25852"]')).toHaveCount(0);
});

test('sorts collections by recent updates and remembers the choice', async ({ page }) => {
  await openFixture(page);
  await waitForCatalog(page);

  const collections = page.getByRole('navigation', { name: 'Collections on this page' });
  const titles = () => collections.locator('.whtv-collection-label').allTextContents();
  await expect.poll(titles).toEqual(['Example Series', 'Painting Desk', 'Other Videos']);

  const sort = page.locator('.whtv-collection-sort summary');
  await sort.click();
  await page.getByRole('radio', { name: 'Recently Updated' }).check();
  await expect(page.locator('.whtv-collection-sort')).not.toHaveAttribute('open', '');
  await expect.poll(titles).toEqual(['Painting Desk', 'Example Series', 'Other Videos']);

  await sort.click();
  await page.getByRole('radio', { name: 'Title: A–Z' }).check();
  await expect.poll(titles).toEqual(['Example Series', 'Painting Desk', 'Other Videos']);

  await sort.click();
  await page.getByRole('radio', { name: 'Recently Updated' }).check();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await injectUserscript(page);
  await waitForCatalog(page);
  await sort.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('radio', { name: 'Recently Updated' })).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(sort).toBeFocused();
  await expect(page.locator('.whtv-collection-sort')).not.toHaveAttribute('open', '');
  await expect.poll(titles).toEqual(['Painting Desk', 'Example Series', 'Other Videos']);
});

test('keeps a deep-linked series in the collections list', async ({ page }) => {
  await openFixture(page, '/#whtv-series=25751');

  const paintingDesk = page
    .getByRole('navigation', { name: 'Collections on this page' })
    .getByRole('button', { name: /^Painting Desk/ });
  await expect(paintingDesk).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.whtv-card:not([hidden])')).toHaveCount(26);
});

test('keeps the desktop shell in one row and gives featured controls a stable surface', async ({ page }) => {
  await openFixture(page);
  await waitForCatalog(page);

  await expect(page.locator('.whtv-mobilenav')).toBeHidden();
  const shellLayout = await page.locator('#whtv-redux-app').evaluate((app) => {
    const appBounds = app.getBoundingClientRect();
    const sidebarBounds = app.querySelector('.whtv-sidebar').getBoundingClientRect();
    const workspaceBounds = app.querySelector('.whtv-workspace').getBoundingClientRect();
    return {
      appHeight: appBounds.height,
      sidebarHeight: sidebarBounds.height,
      workspaceHeight: workspaceBounds.height,
    };
  });
  expect(shellLayout.sidebarHeight).toBe(shellLayout.appHeight);
  expect(shellLayout.workspaceHeight).toBe(shellLayout.appHeight);

  const featuredControlStyles = await page.locator('.whtv-hero').evaluate((hero) => {
    hero.hidden = false;
    const pager = hero.querySelector('.whtv-heropager');
    pager.hidden = false;
    const title = hero.querySelector('.whtv-herotitle');
    const description = hero.querySelector('p');
    title.textContent = 'Aeronautica Imperialis - Episode 1: Official Trailer';
    description.textContent = 'A short featured description.';
    const pause = hero.querySelector('.whtv-hero-pause');
    const centerOf = (element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.top + bounds.height / 2;
    };
    const heroBounds = hero.getBoundingClientRect();
    const eyebrowBounds = hero.querySelector('.whtv-eyebrow').getBoundingClientRect();
    const descriptionBounds = description.getBoundingClientRect();
    const footerBounds = hero.querySelector('.whtv-herofooter').getBoundingClientRect();
    return {
      pagerBackground: getComputedStyle(pager).backgroundColor,
      pauseDisplay: getComputedStyle(pause).display,
      actionsCenter: centerOf(hero.querySelector('.whtv-actions .whtv-primary')),
      pagerCenter: centerOf(pager),
      descriptionLineClamp: getComputedStyle(description).webkitLineClamp,
      contentTopInset: eyebrowBounds.top - heroBounds.top,
      flexibleContentGap: footerBounds.top - descriptionBounds.bottom,
      footerBottomInset: heroBounds.bottom - footerBounds.bottom,
    };
  });
  expect(featuredControlStyles.pagerBackground).not.toBe('rgba(0, 0, 0, 0)');
  expect(featuredControlStyles.pauseDisplay).toMatch(/flex/);
  expect(Math.abs(featuredControlStyles.actionsCenter - featuredControlStyles.pagerCenter)).toBeLessThan(1);
  expect(featuredControlStyles.descriptionLineClamp).toBe('3');
  expect(featuredControlStyles.contentTopInset).toBeCloseTo(32, 0);
  expect(featuredControlStyles.flexibleContentGap).toBeGreaterThan(24);
  expect(featuredControlStyles.footerBottomInset).toBeCloseTo(26, 0);
});

test('renders bundled icons with decorative SVG semantics', async ({ page }) => {
  await openFixture(page);
  await waitForCatalog(page);

  const iconSummary = await page.locator('svg.whtv-icon').evaluateAll((icons) => ({
    count: icons.length,
    invalidCount: icons.filter(
      (icon) =>
        icon.children.length === 0 ||
        icon.getAttribute('aria-hidden') !== 'true' ||
        icon.getAttribute('focusable') !== 'false',
    ).length,
  }));

  expect(iconSummary.count).toBeGreaterThan(0);
  expect(iconSummary.invalidCount).toBe(0);
});

test('filters visible titles through the search field', async ({ page }) => {
  await openFixture(page);
  await waitForCatalog(page);

  await page.getByRole('searchbox', { name: /Search Titles Loaded/ }).fill('Brush');

  await expect(page.locator('.whtv-card:not([hidden])')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Details for Brush Control' })).toBeVisible();
});

test('uses compact controls and icon menus for catalog display choices', async ({ page }) => {
  await openFixture(page);
  await waitForCatalog(page);

  const standardControlStyles = await page.locator('#whtv-redux-app').evaluate((app) => {
    const height = (selector) => app.querySelector(selector).getBoundingClientRect().height;
    const searchBounds = app.querySelector('.whtv-search').getBoundingClientRect();
    const topbarBounds = app.querySelector('.whtv-topbar').getBoundingClientRect();
    const actionsBounds = app.querySelector('.whtv-topbar-actions').getBoundingClientRect();
    const utilityStyles = getComputedStyle(app.querySelector('.whtv-topbar-action'));
    const menuStyles = getComputedStyle(app.querySelector('.whtv-choice-menu summary'));
    return {
      search: height('.whtv-search'),
      icon: height('.whtv-topbar .whtv-iconbutton:not([hidden])'),
      button: height('.whtv-choice-menu summary'),
      navigation: height('.whtv-sidebar .whtv-navbutton'),
      searchCenterOffset: searchBounds.x + searchBounds.width / 2 - (topbarBounds.x + topbarBounds.width / 2),
      searchActionGap: actionsBounds.x - searchBounds.right,
      utilityBackground: utilityStyles.backgroundColor,
      utilityBorder: utilityStyles.borderColor,
      menuBackground: menuStyles.backgroundColor,
      menuBorder: menuStyles.borderColor,
    };
  });
  expect({
    search: standardControlStyles.search,
    icon: standardControlStyles.icon,
    button: standardControlStyles.button,
    navigation: standardControlStyles.navigation,
  }).toEqual({ search: 36, icon: 36, button: 36, navigation: 36 });
  expect(Math.abs(standardControlStyles.searchCenterOffset)).toBeLessThan(1);
  expect(standardControlStyles.searchActionGap).toBeGreaterThanOrEqual(20);
  expect(standardControlStyles.utilityBackground).toBe(standardControlStyles.menuBackground);
  expect(standardControlStyles.utilityBorder).toBe(standardControlStyles.menuBorder);
  await expect(page.locator('.whtv-topbar-actions .whtv-topbar-action')).toHaveText(['Settings', 'Original Site']);

  await expect(page.locator('.whtv-choice-menu summary[aria-label="Collections"]')).toBeVisible();
  await expect(page.locator('.whtv-choice-menu summary[aria-label="Collections"]')).toHaveCSS('min-height', '36px');

  const sortToggle = page.locator('.whtv-choice-menu summary[aria-label="Sort"]');
  await sortToggle.click();
  await page.getByRole('radio', { name: 'Title: A–Z' }).check();
  await expect(page.locator('.whtv-choice-menu:has(summary[aria-label="Sort"])')).not.toHaveAttribute('open', '');
  await expect(sortToggle).toBeFocused();
  await expect(page.locator('.whtv-card:not([hidden])').first()).toContainText('Brush Control');
});

for (const width of [1280, 375]) {
  test(`keeps catalog filters visible and menus usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openFixture(page);
    await waitForCatalog(page);
    const types = page.getByRole('group', { name: 'Content type' });
    await expect(types.getByRole('button')).toHaveText(['All', 'Collections']);
    await expect(types.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.whtv-filterpanel .whtv-choice-menu')).toHaveCount(3);
    await expect(page.locator('.whtv-choice-menu summary[aria-label="Viewing Status"]')).toBeVisible();
    await expect(page.locator('.whtv-choice-menu summary[aria-label="Year"]')).toBeVisible();
    await expect(page.locator('.whtv-filterchip, .whtv-typehelp')).toHaveCount(0);
    await types.getByRole('button', { name: 'Collections', exact: true }).click();
    const cards = page.locator('.whtv-card:not([hidden])');
    await expect(cards.first()).toBeVisible();
    expect(
      await cards.evaluateAll((elements) => elements.every((element) => element.dataset.contentType === 'Series')),
    ).toBe(true);
    await types.getByRole('button', { name: 'All', exact: true }).click();
    await expect(cards).toHaveCount(29);
    await page.locator('.whtv-choice-menu summary[aria-label="Viewing Status"]').click();
    await page.getByRole('radio', { name: 'Watched', exact: true }).check();
    await expect(cards).toHaveCount(0);
    await page.locator('.whtv-choice-menu summary[aria-label="Viewing Status"]').click();
    await page.getByRole('radio', { name: 'Any Status', exact: true }).check();
    await expect(cards).toHaveCount(29);

    const sort = page.locator('.whtv-choice-menu:has(summary[aria-label="Sort"])');
    const display = page.locator('.whtv-choice-menu:has(summary[aria-label="Display"])');
    await sort.locator('summary svg').click();
    await expect(sort).toHaveAttribute('open', '');
    await expect(sort.locator('label .whtv-icon')).toHaveCount(await sort.getByRole('radio').count());
    await display.locator('summary svg').click();
    await expect(sort).not.toHaveAttribute('open', '');
    await expect(display).toHaveAttribute('open', '');
    const bounds = await display.locator('fieldset').boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await display.getByRole('radio', { name: 'Detailed List' }).check();
    await expect(page.locator('.whtv-grid')).toHaveAttribute('data-view', 'list');
    await expect(display).not.toHaveAttribute('open', '');
    await display.locator('summary').press('Enter');
    await expect(display).toHaveAttribute('open', '');
    await display.locator('summary').press('Escape');
    await expect(display).not.toHaveAttribute('open', '');
    await expect(display.locator('summary')).toBeFocused();
    await sort.locator('summary').click();
    await page.locator('.whtv-sectionhead').click();
    await expect(sort).not.toHaveAttribute('open', '');
  });
}

test('loads deterministic series details', async ({ page }) => {
  await openFixture(page);
  await waitForCatalog(page);

  await page
    .getByRole('navigation', { name: 'Collections on this page' })
    .getByRole('button', { name: /^Example Series/ })
    .click();

  await expect(page.getByRole('heading', { name: 'Example Series', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Episodes', level: 2 })).toBeVisible();
  await expect(page.locator('.whtv-resultcount')).toHaveText('2 episodes');
  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(breadcrumb.getByRole('button', { name: 'All Videos', exact: true })).toBeVisible();
  await expect(breadcrumb.locator('.whtv-breadcrumb-separator')).toBeVisible();
  await expect(breadcrumb.getByRole('heading', { name: 'Example Series', level: 1 })).toHaveCSS(
    'color',
    'rgb(244, 206, 104)',
  );
  await expect(page.getByText('Browse the available episodes.')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Details for Example Reinforcements' })).toBeVisible();
  await expect(page.locator('.whtv-series-panel')).toHaveCount(0);
  await expect(page.locator('.whtv-toolbar .whtv-series-actions')).not.toHaveAttribute('hidden', '');
  await expect(page.getByRole('group', { name: 'Content type' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Filters' })).toBeHidden();

  await expect(page.locator('.whtv-current-location')).toHaveCount(0);
});

for (const width of [1280, 390]) {
  test(`video details show each fact once and prioritize playback at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const payload = structuredClone(homePayload);
    payload.serverLoadedFeeds[1].feed.entry[0].extensions.age_rating = {
      name: 'PG',
      country_code: 'au',
      description: 'Parental guidance recommended.',
    };
    await page.route('**/*_data=routes/_index', (route) => route.fulfill({ json: payload }));
    await openFixture(page);
    await waitForCatalog(page);
    const trigger = page.getByRole('button', { name: 'Details for Brush Control' });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Brush Control' });
    const watch = dialog.getByRole('link', { name: 'Watch Now' });
    await expect(watch).toBeInViewport();
    await expect(watch).toHaveAttribute('href', /\/player\?self-link=/);
    await expect(dialog.getByText('A fixture painting tutorial.', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Jun 1, 2024', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Jun 1, 2024', { exact: true })).toHaveCount(1);
    await expect(dialog.getByText('2024', { exact: true })).toHaveCount(0);
    await expect(dialog.getByText('PG', { exact: true })).toHaveCount(1);
    await expect(dialog.getByText('Content advice (AU): Parental guidance recommended.')).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Details', exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('group', { name: 'Collections' })).toBeVisible();
    const topicsBounds = await dialog.locator('.whtv-taglist').boundingBox();
    const contentBounds = await dialog.locator('.whtv-details-content').boundingBox();
    expect(topicsBounds.width).toBeCloseTo(contentBounds.width, 1);
    await expect(dialog.getByText('More details', { exact: true })).toHaveCount(0);
    await expect(dialog.getByText(/Sign-in required|Free video|saved on this device/)).toHaveCount(0);
    const actionBounds = await Promise.all([
      watch.boundingBox(),
      dialog.getByRole('button', { name: 'Add to Watchlist', exact: true }).boundingBox(),
      dialog.getByRole('button', { name: 'Mark Watched', exact: true }).boundingBox(),
    ]);
    for (const bounds of actionBounds) expect(bounds.y).toBeCloseTo(actionBounds[0].y, 1);
    await dialog.getByRole('button', { name: 'Add to Watchlist', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'In Watchlist', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await dialog.getByRole('button', { name: 'Mark Watched', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Marked Watched', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const panel = dialog.locator('.whtv-dialogpanel');
    expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(dialog.getByRole('button', { name: 'In Watchlist', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(dialog.getByRole('button', { name: 'Marked Watched', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await dialog.getByRole('button', { name: 'Close Details' }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: 'Details for Example Battle' }).click();
    const episodeDialog = page.getByRole('dialog', { name: 'Example Battle' });
    await expect(episodeDialog.getByText('2025', { exact: true })).toHaveCount(1);
    await expect(episodeDialog.getByText(/Release Date|Not Supplied|Production Year/)).toHaveCount(0);
  });
}

test('returns from a native series route to the catalog route', async ({ page }) => {
  await openFixture(page, '/series/101');

  await expect(page.getByRole('heading', { name: 'Example Series', level: 1 })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Breadcrumb' })
    .getByRole('button', { name: 'All Videos', exact: true })
    .click();

  await expect(page).toHaveURL('https://warhammertv.com/#whtv-browse');
  await expect(page.getByRole('heading', { name: 'All Videos', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Details for Brush Control' })).toBeVisible();
});

test('recovers a catalog fragment attached to a native series route', async ({ page }) => {
  await openFixture(page, '/series/101#whtv-browse');

  await expect(page).toHaveURL('https://warhammertv.com/#whtv-browse');
  await expect(page.getByRole('heading', { name: 'All Videos', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Details for Brush Control' })).toBeVisible();
});

test('keeps a saved title after a full reload', async ({ page }) => {
  await openFixture(page);
  await waitForCatalog(page);

  await page.getByRole('button', { name: 'Save Brush Control' }).click();
  await expect(page.getByRole('button', { name: 'Remove Brush Control from Watchlist' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.reload({ waitUntil: 'domcontentloaded' });
  await injectUserscript(page);
  await waitForCatalog(page);

  await expect(page.getByRole('button', { name: 'Remove Brush Control from Watchlist' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('keeps the chosen accent color after a full reload', async ({ page }) => {
  await openFixture(page);
  await waitForCatalog(page);

  await page.getByRole('button', { name: 'Settings' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: 'Ultramarine' }).check({ force: true });
  const accentOf = () =>
    page.locator('#whtv-redux-app').evaluate((app) => getComputedStyle(app).getPropertyValue('--accent').trim());
  expect(await accentOf()).toBe('#7aa2ff');

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await injectUserscript(page);
  await waitForCatalog(page);
  expect(await accentOf()).toBe('#7aa2ff');
  await expect(page.locator('#whtv-redux-app')).toHaveAttribute('data-accent', 'ultramarine');
});

test('applies the chosen accent to selected controls', async ({ page }) => {
  await openFixture(page);
  await waitForCatalog(page);

  await page.getByRole('button', { name: 'Settings' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Loaded on this page')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Original Site' })).toHaveCount(0);
  await expect(dialog.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', /^https:\/\/github\.com\//);
  await expect(dialog.getByRole('link', { name: 'Changelog' })).toHaveAttribute('href', /\/CHANGELOG\.md$/);
  await dialog.getByRole('radio', { name: 'Crimson' }).check({ force: true });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  const app = page.locator('#whtv-redux-app');
  await expect(app).toHaveAttribute('data-accent', 'crimson');
  await expect(app.locator('.whtv-navbutton[aria-current="page"]').first()).toHaveCSS('color', 'rgb(255, 107, 107)');
  await expect(app.locator('.whtv-segment button[aria-pressed="true"]')).toHaveCSS('color', 'rgb(255, 107, 107)');
  await app.locator('.whtv-choice-menu summary[aria-label="Display"]').click();
  await expect(app.locator('.whtv-choice-options label:has(input[value="grid"]:checked)')).toHaveCSS(
    'color',
    'rgb(255, 107, 107)',
  );

  const selectedStyles = await app.evaluate((appElement) => {
    const activeNavigation = appElement.querySelector('.whtv-navbutton[aria-current="page"]');
    return {
      activeNavigationBackground: getComputedStyle(activeNavigation).backgroundColor,
      defaultNavigationBackground: 'rgb(41, 39, 31)',
    };
  });

  expect(selectedStyles.activeNavigationBackground).not.toBe(selectedStyles.defaultNavigationBackground);
});

test('restores the original page when the overlay is disabled', async ({ page }) => {
  await openFixture(page);
  await waitForCatalog(page);

  await page.getByRole('button', { name: 'Show Original Warhammer TV Site' }).click();

  await expect(page.locator('#whtv-redux-app')).toHaveCount(0);
  await expect(page.locator('#source-root')).toHaveJSProperty('inert', false);
});

test('does not mount on the player route', async ({ page }) => {
  await openFixture(page, '/player');

  await expect(page.locator('#whtv-redux-app')).toHaveCount(0);
  await expect(page.locator('#source-root')).toHaveJSProperty('inert', false);
});

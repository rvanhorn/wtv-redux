import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureDocument, homePayload, paintingDeskPayload, seriesPayload } from './fixtures.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artworkDocument =
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="#345"/></svg>';
// The suite runs a bundle built with `tests/browser/catalog.fixture.json` so its collections and
// counts do not change when the refreshed seed in `src/data/catalog.json` does.
export const testUserscriptPath = path.join(root, 'dist', 'WarhammerTV-Redux.test.user.js');

export async function installWarhammerRoutes(page) {
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (!['warhammertv.com', 'www.warhammertv.com'].includes(url.hostname)) {
      await route.abort();
      return;
    }
    if (url.searchParams.get('_data') === 'routes/_index') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(homePayload),
      });
      return;
    }
    if (url.pathname === '/series/101' && request.resourceType() !== 'document') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(seriesPayload),
      });
      return;
    }
    if (url.pathname === '/series/25751' && request.resourceType() !== 'document') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(paintingDeskPayload),
      });
      return;
    }
    if (request.resourceType() === 'document') {
      await route.fulfill({ status: 200, contentType: 'text/html', body: fixtureDocument });
      return;
    }
    if (url.pathname.startsWith('/art/')) {
      await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: artworkDocument });
      return;
    }
    await route.abort();
  });
}

export async function injectUserscript(page) {
  await page.addScriptTag({ path: testUserscriptPath });
}

export async function openFixture(page, pathname = '/') {
  await page.goto(`https://warhammertv.com${pathname}`, { waitUntil: 'domcontentloaded' });
  await injectUserscript(page);
}

export async function waitForCatalog(page) {
  await page.getByRole('button', { name: 'Details for Brush Control' }).waitFor();
}

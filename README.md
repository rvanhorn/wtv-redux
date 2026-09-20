# Warhammer TV Redux (WTV Redux)

Warhammer TV Redux (WTV Redux) is a modular userscript for Warhammer TV. It keeps the catalog, series
metadata, local watchlist, watched marks, filters, and import/export tools in one overlay while
leaving the original player and account access controls unchanged.

## How to Install

1. Install a userscript manager such as [Tampermonkey](https://www.tampermonkey.net/),
   [Violentmonkey](https://violentmonkey.github.io/), or Greasemonkey in your browser.
2. Download `WarhammerTV-Redux.user.js` from the [latest GitHub release](https://github.com/rvanhorn/wtv-redux/releases).
3. Open the downloaded file in your userscript manager and confirm the installation.
4. Open [Warhammer TV](https://www.warhammertv.com/). WTV Redux matches both the `www` and non-`www` site URLs.

The userscript adds the catalog overlay to Warhammer TV pages. The original player, playback links, and account
access controls remain available. The production userscript has no runtime dependency on this repository or on a
development server.

To install a local build, follow the setup steps in Development, run `pnpm run build`, and import
`dist/WarhammerTV-Redux.user.js` into your userscript manager.

Your watchlist, watched marks, display preferences, and accent color stay in this browser. Open Settings and use
Export to save a JSON backup before moving to another browser. Import previews the file and merges valid entries
without removing existing lists.

## Current Features

- All Videos, My Watchlist, Watched, and collection views with search, filters, sorting, and grid, compact, or list layouts.
- Series pages with season selection, episode counts, release metadata, recommendations, and contextual featured banners.
- Settings for accent color, featured-banner visibility, catalog refresh, series recounting, and artwork refresh.
- Local JSON export and import for watchlist and watched data.
- A bundled series catalog that gives a fresh install collection names, counts, and years before each collection is opened.

## Development

Install the dependencies and Playwright's Firefox build once:

```bash
pnpm install
pnpm exec playwright install firefox
```

Run the local development server:

```bash
pnpm run dev
```

The command prints a local URL for `WTV-Redux-Dev-Loader.user.js`. Open that URL in Firefox and
install the loader in Greasemonkey or Tampermonkey once. Disable the production WTV Redux userscript while the
development loader is enabled because both scripts match the same pages. Keep `pnpm run dev` running
while you edit. Each successful build makes the loader reload an open Warhammer TV tab and execute
the new bundle. A failed build leaves the last successful version in the tab and prints the error in
the terminal.

The development server listens only on `127.0.0.1`. The development loader executes JavaScript from
that local server, so enable it only while you are developing. The production userscript does not
contain the loader or its extra userscript-manager permission.

Run the deterministic browser suite with Playwright's Firefox build:

```bash
pnpm run test:browser
```

The suite uses local HTML and JSON fixtures under a Warhammer TV URL. It does not contact the live
service or require an account. Use `pnpm run test:browser:headed` to watch the Firefox run, and use
`pnpm run test:node` for the development-server failure and recovery checks. Use `pnpm run verify`
for the syntax, lint, server-lifecycle, and browser checks together.

Playwright's Firefox build does not start inside the command sandbox that some coding agents use.
Run `pnpm run browser` from a normal terminal to keep one visible Firefox open; test runs connect to
it while it is running. A run that can neither reach that server nor start Firefox stops with an
explanation before any browser launches. See `REPOSITORY.md` for the details.

The distributable file is `dist/WarhammerTV-Redux.user.js`. Install that file in Tampermonkey or
Violentmonkey for production use.

The build injects the userscript header and combines the JavaScript and CSS source. Node.js and
esbuild are development-only dependencies. Playwright is used only for development and tests. The
installed production userscript has no runtime dependency.

## Releases

`package.json` owns the release version. The build inserts this version into the userscript header.
Use Node.js 24 and pnpm 12 for development and release builds.

To publish a release:

1. Run `pnpm version patch --no-git-tag-version` (or use `minor` or `major`). The `version` script
   refreshes `src/data/catalog.json` from the live site before the bump completes. If the refresh
   fails, the version is already bumped; fix the cause and run `pnpm run catalog:refresh`.
2. Add a nonempty `## [0.5.0]` section to `CHANGELOG.md`, using the new package version.
3. Commit the source changes, `package.json`, `pnpm-lock.yaml`, `src/data/catalog.json`, and
   `CHANGELOG.md`, then push to `main`.

GitHub Actions compares the package version before and after the push. Unchanged versions skip
the build. Increased versions run `pnpm install --frozen-lockfile`, `pnpm run check`, and `pnpm run build`, then publish
`dist/WarhammerTV-Redux.user.js` as an asset of the matching version tag. Release notes come
from that version's changelog section, stopping at the next level-two heading.

The first push of a branch establishes the version baseline without publishing. Versions must use
stable `major.minor.patch` numbers. Decreased versions, force pushes, and missing or duplicate
changelog sections fail the workflow.

If a release run fails, rerun that original workflow run. An incomplete draft can resume; an
already published release is left unchanged. A version tag must identify the exact built commit.
Generated output is ignored by Git and is distributed through GitHub Releases.

## Data boundaries

The homepage adapter reads the same-origin `/?_data=routes/_index` response and uses a DOM scan as
fallback. Series requests use the browser's same-origin session. The script does not download
media, replay third-party feed URLs, or bypass the original player's access checks.

`src/data/catalog.json` is the generated series catalog bundled into each release. `pnpm run
catalog:refresh` rebuilds it from the public homepage and series JSON routes through the same
normalizers the app uses at runtime, and writes the file only when a series was added, removed, or
changed. It runs on every `pnpm version` and in the scheduled `Refresh bundled catalog` workflow,
which commits a changed file to `main` once a day or on manual dispatch. The seed holds series
only; the app learns videos from the live site. The app merges that seed with live responses and
stores newly learned catalog records in same-origin IndexedDB. The learned catalog survives normal reloads and browser restarts, but the browser can
remove it when the user clears Warhammer TV site data or when storage is evicted. Live requests use
the existing bounded series queue, and a failed refresh retains the last known catalog record.

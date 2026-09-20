# WTV Redux Changelog

## [0.5.0]

### Added

- A `pnpm run catalog:refresh` script that rebuilds the bundled series catalog from the public Warhammer TV JSON
  routes, runs on every `pnpm version`, and runs daily or on demand in a GitHub workflow that commits a changed
  catalog. The bundled catalog now lists every series the homepage names or links, with its title, video count,
  and year, so a fresh install shows all collections before any series is opened.

### Changed

- The userscript metadata now identifies `rvanhorn` as the author and links to the GitHub repository.
- Video details now pair artwork that fills its frame with the title, collections, and one compact row of watch
  actions. Metadata appears once, using a supplied release date or the production year. Topics use the full width,
  and extended classification guidance appears below the synopsis. Empty date fields, duplicate details, access
  text, and local-storage notes are omitted. The artwork and title stack on narrow screens.
- Featured banners now link their collection name, omit the redundant Video label and More info action, and show the
  year, runtime, and available topics directly. Collection pages show one recommendation: an in-progress video, the
  next available video after a completed item, or otherwise the newest video.
- Catalog controls now use one toolbar with All and Collections, followed by Collections, Viewing Status, Year,
  Sort, and Display. All dropdowns share the same menu design and wrap on narrow screens.
  Removed runtime and access filters, filter chips, and the explanatory text below the toolbar.
- All user-facing buttons, headings, and control labels now use title case. Sort and Display menus have visible labels and
  complete icons.
- All Videos now replaces the duplicate Browse and collection entries, shows the video count in the main navigation,
  and uses the page heading as the current-location label.
- The top bar now centers search, removes its duplicate current-location label, and gives its labeled utility actions
  the same button treatment as the catalog controls.
- Series pages no longer show the redundant details panel. Series controls now stay in the utility row below the
  Episodes heading.
- Series pages now remove unrelated catalog filters, duplicate counts, and the original-page button. The remaining
  episode count is more prominent, while sort and display choices use compact icon menus.
- Standard navigation, search, button, and select controls now use a compact 36-pixel height.
- Card artwork now shows a skeleton placeholder while it loads and fades in instead of appearing at once.
- The settings dialog now places its close button beside the title, drops the page statistics row, and replaces the
  original-site button with the version number, a GitHub repository link, and a changelog link.

### Fixed

- Featured banner information now stays aligned to the top while unused vertical space separates short descriptions
  from the bottom action row, so long titles are no longer pushed upward and clipped.
- The learned catalog no longer loses stored artwork when a page reload learns a video before the stored records
  load, so the featured banner and card artwork stay in place after repeated reloads.
- The learned catalog now stores each video's synopsis and topics, so the featured banner shows the year, runtime,
  topics, and synopsis after a page reload instead of only the title. A series learned before this change is fetched
  once more when it is opened so those details are stored.
- Series pages now show one horizontal All Videos breadcrumb with the current series in the accent color, and no
  redundant episode-browsing helper text.
- Browser test runs, `pnpm run browser`, and ad hoc scripts that use `openFirefox` now stop with one explanation
  before any Firefox process starts when the shell cannot reach the macOS window server or the shared browser
  server, instead of producing a Firefox crash dialog for every test.
- Opening a collection now reserves the featured banner space while its videos load, so the episode list does not
  shift down when the banner appears.
- A series whose videos are already stored in the learned catalog is no longer fetched again on every page reload
  or when it is opened again inside the six-hour cache window.
- Catalog cards now stay in place while a series is open, so their artwork is not requested and decoded again when
  the series is closed.
- Episodes restored from the learned catalog now keep their artwork. A series learned before this change is fetched
  once more when it is opened so its artwork is stored.
- An episode learned from a page scan before its artwork loaded no longer counts as having no artwork, so its series
  is fetched again when it is opened. Settings now has an Artwork refresh action that clears stored artwork and
  series counts so every series loads its artwork again when opened.
- Accent colors now apply consistently to active navigation, selected catalog controls, open filters, saved cards, and
  the paused featured control.
- The All Videos breadcrumb now returns from a native series URL to the catalog URL instead of creating an invalid
  series URL with a browse fragment.

## [0.4.0]

### Added

- A `pnpm run browser` script that keeps one Playwright Firefox open outside agent sandboxes. Browser test runs
  connect to it while its endpoint file exists, which avoids the startup crash inside sandboxed shells.
- A redesigned Settings dialog with label-and-control rows, descriptive text for each setting, and an accent color
  choice of six colors that is stored with the other preferences and included in list exports and imports.
- Dialogs now fade in and out over a blurred, darkened background.
- Browser tests for the userscript's main flows, Oxlint checks, and Oxfmt formatting.
- A Firefox Tampermonkey development loader that rebuilds automatically, reloads after successful changes, and keeps
  the last successful bundle after a build failure.
- Development-server lifecycle tests for initial failure recovery, failed-build retention, and restart revisions.
- Modular source under `src/` with API normalization, local storage, routing, reusable components, feature modules, and
  CSS layers.
- A production build that creates `dist/WarhammerTV-Redux.user.js` from the source modules.
- GitHub release automation that builds when the package version increases on `main`, attaches the userscript, and uses
  the matching changelog section for release notes.

### Changed

- Page headings no longer show a focus outline after navigation. Interactive controls retain keyboard focus indicators.
- The featured slider keeps Watch now, More info, and the pause and paging controls on one bottom row, widens the
  description and limits it to three lines, rotates every 12 seconds with a progress ring in the top
  right corner, and crossfades between titles instead of switching instantly.
- Collection counts show available videos without a plus suffix. All Videos uses the same video inventory, includes
  an Other videos group for standalone videos, and clears filters when opened. Collection sorting opens from an icon
  beside the Collections heading.
- Sidebar labels wrap with a protected gap before three-digit count and loading slots. Collection headings remain
  visible, artwork fills its frame, and catalog typography and narrow-screen spacing are more consistent.
- The sidebar collections list has a sort control for page order, A–Z, or recently updated, and the choice is
  saved with the other display preferences.
- Sidebar entries use less vertical space, the top bar breadcrumb sits on one line, and the current location in the
  breadcrumb uses the accent color.
- Icon rendering now uses bundled Lucide definitions for consistent icons without a runtime network dependency.
- Renamed the project to Warhammer TV Redux (WTV Redux) across the README, userscript metadata, runtime identifiers,
  and distribution artifact.
- Switched development and release tooling to pnpm 12 and replaced the npm lockfile with `pnpm-lock.yaml`.
- Extracted the catalog, series, local-list, import/export, and navigation behavior from the temporary monolithic
  userscript.
- Preserved the existing `whtv-better-ui` storage key for saved data while the userscript metadata uses the WTV Redux
  identity.
- The userscript header and settings screen use the release version from `package.json`.

## [0.3.0]

### Added

- Homepage catalog data loading through the supplied same-origin data endpoint, with DOM extraction as a fallback.
- Series browsing with isolated episode views, series metadata, season selection, episode lists, deep-link support, and
  episode-count badges.
- Runtime, production year, synopsis, content classification, keywords, parent-series data, and searchable keyword chips
  when available.
- All, Series, and Videos views with distinct View episodes and Watch now actions.
- Contextual hero banners that follow the active view, collection, filters, or personal list.
- Native Warhammer TV logo loading with a text fallback.
- Portable list export and validated import for favorites, watchlist entries, and manual watched entries.

### Changed

- Series counts now distinguish listed episodes from explicit series-wide totals and identify potentially incomplete
  results.
- Series navigation preserves the main catalog, active filters, and scroll position within the session.
- Banner rotation now supports pause controls, eight-second rotation, hover and focus pauses, hidden-tab pauses, and
  reduced-motion preferences.
- Loading and failure states now provide a finite request path, an escape route, and a retry state instead of an endless
  loader.
- Local list imports merge with existing entries and do not replace them.

### Fixed

- Invalid series 25852 no longer appears in the catalog, collection navigation, saved lists, or parent-series links.

- Series count requests are limited to two concurrent requests, use a 12-second timeout, and avoid automatic retries
  after failure.
- Fresh series counts no longer trigger duplicate prefetch requests, and count results remain cached for six hours.
- Fetched HTML is parsed without executing embedded scripts.
- Portable backup URLs remove session-bearing query fields, and imported records reject unsupported URLs, dangerous
  object keys, and untrusted image hosts.
- Native playback and series URLs remain unchanged when catalog links are opened or modified.

### Removed

- The ambiguous Series/Episodes split was replaced with All, Series, and Videos.
- Skeleton loading markup was replaced with a generic loading indicator and explicit loading and error states.

## [0.2.0]

### Added

- Artwork-first library layout with a desktop sidebar, mobile navigation, responsive cards, and an always-visible search
  field.
- Optional featured banner using titles and artwork from the loaded page.
- Grid, compact grid, and detailed list layouts.
- Details dialog with descriptions and additional metadata.
- All, Series, and Episodes switches with collection, watch-status, year, and runtime filters.
- Save and unsave controls with undo, explicit watched controls, display settings, and local-list JSON export.
- Metadata extraction for descriptions, runtime, year, season and episode labels, series context, collections, and
  source progress.

### Changed

- Saved entries retain metadata snapshots so they remain available in My watchlist when their source page is no longer
  loaded.
- The UI reuses its shell and card nodes during source updates and preserves the visible scroll position when new source
  titles appear.
- Local saved and watched state remains in browser storage under the existing site key.
- Original playback links remain intact, and the player route remains outside the overlay.

### Fixed

- Source updates no longer rebuild the entire UI or reset the user's scroll position.
- Own UI mutations are ignored by the source observer, and catalog loading stops after a finite retry budget.
- Legacy saved entries continue to match titles by URL or normalized identity.
- Storage failures are surfaced instead of being reported as successful list changes.
- Search, details, Escape-to-close, filters, responsive layouts, and original-site restoration work across the supported
  local test cases.

### Removed

- The separate plain-text copy is documented as an editor-friendly duplicate, not a second installable userscript.

## [0.1.0]

### Added

- Initial WTV Redux overlay for the Warhammer TV catalog and series pages.
- DOM-based catalog scanning with title, artwork, category, description, year, duration, episode label, series, and
  progress metadata when available.
- Search, collection filters, sorting, grid and list views, and result counts.
- Local saved-title and watched-title lists with persistent browser storage.
- Responsive layouts for desktop and mobile widths.
- Finite loading retries with a retry action and an option to return to the original site.
- Keyboard shortcuts for search and clearing the active search.

### Changed

- The overlay leaves original playback routes and links available to Warhammer TV.
- Catalog updates are merged into the current view instead of replacing earlier source results.

### Fixed

- Catalog updates preserve the current scroll position.
- The overlay does not mount on the player route.
- Missing source metadata remains hidden instead of being fabricated.

# Repository rules

## Runtime and dependencies

Use Node.js 24 and pnpm 12. Install dependencies from `pnpm-lock.yaml` with:

```bash
pnpm install --frozen-lockfile
```

The installed userscript must have no runtime network dependency. Bundle required JavaScript and
CSS into the distribution file.

## Development and checks

Use these commands from the repository root:

- `pnpm run dev` rebuilds source and CSS and serves a loopback-only Greasemonkey or Tampermonkey loader for Firefox.
- `pnpm run check` checks JavaScript syntax, runs Oxlint, and verifies Oxfmt formatting.
- `pnpm run lint:fix` applies safe Oxlint fixes.
- `pnpm run format` formats supported repository files with Oxfmt.
- `pnpm run hooks:install` configures Git to use the tracked hooks in `.githooks`.
- `pnpm run build` creates the production userscript.
- `pnpm run catalog:refresh` rebuilds `src/data/catalog.json` from the live site and writes it only when a series changed.
  `pnpm version` runs it, and `.github/workflows/refresh-catalog.yml` runs it daily and on manual dispatch.
- `pnpm run test` runs the development-server lifecycle tests and the deterministic Playwright Firefox suite.
- `pnpm run test:node` runs only the development-server lifecycle tests and the catalog refresh tests.
- `pnpm run test:browser` builds the userscript and runs only the Firefox suite.
- `pnpm run test:browser:headed` runs the browser suite for visible debugging.
- `pnpm run verify` runs the checks and the browser suite.
- `actionlint .github/workflows/*.yml` checks the workflows when `actionlint` is installed.

The development loader advances its revision only after a successful build. Run `pnpm run format`
and `pnpm run check` after the final edit. The pre-commit hook runs `pnpm run verify` and stops the commit if any
check or test fails. Run `pnpm run hooks:install` once after cloning the repository to enable the hook.

## Run browser checks through the shared browser server

Coding agents run shell commands inside a sandbox that denies access to the macOS window server.
Playwright's Firefox build aborts at startup without it, and macOS shows a crash dialog for each
attempt. Codex's `workspace-write` sandbox has this limit today. Claude Code's sandbox does not, but
the shared server keeps both agents on one path.

Start the server once from a normal terminal and leave it running:

```bash
pnpm run browser
```

It launches Playwright's Firefox with a visible window on `ws://127.0.0.1:7316/wtv-redux` and
writes `.playwright-server.json` at the repository root. While that file names a live process,
`pnpm run test`, `pnpm run test:browser`, `pnpm run verify`, and any script that uses
`playwright.config.js` connect to the running browser instead of launching one, so they work inside
an agent sandbox that allows loopback network access. Pass `--headless` to hide the window. Stop the
server with Ctrl+C; it removes the endpoint file. A stale file whose process has exited is ignored.

Before any Firefox process starts, `scripts/browser-launch.mjs` checks that the run can succeed.
When the endpoint file names a server, it checks that this shell can open a loopback connection to
it. When no server is running, it asks CoreGraphics whether this process may reach the window
server. If either check fails, the Playwright global setup and `pnpm run browser` stop with one
message that names the next step, and no Firefox process or crash dialog appears. The window-server
check runs a short `python3` probe; when `python3` is missing, the check passes and the run continues.

An ad hoc Playwright script must open Firefox the same way: import `openFirefox` from
`scripts/browser-launch.mjs` and call it in place of `firefox.launch()`. It connects to the running
server when one exists, launches Firefox when this shell may do so, and otherwise rejects with the
same message before any launch. A script kept outside the repository must import Playwright and
this module by their absolute paths under this repository, because a scratch location has no module
resolution for the project's dependencies.

Without the server, run the browser commands outside the agent sandbox. In Claude Code, that is the
Bash tool's option that disables the sandbox for one command. In Codex, that is a command approved
to run outside the sandbox. A Codex run with network access disabled has also been denied a loopback
`listen` call, so the shared server may be unreachable from that sandbox; the connection check
reports that case. Do not change the tests or the harness to work around a sandbox.

A local preview server started by a preview tool runs in its own sandbox and cannot read the
project directory, so serve copies of the needed files from the tool's scratch location instead.

## Tests must protect useful behavior

Keep all tests under `tests/`. Put browser tests and deterministic fixtures under `tests/browser/`.
Do not put test files beside source components.

The browser suite runs `dist/WarhammerTV-Redux.test.user.js`, which the Playwright global setup
builds with `tests/browser/catalog.fixture.json` in place of `src/data/catalog.json`. Keep the
fixture catalog fixed so the refreshed seed does not change collection names or counts in tests.

Add or update a test when it can catch a plausible regression in observable behavior, a data
boundary, persistence, routing, lifecycle cleanup, or error handling. Prefer one focused test for
each changed behavior. Reuse the local Warhammer TV fixtures in the regular suite.

Do not add a test only to increase the test count, restate a constant, prove JavaScript behavior,
or lock in a private implementation detail. Keep live-site and authenticated checks separate from
the regular suite.

## Build and distribution

The browser bundle targets ES2020. `scripts/build.mjs` creates
`dist/WarhammerTV-Redux.user.js`. Generated files under `dist/` are ignored by Git and published as
GitHub Release assets.

## Versions and changelog

`package.json` owns the stable `major.minor.patch` version. The build inserts that version into the
userscript header.

Keep an `## [Unreleased]` section above the latest released version in `CHANGELOG.md`. Add every
change made after the latest release to that section. Do not add new entries to a released version.
Use one tag at the start of every changelog item: `[Repo]` for repository tooling, tests, CI,
documentation, build, release, or package-manager changes; `[Userscript]` for shipped browser
behavior. Use both tags for a change that covers both areas. Within each `Added`, `Changed`,
`Fixed`, or `Removed` subsection, group items in this order: `[Repo]`, both tags, then
`[Userscript]`.

Update `CHANGELOG.md` for user-visible behavior, bug fixes, compatibility or data-format changes,
build or release process changes, and project identity changes. Do not add an entry for spelling,
formatting, or cleanup that changes no behavior, documented contract, or release artifact. Add the
entry in the same change. Describe the result and affected scope, not the implementation steps.

See `README.md` for the release procedure and retry behavior.

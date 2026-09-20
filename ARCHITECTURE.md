# Architecture

The repository separates the userscript into layers:

```text
Warhammer TV source
        |
        v
src/api/{client,catalog,series,normalize}.js
        |
        v
src/state + src/storage-compatible local list adapter
        |
        v
src/features and src/router
        |
        v
src/components and src/views
        |
        v
dist/WarhammerTV-Redux.user.js
```

`src/main.js` only creates the application and starts it. `src/views/app/index.js` owns composition
and lifecycle; the parts it composes live beside it, with owner-private parts under
`src/views/app/_components/`. API modules return normalized title records. Components receive records and state
helpers. Storage functions keep the existing `whtv-better-ui` key for compatibility and match legacy records by
URL or stable identity before using a new ID.

Series requests remain isolated from the catalog request. The series service limits concurrency to
two requests, uses a 12-second timeout, caches counts for six hours, and reports a failed series
without clearing the catalog.

CSS is kept in `src/styles/` and concatenated by `scripts/build.mjs`. The output starts with the
userscript metadata block so it can be installed directly.

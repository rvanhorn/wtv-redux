import fs from 'node:fs';
import http from 'node:http';
import { randomUUID } from 'node:crypto';

export function createDevLoaderSource(origin) {
  const developmentUrl = new URL(origin);
  return `// ==UserScript==
// @name         WTV Redux - Local Development
// @namespace    local.warhammertv.redux.development
// @version      2
// @description  Loads the latest local WTV Redux build and reloads after successful rebuilds.
// @match        https://warhammertv.com/*
// @match        https://www.warhammertv.com/*
// @run-at       document-idle
// @noframes
// @sandbox      raw
// @connect      ${developmentUrl.hostname}
// @grant        GM.xmlHttpRequest
// @downloadURL  ${developmentUrl.origin}/WTV-Redux-Dev-Loader.user.js
// @updateURL    ${developmentUrl.origin}/WTV-Redux-Dev-Loader.user.js
// ==/UserScript==

(() => {
  'use strict';

  const developmentOrigin = '${developmentUrl.origin}';
  let loadedRevision = null;
  let synchronizationIsRunning = false;

  const request = (pathname) =>
    new Promise((resolve, reject) => {
      GM.xmlHttpRequest({
        method: 'GET',
        url: developmentOrigin + pathname,
        anonymous: true,
        nocache: true,
        timeout: 2500,
        onload: resolve,
        onerror: () => reject(new Error('Could not reach the development server.')),
        ontimeout: () => reject(new Error('The development server request timed out.')),
        onabort: () => reject(new Error('The development server request was aborted.')),
      });
    });

  async function readStatus() {
    const response = await request('/__wtv_dev_status?time=' + Date.now());
    if (response.status !== 200) throw new Error('Development server returned HTTP ' + response.status + '.');
    return JSON.parse(response.responseText);
  }

  async function synchronize() {
    if (synchronizationIsRunning) return;
    synchronizationIsRunning = true;
    try {
      const status = await readStatus();
      if (!status.ready) return;
      if (loadedRevision !== null) {
        if (status.revision !== loadedRevision) location.reload();
        return;
      }

      const response = await request('/WarhammerTV-Redux.user.js?revision=' + encodeURIComponent(status.revision));
      if (response.status !== 200) throw new Error('Bundle request returned HTTP ' + response.status + '.');
      const source = response.responseText;
      const header = source.slice(0, 800);
      if (!header.includes('// ==UserScript==') || !header.includes('@namespace    local.warhammertv.redux')) {
        throw new Error('The development server returned an unexpected script.');
      }

      loadedRevision = status.revision;
      Function(source + '\\n//# sourceURL=wtv-redux-local-development.user.js')();
    } catch (error) {
      console.error('[WTV Redux development loader]', error);
    } finally {
      synchronizationIsRunning = false;
    }
  }

  window.setInterval(synchronize, 750);
  synchronize();
})();
`;
}

function send(response, statusCode, contentType, body) {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store, max-age=0',
    'Content-Type': contentType,
    'Cross-Origin-Resource-Policy': 'cross-origin',
  });
  response.end(body);
}

export async function startDevelopmentServer({
  buildBundle,
  host = '127.0.0.1',
  port = 7315,
  watchPaths = [],
  logger = console,
} = {}) {
  if (typeof buildBundle !== 'function') throw new TypeError('buildBundle must be a function.');
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new RangeError('The development port must be an integer from 0 through 65535.');

  const bootIdentifier = randomUUID();
  let successfulBuildNumber = 0;
  let revision = '';
  let lastBuildError = '';
  let lastSuccessfulBundle = null;
  let buildIsRunning = false;
  let buildIsQueued = false;
  let activeBuild = null;
  let rebuildTimer = null;
  let origin = '';

  function status() {
    return {
      ready: lastSuccessfulBundle !== null,
      revision,
      error: lastBuildError,
    };
  }

  async function runBuild() {
    if (buildIsRunning) {
      buildIsQueued = true;
      return activeBuild;
    }

    buildIsRunning = true;
    activeBuild = (async () => {
      do {
        buildIsQueued = false;
        try {
          const bundle = await buildBundle();
          if (!(typeof bundle === 'string' || Buffer.isBuffer(bundle))) {
            throw new TypeError('buildBundle must return a string or Buffer.');
          }
          lastSuccessfulBundle = bundle;
          successfulBuildNumber += 1;
          revision = `${bootIdentifier}:${successfulBuildNumber}`;
          lastBuildError = '';
          logger.log(`[WTV Redux] Build ${successfulBuildNumber} ready.`);
        } catch (error) {
          lastBuildError = error instanceof Error ? error.message : String(error);
          logger.error('[WTV Redux] Build failed. The browser will keep the last successful build.');
          logger.error(error);
        }
      } while (buildIsQueued);
      buildIsRunning = false;
    })();
    await activeBuild;
  }

  function scheduleBuild() {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(runBuild, 80);
  }

  const server = http.createServer((request, response) => {
    const url = new URL(request.url || '/', origin);
    if (url.pathname === '/__wtv_dev_status') {
      send(response, 200, 'application/json; charset=utf-8', JSON.stringify(status()));
      return;
    }
    if (url.pathname === '/WarhammerTV-Redux.user.js') {
      if (lastSuccessfulBundle === null) {
        send(response, 503, 'text/plain; charset=utf-8', lastBuildError || 'The first build is not ready.');
        return;
      }
      send(response, 200, 'application/javascript; charset=utf-8', lastSuccessfulBundle);
      return;
    }
    if (url.pathname === '/WTV-Redux-Dev-Loader.user.js') {
      send(response, 200, 'application/javascript; charset=utf-8', createDevLoaderSource(origin));
      return;
    }
    send(
      response,
      200,
      'text/plain; charset=utf-8',
      [
        'WTV Redux development server',
        '',
        `Install the Firefox Greasemonkey or Tampermonkey loader once: ${origin}/WTV-Redux-Dev-Loader.user.js`,
        'Keep this command running while you edit. A successful rebuild reloads matching tabs.',
      ].join('\n'),
    );
  });

  await runBuild();
  await new Promise((resolve, reject) => {
    const handleError = (error) => {
      server.off('listening', handleListening);
      reject(error);
    };
    const handleListening = () => {
      server.off('error', handleError);
      resolve();
    };
    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen(port, host);
  });

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('The development server did not provide a TCP address.');
  origin = `http://${host}:${address.port}`;
  const watchers = watchPaths.map((watchPath) => fs.watch(watchPath, { recursive: true }, scheduleBuild));

  async function close() {
    clearTimeout(rebuildTimer);
    watchers.forEach((watcher) => watcher.close());
    if (activeBuild) await activeBuild;
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }

  return { origin, rebuild: runBuild, status, close };
}

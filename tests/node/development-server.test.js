import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createDevLoaderSource, startDevelopmentServer } from '../../scripts/development-server.mjs';

const quietLogger = { log() {}, error() {} };

test('loads the bundle through the callback-only Greasemonkey request API', async () => {
  const developmentOrigin = 'http://127.0.0.1:7315';
  const errors = [];
  const context = vm.createContext({
    console: { error: (...arguments_) => errors.push(arguments_) },
    Date,
    encodeURIComponent,
    location: { reload() {} },
    window: { setInterval() {} },
    GM: {
      xmlHttpRequest(options) {
        queueMicrotask(() => {
          const url = new URL(options.url);
          if (url.pathname === '/__wtv_dev_status') {
            options.onload({ status: 200, responseText: JSON.stringify({ ready: true, revision: 'test:1' }) });
            return;
          }
          options.onload({
            status: 200,
            responseText:
              '// ==UserScript==\n// @namespace    local.warhammertv.redux\nglobalThis.wtvReduxLoaded = true;',
          });
        });
        return undefined;
      },
    },
  });

  vm.runInContext(createDevLoaderSource(developmentOrigin), context);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(context.wtvReduxLoaded, true);
  assert.deepEqual(errors, []);
});

test('retains the last successful bundle and changes revision only after success', async (context) => {
  let bundle = 'bundle one';
  let buildError = null;
  const developmentServer = await startDevelopmentServer({
    port: 0,
    logger: quietLogger,
    buildBundle: async () => {
      if (buildError) throw buildError;
      return bundle;
    },
  });
  context.after(() => developmentServer.close());

  const firstStatus = await fetch(`${developmentServer.origin}/__wtv_dev_status`).then((response) => response.json());
  assert.equal(firstStatus.ready, true);
  assert.equal(
    await fetch(`${developmentServer.origin}/WarhammerTV-Redux.user.js`).then((response) => response.text()),
    'bundle one',
  );

  buildError = new Error('fixture build failure');
  await developmentServer.rebuild();
  const failedStatus = await fetch(`${developmentServer.origin}/__wtv_dev_status`).then((response) => response.json());
  assert.equal(failedStatus.revision, firstStatus.revision);
  assert.equal(failedStatus.error, 'fixture build failure');
  assert.equal(
    await fetch(`${developmentServer.origin}/WarhammerTV-Redux.user.js`).then((response) => response.text()),
    'bundle one',
  );

  buildError = null;
  bundle = 'bundle two';
  await developmentServer.rebuild();
  const recoveredStatus = await fetch(`${developmentServer.origin}/__wtv_dev_status`).then((response) =>
    response.json(),
  );
  assert.notEqual(recoveredStatus.revision, firstStatus.revision);
  assert.equal(recoveredStatus.error, '');
  assert.equal(
    await fetch(`${developmentServer.origin}/WarhammerTV-Redux.user.js`).then((response) => response.text()),
    'bundle two',
  );
});

test('recovers from an initial failure and gives each server process a distinct revision', async (context) => {
  let shouldFail = true;
  const firstServer = await startDevelopmentServer({
    port: 0,
    logger: quietLogger,
    buildBundle: async () => {
      if (shouldFail) throw new Error('initial failure');
      return 'recovered bundle';
    },
  });
  context.after(() => firstServer.close());

  const initialStatus = firstServer.status();
  assert.equal(initialStatus.ready, false);
  assert.equal(initialStatus.revision, '');
  assert.equal(initialStatus.error, 'initial failure');

  shouldFail = false;
  await firstServer.rebuild();
  const recoveredStatus = firstServer.status();
  assert.equal(recoveredStatus.ready, true);

  const secondServer = await startDevelopmentServer({
    port: 0,
    logger: quietLogger,
    buildBundle: async () => 'recovered bundle',
  });
  context.after(() => secondServer.close());
  assert.notEqual(secondServer.status().revision, recoveredStatus.revision);

  const loader = await fetch(`${secondServer.origin}/WTV-Redux-Dev-Loader.user.js`).then((response) => response.text());
  assert.match(loader, /@sandbox\s+raw/);
  assert.match(loader, /window\.setInterval\(synchronize, 750\);\s+synchronize\(\);/);
});

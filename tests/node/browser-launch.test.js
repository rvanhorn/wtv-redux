import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { assertFirefoxCanStart } from '../../scripts/browser-launch.mjs';

async function withEndpointOverride(endpoint, run) {
  const previous = process.env.WHTV_BROWSER_ENDPOINT;
  process.env.WHTV_BROWSER_ENDPOINT = endpoint;
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.WHTV_BROWSER_ENDPOINT;
    else process.env.WHTV_BROWSER_ENDPOINT = previous;
  }
}

test('stops before launching when the recorded browser server is unreachable', async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));

  await withEndpointOverride(`ws://127.0.0.1:${port}/wtv-redux`, async () => {
    await assert.rejects(assertFirefoxCanStart(), (error) => {
      assert.match(error.message, /cannot connect to it/);
      assert.match(error.message, /pnpm run browser/);
      return true;
    });
  });
});

test('accepts a reachable browser server without launching anything', async () => {
  const server = net.createServer((socket) => socket.end());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await withEndpointOverride(`ws://127.0.0.1:${port}/wtv-redux`, () => assertFirefoxCanStart());
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

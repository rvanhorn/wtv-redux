import fs from 'node:fs/promises';
import { firefox } from '@playwright/test';
import { assertWindowServerAccess } from './browser-launch.mjs';
import { browserServerEndpointFile, defaultBrowserServerPort, root } from './browser-server-endpoint.mjs';

// Coding agents run shell commands inside a sandbox that denies the macOS window server, and
// Playwright's Firefox aborts at startup without it. This server runs from a normal terminal so the
// sandboxed test runs only need a loopback WebSocket, and its window shows the site to everyone.
const portArgumentIndex = process.argv.indexOf('--port');
const configuredPort = portArgumentIndex >= 0 ? process.argv[portArgumentIndex + 1] : process.env.WHTV_BROWSER_PORT;
const port = configuredPort === undefined ? defaultBrowserServerPort : Number(configuredPort);
const headless = process.argv.includes('--headless') || process.env.WHTV_BROWSER_HEADLESS === '1';

if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('The browser server port must be an integer from 1024 through 65535.');
}

assertWindowServerAccess();
const server = await firefox.launchServer({ headless, host: '127.0.0.1', port, wsPath: 'wtv-redux' });
const wsEndpoint = server.wsEndpoint();
await fs.writeFile(
  browserServerEndpointFile,
  `${JSON.stringify({ wsEndpoint, pid: process.pid, headless, root }, null, 2)}\n`,
);

console.log(`[WTV Redux] Browser server: ${wsEndpoint}`);
console.log(`[WTV Redux] Playwright runs connect to it while ${browserServerEndpointFile} exists.`);
console.log(`[WTV Redux] Mode: ${headless ? 'headless' : 'headed (pass --headless to hide the window)'}`);

let closeIsRunning = false;
async function close() {
  if (closeIsRunning) return;
  closeIsRunning = true;
  await fs.rm(browserServerEndpointFile, { force: true });
  await server.close();
}

process.once('SIGINT', close);
process.once('SIGTERM', close);
server.on('close', () => {
  fs.rm(browserServerEndpointFile, { force: true }).finally(() => process.exit(0));
});

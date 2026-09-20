import fs from 'node:fs/promises';
import path from 'node:path';
import { buildUserscript, outfile, root } from './build-userscript.mjs';
import { startDevelopmentServer } from './development-server.mjs';

const portArgumentIndex = process.argv.indexOf('--port');
const configuredPort = portArgumentIndex >= 0 ? process.argv[portArgumentIndex + 1] : process.env.WHTV_DEV_PORT;
const port = configuredPort === undefined ? 7315 : Number(configuredPort);

if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('The development port must be an integer from 1024 through 65535.');
}

const developmentServer = await startDevelopmentServer({
  port,
  watchPaths: [path.join(root, 'src'), path.join(root, 'userscript')],
  buildBundle: async () => {
    await buildUserscript();
    return fs.readFile(outfile);
  },
});

console.log(`[WTV Redux] Development server: ${developmentServer.origin}/`);
console.log(`[WTV Redux] Install once in Firefox: ${developmentServer.origin}/WTV-Redux-Dev-Loader.user.js`);

let closeIsRunning = false;
async function close() {
  if (closeIsRunning) return;
  closeIsRunning = true;
  await developmentServer.close();
}

process.once('SIGINT', close);
process.once('SIGTERM', close);

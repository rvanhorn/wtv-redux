import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const defaultBrowserServerPort = 7316;
export const browserServerEndpointFile = path.join(root, '.playwright-server.json');

/**
 * Returns the WebSocket endpoint of a running shared browser server, or an empty string.
 * The `WHTV_BROWSER_ENDPOINT` variable overrides the endpoint file. A file whose server process
 * has exited is ignored so a stale file cannot break a normal local launch.
 */
export function readBrowserServerEndpoint() {
  if (process.env.WHTV_BROWSER_ENDPOINT) return process.env.WHTV_BROWSER_ENDPOINT;
  let record;
  try {
    record = JSON.parse(fs.readFileSync(browserServerEndpointFile, 'utf8'));
  } catch {
    return '';
  }
  if (typeof record?.wsEndpoint !== 'string' || !Number.isInteger(record.pid)) return '';
  try {
    process.kill(record.pid, 0);
  } catch {
    return '';
  }
  return record.wsEndpoint;
}

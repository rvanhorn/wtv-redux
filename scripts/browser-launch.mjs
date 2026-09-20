import { spawnSync } from 'node:child_process';
import net from 'node:net';
import { firefox } from '@playwright/test';
import { browserServerEndpointFile, readBrowserServerEndpoint } from './browser-server-endpoint.mjs';

// Playwright's Firefox registers with the macOS window server during startup and aborts when a
// sandbox denies that mach lookup, even in headless mode. macOS then shows a crash dialog for every
// launch, and a test run launches once per test. This probe asks CoreGraphics the same question
// without aborting: CGSessionCopyCurrentDictionary returns NULL when the window server is denied.
const windowServerProbe = [
  'import ctypes',
  "cg = ctypes.CDLL('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics')",
  'cg.CGSessionCopyCurrentDictionary.restype = ctypes.c_void_p',
  "print('yes' if cg.CGSessionCopyCurrentDictionary() else 'no')",
].join('\n');

const sandboxAdvice =
  `No Firefox process was started. Start \`pnpm run browser\` from a normal terminal and run this ` +
  `command again, or run this command outside the agent sandbox. See REPOSITORY.md, ` +
  `"Run browser checks through the shared browser server".`;

/**
 * Returns false only when this process is on macOS and the window server denies it. An unavailable
 * or failing probe returns true so a missing python3 cannot block a normal run.
 */
export function hasWindowServerAccess() {
  if (process.platform !== 'darwin') return true;
  const result = spawnSync('python3', ['-c', windowServerProbe], { encoding: 'utf8', timeout: 10_000 });
  if (result.status !== 0) return true;
  return result.stdout.trim() !== 'no';
}

export function assertWindowServerAccess() {
  if (hasWindowServerAccess()) return;
  throw new Error(
    `This shell cannot reach the macOS window server, so Playwright's Firefox would abort at startup ` +
      `and macOS would show a crash dialog. ${sandboxAdvice}`,
  );
}

function connectToEndpoint(endpoint, timeoutMilliseconds) {
  const { hostname, port } = new URL(endpoint);
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: hostname, port: Number(port) });
    const finish = (error) => {
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };
    socket.setTimeout(timeoutMilliseconds, () => finish(new Error(`timed out after ${timeoutMilliseconds} ms`)));
    socket.once('connect', () => finish());
    socket.once('error', finish);
  });
}

async function assertEndpointReachable(endpoint) {
  try {
    await connectToEndpoint(endpoint, 3000);
  } catch (error) {
    throw new Error(
      `The shared browser server at ${endpoint} is recorded in ${browserServerEndpointFile}, but this ` +
        `shell cannot connect to it (${error.message}). Check that \`pnpm run browser\` is still running ` +
        `and that this sandbox allows loopback connections, or run this command outside the sandbox.`,
      { cause: error },
    );
  }
}

/**
 * Resolves when a Playwright Firefox run can proceed: either the shared browser server is reachable
 * or this process may launch Firefox itself. Rejects with the reason and the next step otherwise,
 * before any Firefox process starts.
 */
export async function assertFirefoxCanStart() {
  const endpoint = readBrowserServerEndpoint();
  if (endpoint) {
    await assertEndpointReachable(endpoint);
    return;
  }
  assertWindowServerAccess();
}

/**
 * Opens Firefox for an ad hoc script: connects to the shared browser server when one is running,
 * and launches Firefox with `launchOptions` otherwise. Close the returned browser when done.
 */
export async function openFirefox(launchOptions = {}) {
  await assertFirefoxCanStart();
  const endpoint = readBrowserServerEndpoint();
  return endpoint ? firefox.connect(endpoint) : firefox.launch(launchOptions);
}

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const installerPath = path.resolve('scripts/install-git-hooks.mjs');
const hookPath = path.resolve('.githooks/pre-commit');

test('configures the repository to use the tracked Git hooks', async (context) => {
  const repositoryPath = await fs.mkdtemp(path.join(os.tmpdir(), 'wtv-git-hooks-'));
  context.after(() => fs.rm(repositoryPath, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet'], { cwd: repositoryPath });

  execFileSync(process.execPath, [installerPath], { cwd: repositoryPath });

  const hooksPath = execFileSync('git', ['config', '--local', '--get', 'core.hooksPath'], {
    cwd: repositoryPath,
    encoding: 'utf8',
  }).trim();
  assert.equal(hooksPath, '.githooks');
});

test('finds pnpm in the user package-manager directory when Git omits it from PATH', async (context) => {
  const temporaryHome = await fs.mkdtemp(path.join(os.tmpdir(), 'wtv-git-hook-pnpm-'));
  context.after(() => fs.rm(temporaryHome, { recursive: true, force: true }));
  const pnpmDirectory = path.join(temporaryHome, 'Library', 'pnpm', 'bin');
  const invocationPath = path.join(temporaryHome, 'pnpm-arguments.txt');
  await fs.mkdir(pnpmDirectory, { recursive: true });
  const pnpmPath = path.join(pnpmDirectory, 'pnpm');
  await fs.writeFile(pnpmPath, '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$PNPM_ARGUMENTS_PATH"\n');
  await fs.chmod(pnpmPath, 0o755);

  execFileSync(hookPath, [], {
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      HOME: temporaryHome,
      PATH: '/usr/bin:/bin',
      PNPM_HOME: '',
      XDG_DATA_HOME: '',
      PNPM_ARGUMENTS_PATH: invocationPath,
    },
    encoding: 'utf8',
  });

  assert.equal(await fs.readFile(invocationPath, 'utf8'), 'run\nverify\n');
});

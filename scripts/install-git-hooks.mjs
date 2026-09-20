import { execFileSync } from 'node:child_process';

try {
  const isWorktree = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  if (isWorktree !== 'true') process.exit(0);
} catch {
  console.log('Skipped Git hook setup because this directory is not a Git worktree.');
  process.exit(0);
}

execFileSync('git', ['config', '--local', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
console.log('Configured Git to use the hooks in .githooks.');

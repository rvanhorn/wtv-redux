import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

function github(...argumentsList) {
  return execFileSync('gh', argumentsList, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
}

const { version } = JSON.parse(await fs.readFile('package.json', 'utf8'));
const tag = `v${version}`;
const commit = process.env.GITHUB_SHA;
const repository = process.env.GITHUB_REPOSITORY;
const artifact = 'dist/WarhammerTV-Redux.user.js';
const output = await fs.readFile(artifact, 'utf8');
if (!output.startsWith('// ==UserScript==') || !output.includes(`// @version      ${version}\n`)) {
  throw new Error('The built userscript does not contain the expected metadata.');
}

const pages = JSON.parse(github('api', `repos/${repository}/releases`, '--paginate', '--slurp'));
const existing = pages.flat().find((release) => release.tag_name === tag);
const tags = execFileSync('git', ['tag', '--list', tag], { encoding: 'utf8' }).trim();
if (tags) {
  const taggedCommit = execFileSync('git', ['rev-parse', `${tag}^{commit}`], { encoding: 'utf8' }).trim();
  if (taggedCommit !== commit) throw new Error(`${tag} already identifies a different commit.`);
}
if (existing && !existing.draft) {
  if (!tags) throw new Error('Published release has no local tag; check remote tags before retrying.');
  console.log(`${tag} is already published; leaving it unchanged.`);
} else {
  if (existing && existing.target_commitish !== commit) {
    throw new Error('Existing draft targets a different commit.');
  }
  if (!existing) {
    github('release', 'create', tag, '--target', commit, '--title', tag, '--notes-file', 'release-notes.md', '--draft');
  }
  github('release', 'upload', tag, artifact, '--clobber');
  github('release', 'edit', tag, '--notes-file', 'release-notes.md', '--draft=false');
  console.log(`Published ${tag}.`);
}

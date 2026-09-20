import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

function parseVersion(version) {
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error(`Expected a stable major.minor.patch version, received ${version}`);
  }
  return version.split('.').map(BigInt);
}

const { before, forced } = JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
if (forced) throw new Error('Release detection does not support force pushes.');

if (!before || /^0+$/.test(before)) {
  console.log('Initial branch push establishes the version baseline; no release.');
} else {
  if (!/^[a-f0-9]{40}$/.test(before)) throw new Error('Invalid previous commit.');
  const { version } = JSON.parse(await fs.readFile('package.json', 'utf8'));
  const previous = JSON.parse(execFileSync('git', ['show', `${before}:package.json`], { encoding: 'utf8' }));
  const currentParts = parseVersion(version);
  const previousParts = parseVersion(previous.version);
  const changedPart = currentParts.findIndex((part, index) => part !== previousParts[index]);
  if (changedPart === -1) {
    console.log(`Version remains ${version}; no build or release.`);
  } else {
    if (currentParts[changedPart] < previousParts[changedPart]) throw new Error('The package version decreased.');
    const changelog = await fs.readFile('CHANGELOG.md', 'utf8');
    const headings = [...changelog.matchAll(/^##[ \t]+\[([^\]\r\n]+)\][^\r\n]*\r?$/gm)];
    const matches = headings.filter((heading) => heading[1] === version);
    if (matches.length !== 1) throw new Error(`Expected exactly one CHANGELOG.md section for [${version}].`);
    const heading = matches[0];
    const remaining = changelog.slice(heading.index + heading[0].length);
    const nextHeading = remaining.search(/^##[ \t]+/m);
    const notes = (nextHeading === -1 ? remaining : remaining.slice(0, nextHeading)).trim();
    if (!notes || !notes.split('\n').some((line) => line.trim() && !line.startsWith('#'))) {
      throw new Error(`CHANGELOG.md section [${version}] has no release notes.`);
    }
    await fs.writeFile('release-notes.md', `${notes}\n`);
    await fs.appendFile(process.env.GITHUB_OUTPUT, `release=true\nversion=${version}\n`);
    console.log(`Prepared release ${version}.`);
  }
}

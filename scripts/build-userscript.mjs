import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const outfile = path.join(root, 'dist', 'WarhammerTV-Redux.user.js');
const bundledCatalogPath = path.join(root, 'src', 'data', 'catalog.json');

const cssFiles = [
  'variables.css',
  'base.css',
  'layout.css',
  'components.css',
  'views.css',
  'animations.css',
  'responsive.css',
].map((file) => path.join(root, 'src', 'styles', file));

async function createBuildOptions({ catalogFile, target }) {
  const cssText = (await Promise.all(cssFiles.map((file) => fs.readFile(file, 'utf8')))).join('\n');
  const { version, repository } = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const repositoryUrl = String(repository?.url || '')
    .replace(/^git\+/, '')
    .replace(/\.git$/, '');
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(repositoryUrl)) {
    throw new Error('package.json repository.url must be an https://github.com/<owner>/<name> URL.');
  }
  const headerTemplate = await fs.readFile(path.join(root, 'userscript', 'header.js'), 'utf8');
  const header = headerTemplate.replace('{{VERSION}}', version);

  return {
    entryPoints: [path.join(root, 'src', 'main.js')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    outfile: target,
    banner: { js: header.trimEnd() },
    // A build for the deterministic browser suite bundles a fixture catalog in place of the seed.
    plugins: catalogFile ? [replaceModule(bundledCatalogPath, path.resolve(root, catalogFile))] : [],
    define: {
      __WHTV_CSS__: JSON.stringify(cssText),
      __WHTV_VERSION__: JSON.stringify(version),
      __WHTV_REPOSITORY_URL__: JSON.stringify(repositoryUrl),
    },
    legalComments: 'none',
  };
}

function replaceModule(originalPath, replacementPath) {
  return {
    name: 'replace-module',
    setup(build) {
      build.onResolve({ filter: /\.json$/ }, (arguments_) => {
        const resolved = path.resolve(arguments_.resolveDir, arguments_.path);
        return resolved === originalPath ? { path: replacementPath } : null;
      });
    },
  };
}

export async function buildUserscript({ catalogFile = '', target = outfile } = {}) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await esbuild.build(await createBuildOptions({ catalogFile, target }));
  return target;
}

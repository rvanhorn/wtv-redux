import path from 'node:path';
import { assertFirefoxCanStart } from '../../scripts/browser-launch.mjs';
import { buildUserscript, root } from '../../scripts/build-userscript.mjs';
import { testUserscriptPath } from './harness.js';

export default async function globalSetup() {
  await assertFirefoxCanStart();
  await buildUserscript({
    catalogFile: path.join(root, 'tests', 'browser', 'catalog.fixture.json'),
    target: testUserscriptPath,
  });
}

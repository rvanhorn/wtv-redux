import path from 'node:path';
import { buildUserscript, outfile, root } from './build-userscript.mjs';

await buildUserscript();
console.log(`Built ${path.relative(root, outfile)}`);

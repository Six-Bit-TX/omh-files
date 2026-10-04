/** Validate published artifact files without loading a host or touching user data. */
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inventory = JSON.parse(await readFile(join(root, 'artifact-integrity.json'), 'utf8'));
let checked = 0;
for (const [file, digest] of Object.entries(inventory.files)) {
  const target = resolve(root, file);
  if (relative(root, target).startsWith('..')) throw new Error(`Artifact leaves bundle: ${file}`);
  const bytes = await readFile(target);
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== digest) throw new Error(`Artifact changed: ${file}; rebuild and update the integrity manifest.`);
  checked++;
}
function targets(value) {
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(targets);
  return [];
}
for (const leaf of await readdir(join(root, 'plugins'))) {
  const directory = join(root, 'plugins', leaf);
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  for (const target of targets(manifest.exports)) {
    if (target.includes('*')) continue;
    if (!(await stat(join(directory, target))).isFile()) throw new Error(`Missing export: ${manifest.name} ${target}`);
  }
  if (manifest.dsh?.client) {
    const client = targets(manifest.exports['./client']).find(path => path.endsWith('.js'));
    const body = await readFile(join(directory, client), 'utf8');
    if (!body.includes('__ModuleLoader__.load') || !body.includes(`id: ${JSON.stringify(manifest.name)}`)) {
      throw new Error(`Client artifact identity does not match ${manifest.name}`);
    }
  }
}
console.log(`Verified ${checked} artifact files and all plugin export/identity declarations.`);

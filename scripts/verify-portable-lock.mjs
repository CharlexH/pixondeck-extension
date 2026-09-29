import { readFile } from 'node:fs/promises';
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
for (const [path, entry] of Object.entries(lock.packages)) {
  if (path && (!path.startsWith('node_modules/') || path.split('/').includes('..'))) throw new Error(`Nonportable lock path: ${path}`);
  if (entry.link || (entry.resolved && !entry.resolved.startsWith('https://'))) throw new Error(`Nonregistry dependency in lock: ${path}`);
}
console.log('Dependency lock contains only portable registry packages.');

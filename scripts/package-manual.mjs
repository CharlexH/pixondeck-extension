// Retain the released manual-install identity without requiring a private key.
import { readFile, copyFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const identity = JSON.parse(await readFile('manual-install-key.json', 'utf8'));
const id = [...createHash('sha256').update(Buffer.from(identity.publicKey, 'base64')).digest('hex').slice(0, 32)].map(value => String.fromCharCode(97 + parseInt(value, 16))).join('');
if (id !== identity.extensionId) throw new Error('Manual-install public identity mismatch');
const result = spawnSync('npm', ['run', 'package:production'], {stdio: 'inherit', env: {...process.env, POD_EXTENSION_PUBLIC_KEY: identity.publicKey}});
if (result.status !== 0) process.exit(result.status || 1);
const manifest = JSON.parse(await readFile('dist-production/manifest.json', 'utf8'));
if (manifest.key !== identity.publicKey) throw new Error('Packaged identity mismatch');
const source = `artifacts/pixondeck-chrome-${manifest.version}-production-candidate.zip`;
const name = `pixondeck-chrome-${manifest.version}-manual-install.zip`;
await copyFile(source, `artifacts/${name}`);
const hash = createHash('sha256').update(await readFile(`artifacts/${name}`)).digest('hex');
await writeFile(`artifacts/${name}.sha256`, `${hash}  ${name}\n`);
console.log(`Manual-install candidate: artifacts/${name} (${identity.extensionId})`);

"""Copy an allowlisted client snapshot; never commit, push, or copy environment files."""
from pathlib import Path
import argparse
import json
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path, help='Local PixOnDeck checkout')
parser.add_argument('--apply', action='store_true', help='Apply after checking a clean public checkout')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
source = args.source.resolve()
extension = source / 'extensions/chrome'
if not (extension / 'package.json').is_file() or source == root:
    raise SystemExit('Expected a separate PixOnDeck source checkout.')

def replace_once(text, old, new):
    if text.count(old) != 1:
        raise SystemExit('Upstream structure changed; review standalone adaptations before syncing.')
    return text.replace(old, new, 1)

files = {}
for folder in ('src', 'preview'):
    for path in sorted((extension / folder).rglob('*')):
        if path.is_symlink():
            raise SystemExit('Unexpected symlink in upstream client.')
        if path.is_file():
            # Explicit source/media extensions, not arbitrary future files.
            if path.suffix not in {'.ts', '.html', '.css', '.mjs', '.png', '.jpg', '.mp4'}:
                raise SystemExit(f'Review new upstream file type: {path.name}')
            files[path.relative_to(extension).as_posix()] = path.read_bytes()
for name in ('scripts/build.mjs', 'scripts/create-dev-key.mjs', 'scripts/package-production.py', 'scripts/clerk-ui-disabled.ts', 'tsconfig.json', 'package-lock.json'):
    files[name] = (extension / name).read_bytes()
for old, new in [('public/favicon.ico', 'assets/favicon.ico'), ('public/icon.png', 'assets/icon.png'), ('public/images/logo.svg', 'assets/logo.svg')]:
    files[new] = (source / old).read_bytes()

name = 'scripts/build.mjs'
text = files[name].decode()
for old, new in [('../../public/favicon.ico','assets/favicon.ico'), ('../../public/icon.png','assets/icon.png'), ('../../public/images/logo.svg','assets/logo.svg')]:
    text = replace_once(text, old, new)
text = replace_once(text, 'const devKey = JSON.parse(await readFile("development-key.json", "utf8"));', '''let devKey;
try {
  devKey = JSON.parse(await readFile("development-key.json", "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  await import("./create-dev-key.mjs");
  devKey = JSON.parse(await readFile("development-key.json", "utf8"));
}''')
text += '\nfor (const name of ["LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.txt", "BRANDING.md"]) {\n  await copyFile(name, `${outdir}/${name}`);\n}\n'
files[name] = text.encode()
name = 'scripts/package-production.py'
files[name] = replace_once(files[name].decode(), "root.parents[1] / 'outputs' / 'chrome-store'", "root / 'artifacts'").encode()
name = 'src/language.ts'
files[name] = replace_once(files[name].decode(), 'import { LOCALES } from "../../../src/lib/locales";\n// Only expose languages whose extension UI is translated. Names/order come from the main site.\nexport const languages = LOCALES.filter(item => item.enabled && ["en", "zh-CN"].includes(item.code));', '''// Keep the standalone client limited to its translated languages.
export const languages = [
  { code: "en", name: "English", localName: "English", dir: "ltr", enabled: true },
  { code: "zh-CN", name: "Chinese (Simplified)", localName: "简体中文", dir: "ltr", enabled: true },
];''').encode()
name = 'preview/start.mjs'
text = files[name].decode()
for old, new in [('../../public/images/logo.svg','assets/logo.svg'), ('../../public/icon.png','assets/icon.png'), ('../../public/images/cards/icon-set/dev-01.png','src/assets/icon-128.png'), ('../../public/images/cards/logo-design/dev-01.png','src/assets/icon-128.png'), ("resolve(root,'../../public/images/cards',file)","resolve(root,'src/assets/icon-128.png')")]:
    text = replace_once(text, old, new)
files[name] = text.encode()
package = json.loads((extension / 'package.json').read_text())
public = json.loads((root / 'package.json').read_text())
for key in ('description', 'license', 'homepage', 'repository', 'bugs', 'engines'):
    package[key] = public[key]
package['devDependencies']['jsdom'] = public['devDependencies']['jsdom']
for key in ('notices', 'prebuild', 'prebuild:production'):
    package['scripts'][key] = public['scripts'][key]
files['package.json'] = (json.dumps(package, indent=2)+'\n').encode()
manifest = root / 'scripts/upstream-files.json'
previous = set(json.loads(manifest.read_text())) if manifest.exists() else set()
removed = previous - files.keys()
for name in previous:
    if name.startswith('/') or '..' in Path(name).parts:
        raise SystemExit('Invalid managed file path.')
changed = [name for name, data in files.items() if not (root/name).exists() or (root/name).read_bytes() != data]
print(f'{len(changed)} files to update; {len(removed)} previously managed files to remove.')
for name in changed: print('update', name)
for name in sorted(removed): print('remove', name)
print('Dependency lock is refreshed after application to include standalone test dependencies.')
if not args.apply:
    print('Dry run only. Review upstream changes, then repeat with --apply.')
    raise SystemExit(0)
if subprocess.check_output(['git','status','--porcelain'], cwd=root, text=True).strip():
    raise SystemExit('Public checkout must be clean. Commit or preserve your changes first.')
for name in removed:
    path = root/name
    if path.exists(): path.unlink()
for name, data in files.items():
    path = root/name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
manifest.write_text(json.dumps(sorted(files), indent=2)+'\n')
subprocess.run(['npm','install','--package-lock-only','--ignore-scripts'], cwd=root, check=True)
print('Applied locally. Review git diff, npm ci, typecheck, tests and build before committing. Nothing was pushed.')

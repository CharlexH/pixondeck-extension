"""Package only generated runtime files; stable metadata makes repeated ZIPs reproducible."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import hashlib
import json

root = Path(__file__).resolve().parents[1]
source = root / 'dist-production'
manifest = json.loads((source / 'manifest.json').read_text())
assert '128' in manifest['icons'], '128px icon is required'
assert 'activeTab' not in manifest['permissions'], 'Permission audit regressed'
assert not any('localhost' in origin or '127.0.0.1' in origin for origin in manifest['host_permissions'])
output = root / 'artifacts'
output.mkdir(parents=True, exist_ok=True)
archive = output / f'pixondeck-chrome-{manifest["version"]}-production-candidate.zip'
with ZipFile(archive, 'w', compression=ZIP_DEFLATED, compresslevel=9) as bundle:
    for path in sorted(source.rglob('*')):
        if path.is_file():
            relative = path.relative_to(source).as_posix()
            assert not relative.startswith('.') and path.suffix not in {'.map', '.ts'}, relative
            info = ZipInfo(relative, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            bundle.writestr(info, path.read_bytes(), compresslevel=9)
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
archive.with_suffix('.zip.sha256').write_text(f'{digest}  {archive.name}\n')
print(archive)
print('Candidate only: production API, auth allowlists, privacy and reviewer access must pass before submission.')

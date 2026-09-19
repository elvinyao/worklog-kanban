"""Export only generated extension assets; replace the managed directory atomically."""
import json
from pathlib import Path
import shutil
import tempfile
import uuid


def export(source:Path,target:Path):
    files={'manifest.json','worker.js','bridge.js'}
    if not all((source/name).is_file() for name in files):raise RuntimeError('Extension build is incomplete')
    manifest=json.loads((source/'manifest.json').read_text())
    if manifest.get('manifest_version')!=3:raise RuntimeError('Invalid extension manifest')
    if target.is_symlink():raise RuntimeError('Extension export target must not be a symlink')
    target.parent.mkdir(parents=True,exist_ok=True)
    staging=Path(tempfile.mkdtemp(prefix='.extension-',dir=target.parent))
    backup=target.with_name(target.name+'.previous-'+uuid.uuid4().hex)
    moved=False
    try:
        staging.chmod(0o755)
        for name in files:
            shutil.copy2(source/name,staging/name)
            (staging/name).chmod(0o644)
        if target.exists():target.rename(backup);moved=True
        try:staging.rename(target)
        except BaseException:
            if moved:backup.rename(target)
            raise
    finally:
        if staging.exists():shutil.rmtree(staging)


if __name__=='__main__':
    root=Path('/workspace').resolve()
    target=root/'dist/extension-docker'
    if not target.resolve().is_relative_to(root):raise SystemExit('Export path leaves the workspace')
    export(Path('/opt/worklog/dist/extension-dummy'),target)

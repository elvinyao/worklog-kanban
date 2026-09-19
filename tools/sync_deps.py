"""Install locked development dependencies and record the installed lock digests."""

import hashlib
from pathlib import Path
import subprocess
import sys

ROOT = Path('/workspace')
GROUPS = {
    'python': (ROOT / 'requirements/dev.txt', Path('/opt/venv/.worklog-lock')),
    'node': (ROOT / 'package-lock.json', ROOT / 'node_modules/.worklog-lock'),
}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def outdated() -> list[str]:
    return [
        name for name, (lock, marker) in GROUPS.items()
        if lock.exists() and (not marker.exists() or marker.read_text().strip() != digest(lock))
    ]


def main() -> None:
    if '--check' in sys.argv:
        stale = outdated()
        if stale:
            raise SystemExit(f'Changed/uninstalled dependency locks: {", ".join(stale)}. Run python -m tools.sync_deps through the Docker runner.')
        return
    for name in outdated():
        lock, marker = GROUPS[name]
        if name == 'python':
            subprocess.run([sys.executable, '-m', 'piptools', 'sync', '--pip-args', '--require-hashes', str(lock)], check=True)
        else:
            subprocess.run(['npm', 'ci'], cwd=ROOT, check=True)
        marker.write_text(digest(lock) + '\n')


if __name__ == '__main__':
    main()

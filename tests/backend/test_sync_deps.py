import subprocess
import sys
from pathlib import Path
import venv

import pytest

from tools import sync_deps


@pytest.fixture
def locked_environment(tmp_path, monkeypatch):
    lock = tmp_path / 'dev.txt'
    lock.write_text('synthetic hashed lock')
    marker = tmp_path / '.worklog-lock'
    monkeypatch.setattr(sync_deps, 'GROUPS', {'python': (lock, marker)})
    monkeypatch.setattr(sys, 'argv', ['tools.sync_deps'])
    return lock, marker


def test_fresh_or_changed_python_lock_installs_bootstrap_before_sync(locked_environment, monkeypatch):
    lock, marker = locked_environment
    commands = []
    expected_marker = None

    def run(command, **kwargs):
        assert (marker.read_text() if marker.exists() else None) == expected_marker
        commands.append(command)

    monkeypatch.setattr(sync_deps.subprocess, 'run', run)
    sync_deps.main()
    assert commands == [
        [sys.executable, '-m', 'pip', 'install', '--require-hashes', '-r', str(lock)],
        [sys.executable, '-m', 'piptools', 'sync', '--pip-args', '--require-hashes', str(lock)],
    ]
    assert marker.read_text().strip() == sync_deps.digest(lock)
    commands.clear()
    sync_deps.main()
    assert commands == []
    expected_marker = marker.read_text()
    lock.write_text('updated hashed lock including pip-tools')
    sync_deps.main()
    assert len(commands) == 2
    assert marker.read_text().strip() == sync_deps.digest(lock)


@pytest.mark.parametrize('failing_step', ['pip', 'piptools'])
def test_failed_dependency_install_does_not_mark_lock_current(locked_environment, monkeypatch, failing_step):
    lock, marker = locked_environment
    marker.write_text('old-lock')

    def fail(command, **kwargs):
        if command[2] == failing_step:
            raise subprocess.CalledProcessError(1, command)

    monkeypatch.setattr(sync_deps.subprocess, 'run', fail)
    with pytest.raises(subprocess.CalledProcessError):
        sync_deps.main()
    assert marker.read_text() == 'old-lock'
    assert sync_deps.outdated() == ['python']


def test_check_reports_missing_dependency_bootstrap_without_installing(locked_environment, monkeypatch):
    monkeypatch.setattr(sys, 'argv', ['tools.sync_deps', '--check'])
    monkeypatch.setattr(sync_deps.subprocess, 'run', lambda *args, **kwargs: pytest.fail('check must not install'))
    with pytest.raises(SystemExit, match='uninstalled dependency locks'):
        sync_deps.main()


def test_fresh_virtual_environment_bootstraps_hashed_development_tools(tmp_path):
    environment = tmp_path / 'fresh-venv'
    venv.EnvBuilder(with_pip=True).create(environment)
    python = environment / 'bin/python'
    marker = environment / '.worklog-lock'
    root = Path(__file__).resolve().parents[2]
    script = '''from pathlib import Path
import sys
from tools import sync_deps
sync_deps.GROUPS = {'python': (Path('requirements/dev.txt'), Path(sys.argv[1]))}
sync_deps.main()
assert sync_deps.outdated() == []
import piptools, pytest, fastapi
'''
    result = subprocess.run([str(python), '-c', script, str(marker)], cwd=root, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    assert marker.read_text().strip() == sync_deps.digest(root / 'requirements/dev.txt')

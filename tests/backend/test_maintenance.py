import json
from pathlib import Path
import sqlite3
import subprocess
import sys

import pytest
from fastapi.testclient import TestClient

from app import maintenance
from app.main import create_app
from app.store import Store
from test_api import CONFIG


@pytest.fixture
def database(tmp_path):
    path = tmp_path / 'board.sqlite3'
    Store(path, CONFIG).initialize()
    return path


def test_backup_check_restore_and_isolated_drill(database, tmp_path):
    backup = tmp_path / 'backup'
    with maintenance.offline(database):
        result = maintenance.make_backup(database, backup, CONFIG)
    assert maintenance.verify_backup(backup, CONFIG) == result
    database.write_bytes(b'corrupted original')
    with maintenance.offline(database):
        restored = maintenance.restore(backup, database, CONFIG)
    assert (Path(restored['previousFiles']) / database.name).read_bytes() == b'corrupted original'
    assert Store(database, CONFIG).snapshot().revision == 0
    scratch = tmp_path / 'drill' / 'board.sqlite3'
    with maintenance.offline(scratch):
        maintenance.restore(backup, scratch, CONFIG)
    assert Store(scratch, CONFIG).snapshot() == Store(database, CONFIG).snapshot()
    with pytest.raises(ValueError, match='must not exist'):
        maintenance.make_backup(database, backup, CONFIG)


@pytest.mark.parametrize('damage', ['checksum', 'site', 'schema', 'metadata', 'manifest'])
def test_invalid_backup_never_changes_destination(database, tmp_path, damage):
    backup = tmp_path / 'backup'
    maintenance.make_backup(database, backup, CONFIG)
    metadata = json.loads((backup / 'manifest.json').read_text())
    if damage == 'checksum':
        (backup / 'board.sqlite3').write_bytes(b'bad')
    elif damage == 'schema':
        import sqlite3
        with sqlite3.connect(backup / 'board.sqlite3') as connection:
            connection.execute('PRAGMA user_version=999')
        metadata['sha256'] = maintenance.digest(backup / 'board.sqlite3')
    elif damage == 'site':
        metadata['site'] = 'another site'
    elif damage == 'metadata':
        metadata['revision'] = 99
    else:
        metadata = []
    (backup / 'manifest.json').write_text(json.dumps(metadata))
    before = database.read_bytes()
    with pytest.raises(ValueError):
        maintenance.restore(backup, database, CONFIG)
    assert database.read_bytes() == before
    assert not list(tmp_path.glob('before-restore-*'))


def test_running_board_excludes_maintenance(database):
    with TestClient(create_app(config=CONFIG, database=database)):
        with pytest.raises(ValueError, match='Stop the board'):
            with maintenance.offline(database):
                pass


def test_failed_replace_preserves_bytes_blocks_start_and_retry_recovers(database, tmp_path, monkeypatch):
    backup = tmp_path / 'backup'
    maintenance.make_backup(database, backup, CONFIG)
    database.write_bytes(b'old damaged bytes')
    wal = Path(str(database) + '-wal')
    wal.write_bytes(b'old wal')
    replace = maintenance.os.replace
    def fail(*args):
        raise OSError('simulated interruption')
    monkeypatch.setattr(maintenance.os, 'replace', fail)
    with pytest.raises(OSError):
        maintenance.restore(backup, database, CONFIG)
    assert database.read_bytes() == b'old damaged bytes'
    assert wal.read_bytes() == b'old wal'
    with pytest.raises(RuntimeError, match='Incomplete database restore'):
        with TestClient(create_app(config=CONFIG, database=database)):
            pass
    monkeypatch.setattr(maintenance.os, 'replace', replace)
    maintenance.restore(backup, database, CONFIG)
    with TestClient(create_app(config=CONFIG, database=database), base_url=CONFIG.boardOrigin) as client:
        assert client.get('/health').status_code == 200


def test_restore_does_not_replace_its_backup(database, tmp_path):
    backup = tmp_path / 'backup'
    maintenance.make_backup(database, backup, CONFIG)
    with pytest.raises(ValueError, match='outside the backup'):
        maintenance.restore(backup, backup / 'board.sqlite3', CONFIG)


def test_backup_includes_uncheckpointed_wal(database, tmp_path):
    with sqlite3.connect(database) as writer:
        writer.execute('PRAGMA wal_autocheckpoint=0')
        writer.execute('UPDATE board_meta SET revision=17 WHERE id=1')
        writer.commit()
        backup = tmp_path / 'backup'
        maintenance.make_backup(database, backup, CONFIG)
        assert maintenance.verify_backup(backup, CONFIG)['revision'] == 17
        assert sorted(path.name for path in backup.iterdir()) == ['board.sqlite3', 'manifest.json']


def test_production_cli_backup_check_and_restore(database, tmp_path):
    config = tmp_path / 'site.json'
    config.write_text(Path('config/production.example.json').read_text())
    backup = tmp_path / 'cli-backup'
    scratch = tmp_path / 'scratch' / 'board.sqlite3'
    def run(*arguments):
        result = subprocess.run([sys.executable, '-m', 'app.cli', 'maintenance', *arguments,
            '--config', str(config)], capture_output=True, text=True)
        assert result.returncode == 0, result.stderr
        return json.loads(result.stdout)
    created = run('backup', '--database', str(database), '--output', str(backup))
    assert run('check', '--backup', str(backup)) == created
    assert run('restore', '--backup', str(backup), '--database', str(scratch))['sha256'] == created['sha256']

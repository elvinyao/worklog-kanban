"""Offline production backups, verification and guarded restore. No Docker dependency."""
import argparse
from contextlib import closing, contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile
import uuid

from app.config import SiteConfig
from app.store import Store


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def config_digest(config):
    return hashlib.sha256(config.model_dump_json().encode()).hexdigest()


@contextmanager
def offline(database):
    database.parent.mkdir(parents=True, exist_ok=True)
    with database.with_suffix(database.suffix + '.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError('Stop the board before maintenance') from None
        yield


def inspect_database(database, config):
    with closing(sqlite3.connect(database.as_uri() + '?mode=ro&immutable=1', uri=True)) as connection:
        connection.row_factory = sqlite3.Row
        if [tuple(row) for row in connection.execute('PRAGMA integrity_check')] != [('ok',)]:
            raise ValueError('Database integrity check failed')
        if connection.execute('PRAGMA foreign_key_check').fetchall():
            raise ValueError('Database foreign key check failed')
        version = connection.execute('PRAGMA user_version').fetchone()[0]
        if version != 3:
            raise ValueError('Use the matching release to restore this database schema')
        snapshot = Store._snapshot(connection)
    return {'schema': version, 'revision': snapshot.revision, 'cards': len(snapshot.cards)}


def copy_database(source, destination):
    with closing(sqlite3.connect(source.as_uri() + '?mode=ro', uri=True)) as reader:
        with closing(sqlite3.connect(destination)) as writer:
            reader.backup(writer)
            writer.execute('PRAGMA journal_mode=DELETE')


def make_backup(database, output, config):
    if output.exists() or output.is_symlink():
        raise ValueError('Backup output must not exist')
    if not database.is_file():
        raise ValueError('Database does not exist')
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix='.backup-', dir=output.parent))
    try:
        copy_database(database, staging / 'board.sqlite3')
        details = inspect_database(staging / 'board.sqlite3', config)
        manifest = {'format': 1, 'createdAt': datetime.now(timezone.utc).isoformat(),
                    'site': config_digest(config), 'sha256': digest(staging / 'board.sqlite3'), **details}
        (staging / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
        sync(staging / 'board.sqlite3')
        sync(staging / 'manifest.json')
        sync(staging)
        # Atomic publication; callers must use a fresh directory name.
        staging.rename(output)
        sync(output.parent)
        return manifest
    finally:
        if staging.exists():
            shutil.rmtree(staging)


def verify_backup(backup, config):
    if any((backup / ('board.sqlite3' + suffix)).exists() for suffix in ('-wal', '-shm', '-journal')):
        raise ValueError('Backup must be a standalone database without sidecars')
    manifest = json.loads((backup / 'manifest.json').read_text())
    if not isinstance(manifest, dict):
        raise ValueError('Invalid backup manifest')
    database = backup / 'board.sqlite3'
    if manifest.get('format') != 1 or manifest.get('site') != config_digest(config):
        raise ValueError('Backup format or site configuration does not match')
    if manifest.get('sha256') != digest(database):
        raise ValueError('Backup checksum does not match')
    details = inspect_database(database, config)
    if any(manifest.get(key) != value for key, value in details.items()):
        raise ValueError('Backup metadata does not match database')
    return manifest


def restore(backup, database, config):
    if database == backup / 'board.sqlite3' or backup in database.parents:
        raise ValueError('Restore destination must be outside the backup')
    verify_backup(backup, config)
    # Verify a private copy, then restore those exact bytes (not a mutable source).
    with tempfile.TemporaryDirectory(prefix='.restore-', dir=database.parent) as directory:
        staging = Path(directory)
        shutil.copy2(backup / 'board.sqlite3', staging / 'board.sqlite3')
        shutil.copy2(backup / 'manifest.json', staging / 'manifest.json')
        details = verify_backup(staging, config)
        preserved = database.parent / ('before-restore-' + uuid.uuid4().hex)
        preserved.mkdir(mode=0o700)
        originals = [Path(str(database) + suffix) for suffix in ('', '-wal', '-shm')]
        # Retain even a corrupted database and its sidecars, without opening it.
        for source in originals:
            if source.exists():
                shutil.copy2(source, preserved / source.name)
        (preserved / 'recovery.json').write_text(json.dumps({'database': database.name,
            'files': {p.name: digest(p) for p in preserved.iterdir()}}, indent=2) + '\n')
        for path in preserved.iterdir():
            sync(path)
        sync(preserved)
        marker = database.with_suffix(database.suffix + '.maintenance')
        # Persist recovery information before touching original bytes. A crash
        # blocks startup until an operator retries restore.
        if not marker.exists():
            marker.write_text(str(preserved) + '\n')
        sync(marker)
        sync(database.parent)
        try:
            for source in originals[1:]:
                if source.exists():
                    source.unlink()
            os.replace(staging / 'board.sqlite3', database)
            sync(database)
            sync(database.parent)
        except BaseException:
            for source in originals:
                saved = preserved / source.name
                if saved.exists():
                    shutil.copy2(saved, source)
                    sync(source)
                elif source.exists():
                    source.unlink()
            # Retain the marker if restoration or rollback fails.
            raise
        marker.unlink()
        sync(database.parent)
        return {**details, 'previousFiles': str(preserved)}


def sync(path):
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def main(argv=None):
    parser = argparse.ArgumentParser(description='Offline production database maintenance')
    parser.add_argument('operation', choices=['backup', 'check', 'restore'])
    parser.add_argument('--config', required=True, type=Path)
    parser.add_argument('--database', type=Path, default=Path('/data/board.sqlite3'))
    parser.add_argument('--output', type=Path)
    parser.add_argument('--backup', type=Path)
    args = parser.parse_args(argv)
    try:
        config = SiteConfig.model_validate_json(args.config.read_text())
        if config.mode != 'production':
            raise ValueError('Production configuration required')
        database = args.database.expanduser().resolve()
        if args.operation == 'check':
            if args.backup is None:
                raise ValueError('--backup is required')
            result = verify_backup(args.backup.resolve(), config)
        else:
            with offline(database):
                if args.operation == 'backup':
                    if database.with_suffix(database.suffix + '.maintenance').exists():
                        raise ValueError('Finish the interrupted restore before backing up')
                    if args.output is None:
                        raise ValueError('--output is required')
                    result = make_backup(database, args.output.absolute(), config)
                else:
                    if args.backup is None:
                        raise ValueError('--backup is required')
                    result = restore(args.backup.resolve(), database, config)
        print(json.dumps(result, ensure_ascii=False))
    except (OSError, ValueError, sqlite3.Error) as error:
        parser.exit(2, f'Maintenance failed: {error}\n')


if __name__ == '__main__':
    main()

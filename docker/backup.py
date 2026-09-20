"""SQLite backups and stopped-service recovery; never exports external source content."""
import argparse
from contextlib import closing
from datetime import datetime,timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import tempfile
import time
import uuid

from docker.deployment import atomic_json,confined,load_settings,state_dir


def digest(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()


def read_connection(path,*,immutable=False):
    if not path.is_file() or path.is_symlink():raise ValueError('Database is missing or is a symbolic link')
    connection=sqlite3.connect(path.resolve().as_uri()+'?mode=ro'+('&immutable=1' if immutable else ''),uri=True,timeout=5)
    connection.execute('PRAGMA trusted_schema=OFF')
    return connection


def inspect_database(path,*,immutable=False):
    try:
        with closing(read_connection(path,immutable=immutable)) as connection:
            version=connection.execute('PRAGMA user_version').fetchone()[0]
            if version not in (1,2,3):raise ValueError('Unsupported database schema')
            if connection.execute('PRAGMA integrity_check').fetchall()!=[('ok',)]:raise ValueError('Database integrity check failed')
            if connection.execute('PRAGMA foreign_key_check').fetchall():raise ValueError('Database foreign keys are invalid')
            tables={row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            required={'board_meta','columns','cards','mattermost_links','audit_events'}
            if version>=2:required.add('jira_links')
            if version==3:required.update({'board_archives','archived_cards','archive_operations','archive_restorations'})
            if not required<=tables:raise ValueError('Not a Worklog database')
            row=connection.execute('SELECT revision FROM board_meta WHERE id=1').fetchone()
            if not row or not isinstance(row[0],int) or row[0]<0:raise ValueError('Invalid board revision')
            return {'schema':version,'revision':row[0]}
    except sqlite3.Error:raise ValueError('Database is unreadable or corrupt') from None


def fsync_directory(directory):
    descriptor=os.open(directory,os.O_RDONLY)
    try:os.fsync(descriptor)
    finally:os.close(descriptor)


def sync_file(path):
    with path.open('rb') as stream:os.fsync(stream.fileno())


def backup_parent(root,project):
    state_dir(root,project)
    parent=confined(root,'backups/'+project)
    owner=Path(root).stat()
    for directory in (parent.parent,parent):
        directory.mkdir(mode=0o700,exist_ok=True)
        if os.getuid()==0 and directory.stat().st_uid==0:os.chown(directory,owner.st_uid,owner.st_gid)
    return parent


def publish(root,parent,staging,manifest):
    identifier=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:8]
    atomic_json(staging/'manifest.json',manifest)
    owner=Path(root).stat()
    for path in staging.iterdir():
        path.chmod(0o600);sync_file(path)
        if os.getuid()==0:os.chown(path,owner.st_uid,owner.st_gid)
    staging.chmod(0o700)
    if os.getuid()==0:os.chown(staging,owner.st_uid,owner.st_gid)
    fsync_directory(staging);staging.replace(parent/identifier);fsync_directory(parent)
    return identifier


def create_backup(root,project,data,*,image='',reason='manual'):
    settings=load_settings(root,project)
    if not settings:raise ValueError('No successful deployment to back up')
    database=Path(data)/'board.sqlite3'
    if not database.is_file():raise ValueError('No database to back up')
    parent=backup_parent(root,project);staging=Path(tempfile.mkdtemp(prefix='.backup-',dir=parent))
    try:
        started=time.monotonic()
        def progress(*_):
            if time.monotonic()-started>30:raise ValueError('Database backup timed out; retry when writes settle')
        with closing(read_connection(database)) as source,closing(sqlite3.connect(staging/'board.sqlite3')) as target:
            source.backup(target,pages=128,progress=progress,sleep=.05)
            target.execute('PRAGMA journal_mode=DELETE')
        metadata=inspect_database(staging/'board.sqlite3',immutable=True)
        return publish(root,parent,staging,{'format':1,'restorable':True,'project':project,'sites':settings['sites'],'createdAt':datetime.now(timezone.utc).isoformat(),'image':image,'reason':reason,**metadata,'sha256':digest(staging/'board.sqlite3')})
    except sqlite3.Error:raise ValueError('Database could not be backed up') from None
    finally:
        if staging.exists():shutil.rmtree(staging)


def backup_path(root,project,identifier):
    state_dir(root,project)
    if not re.fullmatch(r'\d{8}T\d{6}Z-[a-f0-9]{8}',identifier):raise ValueError('Use a backup ID from backups')
    return confined(root,'backups/'+project+'/'+identifier)


def read_manifest(directory):
    path=directory/'manifest.json'
    if path.is_symlink() or not path.is_file() or path.stat().st_size>16384:raise ValueError('Invalid backup manifest')
    try:
        result=json.loads(path.read_text())
        if not isinstance(result,dict):raise ValueError()
        return result
    except (ValueError,UnicodeError):raise ValueError('Invalid backup manifest') from None


def validate_copy(root,project,directory):
    settings=load_settings(root,project);manifest=read_manifest(directory)
    if not settings or manifest.get('format')!=1 or manifest.get('restorable') is not True:raise ValueError('Unsupported backup format')
    if manifest.get('project')!=project or manifest.get('sites')!=settings['sites']:raise ValueError('Backup project/sites do not match the deployed project')
    database=directory/'board.sqlite3'
    if database.is_symlink() or not database.is_file() or digest(database)!=manifest.get('sha256'):raise ValueError('Backup checksum does not match')
    details=inspect_database(database,immutable=True)
    if any(details[key]!=manifest.get(key) for key in ('schema','revision')):raise ValueError('Backup metadata does not match database')
    return manifest


def stage_restore(root,project,identifier,data):
    source=backup_path(root,project,identifier)
    if not Path(data).is_dir():raise ValueError('Data volume does not exist')
    staging=Path(tempfile.mkdtemp(prefix='.restore-',dir=data))
    try:
        for name in ('manifest.json','board.sqlite3'):
            item=source/name
            if item.is_symlink() or not item.is_file():raise ValueError('Backup files are missing or symbolic links')
            shutil.copyfile(item,staging/name)
        validate_copy(root,project,staging)
        return staging.name
    except BaseException:
        shutil.rmtree(staging);raise


def preserve_raw(root,project,data,image):
    parent=backup_parent(root,project);staging=Path(tempfile.mkdtemp(prefix='.backup-',dir=parent))
    try:
        for name in ('board.sqlite3','board.sqlite3-wal','board.sqlite3-shm'):
            path=Path(data)/name
            if path.exists():
                if path.is_symlink():raise ValueError('Database files must not be symbolic links')
                shutil.copyfile(path,staging/name)
        return publish(root,parent,staging,{'format':1,'restorable':False,'project':project,'createdAt':datetime.now(timezone.utc).isoformat(),'image':image,'reason':'before-restore-raw'})
    finally:
        if staging.exists():shutil.rmtree(staging)


def apply_restore(root,project,data,stage,*,image=''):
    if not re.fullmatch(r'\.restore-[a-z0-9_]+',stage):raise ValueError('Invalid staged restore')
    data=Path(data);staging=data/stage;database=data/'board.sqlite3'
    if staging.is_symlink() or not staging.resolve().is_relative_to(data.resolve()):raise ValueError('Invalid staged restore')
    validate_copy(root,project,staging)
    lock_path=data/'board.sqlite3.lock'
    if lock_path.is_symlink() or database.is_symlink():raise ValueError('Database files must not be symbolic links')
    with lock_path.open('a') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise ValueError('The application is still running; stop it before restoring') from None
        before=None;owner=database.stat() if database.exists() else data.stat()
        if os.getuid()==0:os.fchown(lock.fileno(),owner.st_uid,owner.st_gid)
        os.fchmod(lock.fileno(),0o600)
        if database.exists():
            try:before=create_backup(root,project,data,image=image,reason='before-restore')
            except ValueError:before=preserve_raw(root,project,data,image)
        # Stopped app + matching lock excludes application writers. Close all SQLite
        # handles before replacing, and never let an old WAL attach to the new DB.
        if database.exists():
            try:
                with closing(sqlite3.connect(database,timeout=5)) as current:
                    if current.execute('PRAGMA wal_checkpoint(TRUNCATE)').fetchone()[0]!=0:raise ValueError('Database is busy; restore was not applied')
            except sqlite3.DatabaseError:
                if before is None:raise
        for suffix in ('-wal','-shm'):
            path=Path(str(database)+suffix)
            if path.is_symlink():raise ValueError('Database sidecars must not be symbolic links')
            path.unlink(missing_ok=True)
        replacement=staging/'board.sqlite3';replacement.chmod(0o600)
        if os.getuid()==0:os.chown(replacement,owner.st_uid,owner.st_gid)
        sync_file(replacement);replacement.replace(database);fsync_directory(data)
        shutil.rmtree(staging)
        return {'beforeBackup':before,'restored':True}


def list_backups(root,project):
    state_dir(root,project);parent=confined(root,'backups/'+project)
    if not parent.exists():return []
    results=[]
    for path in sorted(parent.iterdir(),reverse=True):
        if re.fullmatch(r'\d{8}T\d{6}Z-[a-f0-9]{8}',path.name) and path.is_dir() and not path.is_symlink():
            try:manifest=read_manifest(path);results.append({'id':path.name,'createdAt':manifest.get('createdAt'),'schema':manifest.get('schema'),'restorable':manifest.get('restorable') is True,'reason':manifest.get('reason')})
            except (ValueError,OSError):results.append({'id':path.name,'restorable':False,'reason':'invalid manifest'})
    return results


def main():
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['backup','backups','stage','apply'])
    parser.add_argument('--project',required=True);parser.add_argument('--root',type=Path,default=Path('/workspace'));parser.add_argument('--data',type=Path,default=Path('/data'));parser.add_argument('--id');parser.add_argument('--image',default='')
    args=parser.parse_args()
    try:
        if args.action=='backup':print(create_backup(args.root,args.project,args.data,image=args.image))
        elif args.action=='stage':print(stage_restore(args.root,args.project,args.id or '',args.data))
        elif args.action=='apply':print(json.dumps(apply_restore(args.root,args.project,args.data,args.id or '',image=args.image)))
        else:
            rows=list_backups(args.root,args.project)
            if not rows:print('No backups for this project.')
            for row in rows:print(f'{row["id"]}  schema={row.get("schema","-")}  {row.get("reason","")}  '+('restorable' if row['restorable'] else 'retained files only'))
    except (ValueError,OSError,sqlite3.Error) as error:
        # Only controlled errors are exposed; no SQL, task contents or absolute input dumps.
        message=str(error) if isinstance(error,ValueError) else 'Backup/recovery file operation failed; inspect doctor and retained backups.'
        raise SystemExit(message) from None


if __name__=='__main__':main()

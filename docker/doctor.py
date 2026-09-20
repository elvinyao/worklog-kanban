"""Read-only diagnostics using only Python's standard library; no application imports."""
import argparse
from contextlib import closing
import fcntl
import json
from pathlib import Path
import re
import shutil
import sqlite3
import tempfile
from urllib.parse import urlsplit
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None


def check_health(origin,*,port=4173):
    request=urllib.request.Request(f'http://127.0.0.1:{port}/health',headers={'Host':urlsplit(origin).netloc})
    try:
        with urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect()).open(request,timeout=3) as response:
            return response.status==200
    except (OSError,ValueError):return False


def database_details(database):
    with closing(sqlite3.connect(database.resolve().as_uri()+'?mode=ro',uri=True,timeout=3)) as connection:
        connection.execute('PRAGMA trusted_schema=OFF');connection.execute('BEGIN')
        schema=connection.execute('PRAGMA user_version').fetchone()[0]
        if schema not in (1,2,3):raise ValueError('Unsupported database schema; use a matching application version.')
        if connection.execute('PRAGMA quick_check').fetchall()!=[('ok',)] or connection.execute('PRAGMA foreign_key_check').fetchall():
            raise ValueError('Database integrity check failed; retain data and inspect backups.')
        revision=connection.execute('SELECT revision FROM board_meta WHERE id=1').fetchone()[0]
        count=connection.execute('SELECT count(*) FROM cards').fetchone()[0]
        return f'Database schema={schema}, revision={revision}, current cards={count}; integrity OK.'


def inspect_database(data,running):
    database=data/'board.sqlite3'
    if not database.is_file() or database.is_symlink():raise ValueError('Database is missing or a symbolic link; do not create a replacement to troubleshoot.')
    if running:
        # The caller mounts the source volume :ro. Never use immutable=1 here:
        # it would ignore a live WAL and could report an obsolete revision.
        return database_details(database)
    lock=data/'board.sqlite3.lock'
    if not lock.is_file() or lock.is_symlink():raise ValueError('Stopped database has no valid application lock; read-only inspection skipped.')
    with lock.open('rb') as stream:
        try:fcntl.flock(stream,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise ValueError('Database is held by an active application; retry after it stops.') from None
        # A stopped WAL database may have no SHM. Inspect a private temporary copy
        # so SQLite can create sidecars without writing to the original volume.
        with tempfile.TemporaryDirectory(prefix='worklog-doctor-') as temporary:
            for suffix in ('','-wal'):
                source=Path(str(database)+suffix)
                if source.is_symlink():raise ValueError('Database sidecars must not be symbolic links.')
                if source.exists():shutil.copyfile(source,Path(temporary)/source.name)
            return database_details(Path(temporary)/database.name)


def diagnose(root,project,data,*,running,image_sites,container_state=None):
    reports=[];root=Path(root).resolve();data=Path(data)
    def report(level,text):reports.append((level,text))
    def inside(relative):
        path=root/relative
        if not path.resolve().is_relative_to(root):raise ValueError('Path leaves the repository.')
        return path
    try:
        if not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,50}',project):raise ValueError('Invalid project.')
        snapshot=json.loads(inside('.tmp/docker-state/'+project+'/compose.json').read_text())
        saved=snapshot.get('x-worklog')
        if saved is None and set(snapshot.get('services',{}))=={'board','jira','mattermost'}:
            sites=json.loads(inside('config/dummy.json').read_text())
        elif saved and saved['format']==1 and saved['project']==project:sites=saved['sites']
        else:raise ValueError('Invalid deployment snapshot.')
        if sites['mode'] not in ('dummy','production') or any(not isinstance(sites[key],str) for key in ('boardOrigin','jiraBaseUrl','mattermostBaseUrl')):raise ValueError('Invalid sites.')
        report('OK','Saved deployment configuration is readable ('+sites['mode']+').')
    except (OSError,ValueError,KeyError,TypeError,AttributeError):
        report('FAIL','Deployment snapshot is missing or invalid; check the project name and last successful start.')
        return reports
    if image_sites==sites:report('OK','Runtime image sites match the saved deployment.')
    else:report('FAIL','Runtime image sites unavailable or different; run update --local with the intended --config.')
    if container_state and (container_state.get('oomKilled') or container_state.get('status') not in ('running','exited','removed') or (not running and container_state.get('exitCode',0) not in (0,143))):
        report('FAIL','Board container exited abnormally or is not ready; inspect logs before starting it again.')
    if running:
        healthy=check_health(sites['boardOrigin'])
        report('OK' if healthy else 'FAIL','Board loopback health with configured Host '+('passed.' if healthy else 'failed; check status/logs and configuration.'))
    else:report('INFO','Board is stopped/removed; HTTP health skipped. Use start when ready.')
    try:report('OK',inspect_database(data,running))
    except ValueError as error:report('FAIL',str(error))
    except (OSError,sqlite3.Error,TypeError):report('FAIL','Database could not be checked read-only; stop and retry doctor, or inspect backups. No database was modified.')
    try:
        directory=inside('dist/extension-docker' if project=='worklog-kanban' else 'dist/extensions/'+project)
        if any(not (directory/name).is_file() or (directory/name).is_symlink() for name in ('manifest.json','worker.js','bridge.js','options.html','options.js','options.css')):raise ValueError()
        json.loads((directory/'manifest.json').read_text())
        report('OK','Exported extension files are present; browser installation and SSO require browser verification.')
    except (OSError,ValueError):report('FAIL','Exported extension is incomplete; run start to export it again.')
    return reports


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--project',required=True);parser.add_argument('--root',type=Path,default=Path('/workspace'));parser.add_argument('--data',type=Path,default=Path('/data'));parser.add_argument('--running',choices=['true','false'],default='false');parser.add_argument('--image-sites',default='null');parser.add_argument('--container-state',default='{}')
    args=parser.parse_args()
    try:sites=json.loads(args.image_sites)
    except ValueError:sites=None
    reports=diagnose(args.root,args.project,args.data,running=args.running=='true',image_sites=sites,container_state=json.loads(args.container_state))
    for level,message in reports:print(f'[{level}] {message}')
    print('No company services were contacted. No deployment or source data was changed.')
    raise SystemExit(1 if any(level=='FAIL' for level,_ in reports) else 0)


if __name__=='__main__':main()

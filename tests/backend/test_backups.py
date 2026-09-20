import fcntl
import hashlib
import json
from pathlib import Path
import shutil
import sqlite3
import os

import pytest

from app.config import SiteConfig
from app.store import Store
from app.schemas import CreateCard
from docker.deployment import prepare,promote

ROOT=Path(__file__).resolve().parents[2]

@pytest.fixture
def environment(tmp_path):
    root=tmp_path/'repo';(root/'config').mkdir(parents=True)
    shutil.copy2(ROOT/'config/dummy.json',root/'config/dummy.json')
    prepare(root,'fixture');promote(root,'fixture')
    data=tmp_path/'data';data.mkdir()
    store=Store(data/'board.sqlite3',SiteConfig.model_validate_json((root/'config/dummy.json').read_text()));store.initialize()
    store.create_card(CreateCard(title='original',columnId=store.snapshot().columns[0].id),'127.0.0.1')
    return root,data,store

def test_online_backup_captures_committed_wal_and_is_self_contained(environment):
    from docker.backup import create_backup,inspect_database
    root,data,store=environment
    with sqlite3.connect(store.path) as writer:
        writer.execute('PRAGMA wal_autocheckpoint=0');writer.execute("UPDATE cards SET notes='committed WAL'");writer.commit()
        assert Path(str(store.path)+'-wal').stat().st_size>0
        identifier=create_backup(root,'fixture',data,image='sha256:fixture')
        directory=root/'backups/fixture'/identifier
        manifest=json.loads((directory/'manifest.json').read_text())
        assert manifest['sha256']==hashlib.sha256((directory/'board.sqlite3').read_bytes()).hexdigest()
        assert manifest['schema']==3 and manifest['revision']==1 and manifest['project']=='fixture'
        with sqlite3.connect(directory/'board.sqlite3') as copy:assert copy.execute('SELECT notes FROM cards').fetchone()[0]=='committed WAL'
        assert inspect_database(directory/'board.sqlite3')['schema']==3

def test_restore_uses_staged_copy_preserves_previous_data_and_clears_old_wal(environment):
    from docker.backup import create_backup,stage_restore,apply_restore
    root,data,store=environment
    identifier=create_backup(root,'fixture',data)
    stage=stage_restore(root,'fixture',identifier,data)
    (root/'backups/fixture'/identifier/'board.sqlite3').write_bytes(b'changed after staging')
    with sqlite3.connect(store.path) as current:current.execute("UPDATE cards SET notes='new current data'")
    result=apply_restore(root,'fixture',data,stage)
    assert store.snapshot().cards[0].notes==''
    old=root/'backups/fixture'/result['beforeBackup']/'board.sqlite3'
    with sqlite3.connect(old) as current:assert current.execute('SELECT notes FROM cards').fetchone()[0]=='new current data'
    assert not Path(str(store.path)+'-wal').exists() or Path(str(store.path)+'-wal').stat().st_size==0

@pytest.mark.parametrize('change',['hash','project','sites','future','foreign_key'])
def test_invalid_backup_is_rejected_before_current_data_changes(environment,change):
    from docker.backup import create_backup,stage_restore
    root,data,store=environment;identifier=create_backup(root,'fixture',data)
    directory=root/'backups/fixture'/identifier;manifest=json.loads((directory/'manifest.json').read_text())
    if change=='hash':(directory/'board.sqlite3').write_bytes(b'broken')
    elif change=='project':manifest['project']='someone-else'
    elif change=='sites':manifest['sites']['boardOrigin']='https://other.example.invalid'
    else:
        with sqlite3.connect(directory/'board.sqlite3') as connection:
            if change=='future':connection.execute('PRAGMA user_version=999')
            else:connection.execute("UPDATE cards SET column_id='missing'")
        manifest['sha256']=hashlib.sha256((directory/'board.sqlite3').read_bytes()).hexdigest()
    (directory/'manifest.json').write_text(json.dumps(manifest))
    before=store.snapshot()
    with pytest.raises(ValueError):stage_restore(root,'fixture',identifier,data)
    assert store.snapshot()==before

def test_restore_refuses_running_application_and_replace_failure_preserves_current(environment,monkeypatch):
    from docker import backup
    root,data,store=environment;identifier=backup.create_backup(root,'fixture',data);stage=backup.stage_restore(root,'fixture',identifier,data)
    with Path(str(store.path)+'.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        with pytest.raises(ValueError,match='running'):backup.apply_restore(root,'fixture',data,stage)
    original=store.snapshot()
    replace=Path.replace
    def broken(path,target):
        if Path(target)==store.path:raise OSError('synthetic replace failure')
        return replace(path,target)
    monkeypatch.setattr(Path,'replace',broken)
    with pytest.raises(OSError):backup.apply_restore(root,'fixture',data,stage)
    assert store.snapshot()==original
    assert any(json.loads(path.read_text()).get('reason')=='before-restore' for path in (root/'backups/fixture').glob('*/manifest.json'))

def test_recovery_of_corrupt_current_database_retains_raw_files(environment):
    from docker.backup import create_backup,stage_restore,apply_restore
    root,data,store=environment;identifier=create_backup(root,'fixture',data);stage=stage_restore(root,'fixture',identifier,data)
    store.path.write_bytes(b'corrupt current database')
    result=apply_restore(root,'fixture',data,stage)
    directory=root/'backups/fixture'/result['beforeBackup']
    assert (directory/'board.sqlite3').read_bytes()==b'corrupt current database'
    assert json.loads((directory/'manifest.json').read_text())['restorable'] is False
    assert store.snapshot().cards[0].title=='original'

def test_backup_paths_cannot_escape_and_missing_database_is_not_created(environment):
    from docker.backup import create_backup,stage_restore
    root,data,_=environment
    with pytest.raises(ValueError):stage_restore(root,'fixture','../escape',data)
    with pytest.raises(ValueError):create_backup(root,'fixture',data/'missing')
    assert not (data/'missing').exists()

@pytest.mark.skipif(os.getuid()!=0,reason='Ownership boundary needs the root maintenance container')
def test_restore_creates_a_lock_owned_by_the_application(environment):
    from docker.backup import create_backup,stage_restore,apply_restore
    root,data,store=environment;identifier=create_backup(root,'fixture',data);stage=stage_restore(root,'fixture',identifier,data)
    os.chown(store.path,10001,10001);os.chown(data,10001,10001)
    apply_restore(root,'fixture',data,stage)
    assert (data/'board.sqlite3.lock').stat().st_uid==10001
    assert store.path.stat().st_uid==10001

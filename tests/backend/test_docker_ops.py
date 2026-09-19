import json
import os
from pathlib import Path
import subprocess

import pytest

ROOT=Path(__file__).resolve().parents[2]


def git(root,*args,check=True):
    return subprocess.run(['git','-c','user.name=Fixture','-c','user.email=fixture@example.invalid',*args],cwd=root,text=True,capture_output=True,check=check)


@pytest.fixture
def upstream(tmp_path):
    remote=tmp_path/'remote';remote.mkdir();git(remote,'init','--bare','--initial-branch=main')
    seed=tmp_path/'seed';git(tmp_path,'clone',str(remote),str(seed))
    (seed/'source.txt').write_text('one');git(seed,'add','source.txt');git(seed,'commit','-m','one');git(seed,'push','-u','origin','main')
    checkout=tmp_path/'checkout';git(tmp_path,'clone',str(remote),str(checkout))
    (seed/'source.txt').write_text('two');git(seed,'commit','-am','two');git(seed,'push')
    return checkout,seed


def update(checkout):
    return subprocess.run(['bash',str(ROOT/'docker/update-source.sh')],cwd=checkout,text=True,capture_output=True)


def test_update_fast_forwards_and_never_overwrites_local_changes(upstream):
    checkout,_=upstream
    (checkout/'source.txt').write_text('local draft')
    result=update(checkout);assert result.returncode!=0 and 'uncommitted' in result.stderr
    assert (checkout/'source.txt').read_text()=='local draft'
    git(checkout,'restore','source.txt');(checkout/'untracked.txt').write_text('keep me')
    assert update(checkout).returncode!=0 and (checkout/'untracked.txt').read_text()=='keep me'
    (checkout/'untracked.txt').unlink()
    assert update(checkout).returncode==0 and (checkout/'source.txt').read_text()=='two'


def test_update_refuses_diverged_or_detached_checkout(upstream):
    checkout,_=upstream
    (checkout/'source.txt').write_text('local commit');git(checkout,'commit','-am','local')
    head=git(checkout,'rev-parse','HEAD').stdout
    result=update(checkout)
    assert result.returncode!=0 and 'fast-forward' in result.stderr
    assert git(checkout,'rev-parse','HEAD').stdout==head
    git(checkout,'checkout','--detach');result=update(checkout)
    assert result.returncode!=0 and 'detached' in result.stderr.lower()


def test_update_preserves_ignored_local_files(upstream):
    checkout,seed=upstream
    (checkout/'.git/info/exclude').write_text('operator.local.json\n')
    (checkout/'operator.local.json').write_text('local-only fixture')
    (seed/'operator.local.json').write_text('upstream fixture')
    git(seed,'add','operator.local.json');git(seed,'commit','-m','new tracked path');git(seed,'push')
    head=git(checkout,'rev-parse','HEAD').stdout
    result=update(checkout)
    assert result.returncode!=0 and 'overwritten' in result.stderr
    assert git(checkout,'rev-parse','HEAD').stdout==head
    assert (checkout/'operator.local.json').read_text()=='local-only fixture'


def test_docker_entry_rejects_destructive_or_unknown_arguments_without_calling_docker(tmp_path):
    fake=tmp_path/'docker';record=tmp_path/'calls'
    fake.write_text('#!/bin/sh\nprintf called >> "$DOCKER_CALL_RECORD"\nexit 99\n');fake.chmod(0o755)
    env={**os.environ,'PATH':str(tmp_path)+os.pathsep+os.environ['PATH'],'DOCKER_CALL_RECORD':str(record)}
    for args in [('remove','--purge-data'),('remove','--yes'),('remove','--typo'),('start','--purge-data'),('update','--typo'),('--project','../bad','remove'),('--project','missing-action')]:
        result=subprocess.run(['bash',str(ROOT/'docker.sh'),*args],env=env,text=True,capture_output=True)
        assert result.returncode==64
    assert not record.exists()
    help_result=subprocess.run(['bash',str(ROOT/'docker.sh'),'help'],env=env,text=True,capture_output=True)
    assert help_result.returncode==0 and 'start' in help_result.stdout and not record.exists()


def test_extension_export_is_atomic_and_keeps_previous_files(tmp_path):
    from docker.export_extension import export
    source=tmp_path/'source';source.mkdir()
    for name in ['worker.js','bridge.js']:(source/name).write_text('synthetic script')
    (source/'manifest.json').write_text(json.dumps({'manifest_version':3,'background':{'service_worker':'worker.js'},'content_scripts':[{'js':['bridge.js']}]}))
    target=tmp_path/'workspace/dist/extension-docker'
    export(source,target)
    assert target.stat().st_mode & 0o005 == 0o005  # Host browser can load a root-exported directory.
    (target/'operator-note.txt').write_text('preserve me')
    (source/'worker.js').write_text('new synthetic script');export(source,target)
    assert (target/'worker.js').read_text()=='new synthetic script'
    assert any((directory/'operator-note.txt').read_text()=='preserve me' for directory in target.parent.glob('extension-docker.previous-*') if (directory/'operator-note.txt').exists())
    (source/'bridge.js').unlink()
    with pytest.raises(RuntimeError):export(source,target)
    assert (target/'worker.js').read_text()=='new synthetic script'


def test_deployment_snapshot_keeps_resolved_values_literal_and_rejects_escape(tmp_path):
    from docker.save_state import save
    config={'services':{'board':{'image':'fixture:old','environment':{'LITERAL':'$VALUE'}}},'volumes':{'board-data':{'name':'fixture_board-data'}}}
    save(tmp_path,'fixture',config)
    target=tmp_path/'.tmp/docker-state/fixture/compose.json'
    old=target.read_text()
    assert json.loads(old)['services']['board']['environment']['LITERAL']=='$$VALUE'
    with pytest.raises(ValueError):save(tmp_path,'../outside',{})
    assert target.read_text()==old


@pytest.mark.skipif(os.getuid()!=0,reason='Container root is needed to reproduce legacy root-owned output directories')
def test_workspace_output_repair_does_not_change_user_files(tmp_path):
    from docker.as_owner import prepare_outputs
    root=tmp_path/'workspace';root.mkdir();os.chown(root,12345,12345)
    for name in ('dist','.tmp'):
        directory=root/name;directory.mkdir(mode=0o700)
        (directory/'keep.txt').write_text('operator fixture')
    prepare_outputs(root,root.stat())
    for name in ('dist','.tmp'):
        assert (root/name).stat().st_uid==12345
        assert (root/name/'keep.txt').stat().st_uid==0
        assert (root/name/'keep.txt').read_text()=='operator fixture'

import json
from pathlib import Path
import shutil

import pytest

ROOT=Path(__file__).resolve().parents[2]

@pytest.fixture
def workspace(tmp_path):
    (tmp_path/'config').mkdir()
    shutil.copy2(ROOT/'config/dummy.json',tmp_path/'config/dummy.json')
    shutil.copy2(ROOT/'config/production.example.json',tmp_path/'config/company.local.json')
    return tmp_path

def test_production_configuration_creates_only_board_and_keeps_public_origin_separate(workspace):
    from docker.deployment import prepare
    result=prepare(workspace,'worklog-prod',config='config/company.local.json',port=54173,trusted_proxies=['172.20.0.2/32'])
    assert set(result['services'])=={'board'}
    board=result['services']['board']
    assert board['ports']==['127.0.0.1:54173:4173']
    assert board['command'][-2:]==['--trusted-proxy','172.20.0.2/32']
    assert result['x-worklog']['sites']['boardOrigin']=='https://board.example.invalid'
    assert result['x-worklog']['mode']=='production'

def test_saved_configuration_is_used_until_explicitly_changed(workspace):
    from docker.deployment import prepare,promote
    before=prepare(workspace,'prod',config='config/company.local.json',port=54173)
    promote(workspace,'prod')
    (workspace/'config/company.local.json').write_text('broken input')
    assert prepare(workspace,'prod')==before
    with pytest.raises(ValueError):prepare(workspace,'prod',config='config/company.local.json')
    saved=json.loads((workspace/'.tmp/docker-state/prod/compose.json').read_text())
    assert saved==before

def test_dummy_default_and_legacy_state_are_compatible(workspace):
    from docker.deployment import prepare,load_settings
    result=prepare(workspace,'worklog-kanban')
    assert set(result['services'])=={'board','jira','mattermost'}
    path=workspace/'.tmp/docker-state/worklog-kanban/compose.json';path.write_text(json.dumps({'services':result['services'],'volumes':result['volumes']}))
    assert load_settings(workspace,'worklog-kanban')['mode']=='dummy'
    with pytest.raises(ValueError,match='project'):prepare(workspace,'worklog-kanban',config='config/company.local.json')

@pytest.mark.parametrize('changes',[{'port':0},{'port':65536},{'trusted_proxies':['0.0.0.0/0']},{'trusted_proxies':['not-a-network']},{'config':'../escape.json'}])
def test_invalid_deployment_options_are_rejected(workspace,changes):
    from docker.deployment import prepare
    with pytest.raises(ValueError):prepare(workspace,'prod',**{'config':'config/company.local.json',**changes})

def test_configuration_paths_and_projects_cannot_escape_workspace(workspace):
    from docker.deployment import prepare
    with pytest.raises(ValueError):prepare(workspace,'../escape')
    outside=workspace.parent/'external.json';outside.write_text((workspace/'config/company.local.json').read_text())
    (workspace/'config/link.json').symlink_to(outside)
    with pytest.raises(ValueError):prepare(workspace,'prod',config='config/link.json')

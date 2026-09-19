import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config import SiteConfig
from app.resource_links import parse_resource

DATA = json.loads(Path('tests/fixtures/resource-links.json').read_text())
CONFIGS = json.loads(Path('tests/fixtures/site-config.json').read_text())


@pytest.mark.parametrize('case', CONFIGS['cases'])
def test_shared_config_corpus(case):
    if case['expected'] is None:
        with pytest.raises(ValidationError):
            SiteConfig.model_validate(case['input'])
    else:
        assert SiteConfig.model_validate(case['input']).model_dump() == case['expected']


def test_context_urls():
    config = SiteConfig.model_validate(CONFIGS['cases'][0]['input'])
    assert parse_resource('jira', 'https://JIRA.EXAMPLE:443/team/jira/browse/demo-1', config)['url'] == 'https://jira.example/team/jira/browse/DEMO-1'
    assert parse_resource('mattermost', 'https://chat.example/chat/demo/pl/' + 'a' * 26, config)['team'] == 'demo'


@pytest.mark.parametrize('case', DATA['cases'])
def test_shared_link_corpus(case):
    config = SiteConfig.model_validate(DATA['config'])
    if case['expected'] is None:
        with pytest.raises(ValueError):
            parse_resource(case['kind'], case['input'], config)
    else:
        assert parse_resource(case['kind'], case['input'], config) == case['expected']


@pytest.mark.parametrize('field,value', [
    ('boardOrigin','http://board.localhost:4173/path'),
    ('jiraBaseUrl','http://name:secret@jira.localhost:4180/jira'),
    ('jiraBaseUrl','http://jira.localhost:4180/jira/../jira'),
    ('mattermostBaseUrl','http://board.localhost:4181'),
    ('jiraBaseUrl','http://jira.localhost:4180/jira?token=secret'),
])
def test_configuration_rejects_ambiguous_or_unisolated_sources(field, value):
    with pytest.raises(ValidationError):
        SiteConfig.model_validate({**DATA['config'], field:value})


def test_shared_payloads_are_strict_and_exclude_private_fields():
    from app.schemas import CreateCard, EditCard, MoveCard, ReorderColumns
    valid = {'title': '共享标题', 'columnId': 'column_1'}
    assert CreateCard.model_validate(valid).notes == ''
    for extra in ('preview', 'cookie', 'jiraSummary', 'author', 'avatar'):
        with pytest.raises(ValidationError):
            CreateCard.model_validate({**valid, extra: 'synthetic'})
    for version in (True, '1', 0):
        with pytest.raises(ValidationError):
            EditCard.model_validate({'expectedVersion': version, 'notes': 'draft'})
    patch = EditCard.model_validate({'expectedVersion': 1, 'notes': ''})
    assert patch.model_fields_set == {'expectedVersion', 'notes'}
    with pytest.raises(ValidationError):
        EditCard.model_validate({'expectedVersion': 1, 'title': None})
    with pytest.raises(ValidationError):
        MoveCard.model_validate({'targetColumnId':'a','index':-1,'expectedBoardRevision':0})
    with pytest.raises(ValidationError):
        ReorderColumns.model_validate({'columnIds':['a','a'],'expectedBoardRevision':0})

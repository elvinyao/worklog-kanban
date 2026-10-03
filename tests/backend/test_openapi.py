import json
from pathlib import Path
import subprocess

from app.config import SiteConfig
from app.main import create_app

CONFIG=SiteConfig.model_validate_json(Path('config/dummy.json').read_text())


def test_export_uses_real_routes_without_initializing_database(tmp_path):
    database=tmp_path/'not-created'/'board.sqlite3'
    schema=create_app(config=CONFIG,database=database).openapi()
    assert not database.parent.exists()
    assert set(schema['paths'])=={'/api/board','/api/events','/api/cards','/api/cards/{card_id}','/api/cards/{card_id}/move','/api/cards/{card_id}/archive','/api/columns','/api/columns/{column_id}','/api/columns/reorder','/api/archives','/api/archives/{archive_id}','/api/archives/{archive_id}/restore'}
    properties=schema['components']['schemas']['CreateCard']['properties']
    assert set(properties)=={'requestId','title','columnId','notes','jiraLinks'}
    assert not {'JiraPreview','MattermostPreview'} & set(schema['components']['schemas'])
    assert schema['components']['schemas']['CreateCard']['additionalProperties'] is False
    for model in ['CreateArchive','RestoreArchive','EditArchive','ArchiveDetail']:
        assert schema['components']['schemas'][model]['additionalProperties'] is False


def test_generation_detects_drift_without_overwriting(tmp_path):
    generated=subprocess.run(['node','scripts/generate-api.mjs','--output-root',str(tmp_path)],capture_output=True,text=True)
    assert generated.returncode==0,generated.stderr
    file=tmp_path/'src/generated/shared-api.d.ts'
    changed=file.read_text()+'\n// deliberate synthetic drift\n'
    file.write_text(changed)
    check=subprocess.run(['node','scripts/generate-api.mjs','--output-root',str(tmp_path),'--check'],capture_output=True,text=True)
    assert check.returncode!=0
    assert file.read_text()==changed

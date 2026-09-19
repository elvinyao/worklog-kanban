"""Check server dependency and shared-schema boundaries without network calls."""
import ast
import json
from pathlib import Path

for path in Path('app').glob('*.py'):
    tree=ast.parse(path.read_text())
    for node in ast.walk(tree):
        modules=[value.name for value in node.names] if isinstance(node,ast.Import) else [node.module or ''] if isinstance(node,ast.ImportFrom) else []
        for module in modules:
            if any(module==blocked or module.startswith(blocked+'.') for blocked in ('httpx','requests','aiohttp','urllib.request','dummy')):
                raise SystemExit(f'Forbidden server dependency: {path.name}')
schema=json.loads(Path('contracts/shared-api.openapi.json').read_text())
for model in schema['components']['schemas'].values():
    if set(model.get('properties',{})) & {'preview','cookie','token','avatar','comment','jiraSummary'}:
        raise SystemExit('Personal field in shared API schema')
print('Server/shared-schema boundaries passed.')

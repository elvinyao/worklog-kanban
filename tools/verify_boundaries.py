"""Check server dependency, shared-schema, and runtime/image pin boundaries."""
import ast
import json
from pathlib import Path


def check_runtime_pins(root: Path = Path('.')) -> None:
    py_ver = (root / '.python-version').read_text().strip()
    node_ver = (root / '.nvmrc').read_text().strip()
    pkg = json.loads((root / 'package.json').read_text())
    if pkg.get('engines', {}).get('node') != node_ver:
        raise SystemExit('Runtime/image pin mismatch: package.json engines.node')
    if f'>={".".join(py_ver.split(".")[:2])}' not in (root / 'pyproject.toml').read_text():
        raise SystemExit('Runtime/image pin mismatch: pyproject.toml requires-python')
    run_sh = (root / '.agent/run.sh').read_text()
    for expected in (f'PYTHON_IMAGE="python:{py_ver}-bookworm"', f'NODE_IMAGE="node:{node_ver}-bookworm"', f'DEV_IMAGE="worklog-kanban-dev:python{py_ver}-node{node_ver}"'):
        if expected not in run_sh:
            raise SystemExit('Runtime/image pin mismatch: .agent/run.sh')
    dev_df = (root / '.agent/Dockerfile').read_text()
    for expected in (f'ARG PYTHON_IMAGE=python:{py_ver}-bookworm', f'ARG NODE_IMAGE=node:{node_ver}-bookworm'):
        if expected not in dev_df:
            raise SystemExit('Runtime/image pin mismatch: .agent/Dockerfile')
    locks = dict(line.split('=', 1) for line in (root / '.agent/images.lock').read_text().splitlines() if '=' in line)
    for rel in ('Dockerfile', 'docker/legacy.Dockerfile', 'deploy/fake/compose.yaml'):
        content = (root / rel).read_text()
        if locks.get('PYTHON_IMAGE') not in content or locks.get('NODE_IMAGE') not in content:
            raise SystemExit(f'Runtime/image pin mismatch: {rel}')


def main() -> None:
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
    check_runtime_pins()
    print('Server/shared-schema boundaries passed.')


if __name__ == '__main__':
    main()

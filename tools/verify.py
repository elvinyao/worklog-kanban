"""Smoke-check installed tools without pretending that the app is implemented."""

import importlib.metadata
import json
import sqlite3
import sys

import fastapi
import fastapi.sse
import pydantic
import uvicorn


def main() -> None:
    versions = {
        name: importlib.metadata.version(name)
        for name in ('fastapi', 'uvicorn', 'pydantic', 'pytest', 'httpx', 'pip-tools')
    }
    versions['python'] = sys.version.split()[0]
    versions['sqlite'] = sqlite3.sqlite_version
    with sqlite3.connect(':memory:') as database:
        assert database.execute('select 1').fetchone() == (1,)
    print(json.dumps(versions, indent=2))


if __name__ == '__main__':
    main()

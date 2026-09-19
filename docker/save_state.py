"""Atomically retain the last healthy Compose configuration for recovery."""
import json
import os
from pathlib import Path
import re
import sys
import tempfile


def escape(value):
    # Resolved values must remain literal when Compose loads the snapshot again.
    if isinstance(value,str):return value.replace('$','$$')
    if isinstance(value,list):return [escape(item) for item in value]
    if isinstance(value,dict):return {key:escape(item) for key,item in value.items()}
    return value


def save(root,project,config):
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,50}',project):raise ValueError('Invalid project')
    target=root/'.tmp/docker-state'/project/'compose.json'
    if not target.resolve().is_relative_to(root.resolve()):raise ValueError('State path leaves workspace')
    target.parent.mkdir(parents=True,exist_ok=True)
    name=None
    try:
        with tempfile.NamedTemporaryFile(mode='w',dir=target.parent,delete=False) as stream:
            name=Path(stream.name)
            json.dump(escape(config),stream)
            stream.flush();os.fsync(stream.fileno())
        name.replace(target)
    finally:
        if name is not None:name.unlink(missing_ok=True)


if __name__=='__main__':save(Path('/workspace'),sys.argv[1],json.load(sys.stdin))

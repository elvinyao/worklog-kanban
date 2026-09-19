"""Copy an explicit runtime allowlist into an already built staging directory."""
import argparse
from pathlib import Path
import shutil

from app.config import SiteConfig


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--directory',required=True,type=Path)
    parser.add_argument('--config',required=True,type=Path)
    args=parser.parse_args()
    config=SiteConfig.model_validate_json(args.config.read_text())
    if config.mode!='production':raise SystemExit('Production configuration required')
    root=args.directory
    if not (root/'web/index.html').is_file() or not (root/'extension/manifest.json').is_file():raise SystemExit('Build the production assets first')
    (root/'app').mkdir()
    for source in Path('app').iterdir():
        if source.is_file() and source.suffix in ('.py','.sql'):shutil.copy2(source,root/'app'/source.name)
    (root/'requirements').mkdir()
    shutil.copy2('requirements/runtime.txt',root/'requirements/runtime.txt')
    (root/'site-config.json').write_text(config.model_dump_json(indent=2)+'\n')
    (root/'run.py').write_text('''from pathlib import Path
import sys

# Explicitly load this release even with Python -I and an unrelated working directory.
sys.path.insert(0,str(Path(__file__).resolve().parent))
from app.cli import main

if __name__ == '__main__':
    main()
''')


if __name__=='__main__':
    main()

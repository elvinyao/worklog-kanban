"""Offline export: app factory construction does not run the lifespan."""
import argparse
import json
from pathlib import Path

from app.config import SiteConfig
from app.main import create_app


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',required=True)
    args=parser.parse_args()
    config=SiteConfig.model_validate_json(Path('config/dummy.json').read_text())
    schema=create_app(config=config).openapi()
    Path(args.output).write_text(json.dumps(schema,ensure_ascii=False,sort_keys=True,indent=2)+'\n')


if __name__=='__main__':
    main()

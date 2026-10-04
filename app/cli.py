"""Standalone production entry point; never discovers a dummy configuration."""
import argparse
from html.parser import HTMLParser
from pathlib import Path
import sys
from urllib.parse import urlsplit

import uvicorn

from app.config import SiteConfig
from app.main import create_app


class EntryAssets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.references=[]

    def handle_starttag(self,tag,attributes):
        values=dict(attributes)
        key='src' if tag=='script' else 'href' if tag=='link' else None
        if key and values.get(key):self.references.append(values[key])


def production_app(config_file:Path, database:Path, *, bundle:Path|None=None, trusted_proxies=()):
    root=(bundle or Path(__file__).resolve().parent.parent).resolve()
    web=root/'web'
    try:
        parser=EntryAssets();parser.feed((web/'index.html').read_text())
        if not parser.references:raise ValueError('No entry assets')
        for reference in parser.references:
            url=urlsplit(reference);asset=(web/url.path.lstrip('/')).resolve()
            if url.scheme or url.netloc or not asset.is_relative_to(web) or not asset.is_file():raise ValueError('Missing entry asset')
    except (OSError,ValueError):
        raise RuntimeError('Production assets are missing or invalid; rebuild the package') from None
    try:
        config=SiteConfig.model_validate_json(config_file.read_text())
        built=SiteConfig.model_validate_json((root/'site-config.json').read_text())
    except Exception:
        raise RuntimeError('Invalid or missing production configuration') from None
    if config.mode!='production' or built.mode!='production':
        raise RuntimeError('Production configuration must use production mode')
    if config!=built:
        raise RuntimeError('Configuration differs from the built frontend and extension; rebuild the package')
    if database.expanduser().resolve().is_relative_to(root):
        raise RuntimeError('The database must be outside the production release directory')
    return create_app(config=config,database=database,trusted_proxies=trusted_proxies,static_dir=web)


def main():
    if sys.argv[1:2] == ['maintenance']:
        from app.maintenance import main as maintenance
        maintenance(sys.argv[2:])
        return
    parser=argparse.ArgumentParser(description='Worklog: one Python process for the shared board')
    parser.add_argument('--config',type=Path,required=True)
    parser.add_argument('--database',type=Path,default=Path('data/board.sqlite3'),help='Persistent file outside the release directory')
    parser.add_argument('--host',default='0.0.0.0',help='Bind address; repository runner publishes loopback only')
    parser.add_argument('--port',type=int,default=4173)
    parser.add_argument('--trusted-proxy',action='append',default=[],help='Explicit trusted proxy IP/CIDR; repeat when necessary')
    args=parser.parse_args()
    if not 1<=args.port<=65535:parser.error('Port must be between 1 and 65535')
    try:
        app=production_app(args.config,args.database,trusted_proxies=args.trusted_proxy)
    except (RuntimeError,ValueError):
        print('Production startup rejected: check configuration, matching build, static assets, database outside the release, proxy CIDRs and single-worker settings.',file=sys.stderr)
        raise SystemExit(2) from None
    uvicorn.run(app,host=args.host,port=args.port,workers=1,access_log=False,proxy_headers=False,log_level='warning',timeout_graceful_shutdown=5)


if __name__=='__main__':
    main()

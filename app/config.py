import re
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, field_validator, model_validator


def canonical_base(value: str, *, origin_only: bool = False) -> str:
    # Check raw spelling before parsers erase traversal and control characters.
    if not re.fullmatch(r'[\x21-\x7e]+', value) or re.search(r'[\\%?#@]', value):
        raise ValueError('Invalid site URL')
    parts = urlsplit(value)
    if parts.scheme not in ('http', 'https') or not parts.hostname:
        raise ValueError('Invalid site URL')
    host = parts.hostname.lower()
    if not re.fullmatch(r'[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?', host):
        raise ValueError('Invalid hostname')
    if re.fullmatch(r'[0-9.]+', host):
        if not re.fullmatch(r'(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){3}', host) or any(int(p) > 255 for p in host.split('.')):
            raise ValueError('Invalid address')
    elif not re.search(r'[a-z]', host.split('.')[-1]) or re.fullmatch(r'0x[0-9a-f]+', host.split('.')[-1]):
        raise ValueError('Invalid hostname')
    port = parts.port
    if port == 0 or parts.netloc.endswith(':'):
        raise ValueError('Invalid port')
    path = parts.path
    if not re.fullmatch(r'(?:/[A-Za-z0-9_-]+)*/?', path):
        raise ValueError('Invalid context path')
    if origin_only and path not in ('', '/'):
        raise ValueError('Expected origin')
    suffix = '' if port is None or port == (80 if parts.scheme == 'http' else 443) else f':{port}'
    return f'{parts.scheme}://{host}{suffix}{path.rstrip("/")}'


class SiteConfig(BaseModel):
    model_config = ConfigDict(strict=True, extra='forbid')
    mode: Literal['dummy', 'production']
    boardOrigin: str
    jiraBaseUrl: str
    mattermostBaseUrl: str

    @field_validator('boardOrigin')
    @classmethod
    def board_origin(cls, value: str) -> str:
        return canonical_base(value, origin_only=True)

    @field_validator('jiraBaseUrl', 'mattermostBaseUrl')
    @classmethod
    def external_base(cls, value: str) -> str:
        return canonical_base(value)

    @model_validator(mode='after')
    def isolated_dummy_hosts(self):
        if self.mode == 'dummy' and len({urlsplit(v).hostname for v in (self.boardOrigin, self.jiraBaseUrl, self.mattermostBaseUrl)}) != 3:
            raise ValueError('Dummy services require distinct hostnames')
        return self

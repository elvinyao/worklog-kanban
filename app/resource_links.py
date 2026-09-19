import re

from app.config import SiteConfig, canonical_base

JIRA_KEY = re.compile(r'[A-Z][A-Z0-9_]*-[1-9][0-9]*', re.ASCII)


def parse_resource(kind: str, value: str, config: SiteConfig) -> dict[str, str]:
    if not isinstance(value, str) or len(value) > 2048:
        raise ValueError('Invalid resource')
    if kind == 'jira':
        key = value.upper()
        if not JIRA_KEY.fullmatch(key):
            canonical = canonical_base(value)
            prefix = config.jiraBaseUrl + '/browse/'
            if not canonical.startswith(prefix):
                raise ValueError('Wrong Jira site or path')
            key = canonical[len(prefix):].upper()
        if len(key) > 200 or not JIRA_KEY.fullmatch(key):
            raise ValueError('Invalid issue key')
        return {'kind': 'jira', 'id': key, 'url': config.jiraBaseUrl + '/browse/' + key}
    if kind == 'mattermost':
        canonical = canonical_base(value)
        prefix = config.mattermostBaseUrl + '/'
        if not canonical.startswith(prefix):
            raise ValueError('Wrong Mattermost site')
        match = re.fullmatch(r'([a-z0-9_-]+)/pl/([a-z0-9]{26})', canonical[len(prefix):])
        if match and len(match[1]) <= 64:
            return {'kind': 'mattermost', 'id': match[2], 'team': match[1], 'url': canonical}
    raise ValueError('Invalid resource')

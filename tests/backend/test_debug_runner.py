"""Runner network boundaries, without using a real proxy or Docker daemon."""
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]


def invoke(tmp_path, entry, extra):
    docker = tmp_path / 'docker'
    record = tmp_path / 'calls.jsonl'
    docker.write_text('#!' + sys.executable + '\n' + '''import json, os, sys
with open(os.environ['CALLS'], 'a') as f:
    f.write(json.dumps(sys.argv[1:]) + '\\n')
''')
    docker.chmod(0o755)
    env = {key: value for key, value in os.environ.items()
           if key.lower() not in {'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy'}
           and key not in {'WORKLOG_DEBUG_NETWORK', 'WORKLOG_CA_CERT'}}
    env.update(PATH=str(tmp_path) + ':' + env['PATH'], CALLS=str(record))
    env.update(extra)
    result = subprocess.run(['bash', str(ROOT / '.agent' / entry), 'python', '--version'],
                            env=env, capture_output=True, text=True)
    calls = [json.loads(line) for line in record.read_text().splitlines()]
    return result, calls


def test_direct_runner_does_not_inherit_host_proxy(tmp_path):
    result, calls = invoke(tmp_path, 'run.sh', {
        'HTTP_PROXY': 'http://host.example:8080', 'HTTPS_PROXY': 'http://host.example:8080',
        'ALL_PROXY': 'socks5://host.example:1080'})
    assert result.returncode == 0, result.stderr
    build = next(call for call in calls if call[0] == 'build')
    run = next(call for call in calls if call[0] == 'run')
    for name in ('HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'all_proxy'):
        assert name + '=' in build and name + '=' in run
    assert not any('host.example' in value for value in build + run)
    assert '/workspace' in run and '--rm' in run and '--init' in run


def test_proxy_runner_passes_both_cases_bypass_and_readonly_ca(tmp_path):
    ca = tmp_path / 'host ca.crt'
    ca.write_text('synthetic certificate fixture')
    result, calls = invoke(tmp_path, 'run-proxy.sh', {
        'HTTP_PROXY': 'http://127.0.0.1:7890', 'https_proxy': 'http://localhost:7891',
        'no_proxy': '.internal.example', 'WORKLOG_CA_CERT': str(ca)})
    assert result.returncode == 0, result.stderr
    build = next(call for call in calls if call[0] == 'build')
    run = next(call for call in calls if call[0] == 'run')
    for args in (build, run):
        assert 'HTTP_PROXY=http://host.docker.internal:7890' in args
        assert 'http_proxy=http://host.docker.internal:7890' in args
        assert 'HTTPS_PROXY=http://host.docker.internal:7891' in args
        assert 'https_proxy=http://host.docker.internal:7891' in args
        assert 'host.docker.internal:host-gateway' in args
        bypass = next(value for value in args if value.startswith('NO_PROXY='))
        assert '.internal.example' in bypass and 'jira.localhost' in bypass
    assert 'id=host_ca,src=' + str(ca) in build
    assert str(ca) + ':/run/worklog-host-ca.crt:ro' in run


def test_proxy_requires_ca_before_build_or_run(tmp_path):
    result, calls = invoke(tmp_path, 'run-proxy.sh', {'HTTP_PROXY': 'http://localhost:7890'})
    assert result.returncode != 0 and 'WORKLOG_CA_CERT' in result.stderr
    assert not any(call[0] in {'build', 'run'} for call in calls)

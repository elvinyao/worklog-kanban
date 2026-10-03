from pathlib import Path
import subprocess

import pytest


ROOT = Path(__file__).resolve().parents[2]


def build(*arguments):
    return subprocess.run(['node', 'scripts/build.mjs', *arguments], cwd=ROOT, capture_output=True, text=True)


@pytest.mark.parametrize('arguments,message', [
    (['--output'], 'requires a path'),
    (['--production', '--config'], 'requires a path'),
    (['--production', '--config', '--output'], 'requires a path'),
    (['--output', '/tmp/unused-release'], 'require --production'),
    (['--config', 'config/dummy.json'], 'require --production'),
    (['--production', '--probe'], 'cannot include'),
    (['--production', 'lifecycle-test'], 'cannot include'),
    (['--production', '--mode', 'lifecycle-test'], 'cannot include'),
    (['--mode'], 'requires dummy or lifecycle-test'),
    (['--mode', 'unknown'], 'requires dummy or lifecycle-test'),
    (['--production', '--production'], 'Duplicate build argument'),
    (['--outpt', '/tmp/unused-release'], 'Unknown build argument'),
])
def test_invalid_build_arguments_are_rejected_before_building(arguments, message):
    result = build(*arguments)
    assert result.returncode != 0 and message in result.stderr


@pytest.mark.parametrize('destination', ['.', '..', 'src', 'src/web', 'dist', '.tmp'])
def test_output_cannot_replace_source_or_output_roots(destination):
    result = build('--production', '--config', 'config/production.example.json', '--output', destination)
    assert result.returncode != 0 and 'Production output' in result.stderr


def test_unrelated_existing_output_directory_is_preserved(tmp_path):
    output = tmp_path / 'release'
    output.mkdir()
    original = output / 'operator-note.txt'
    original.write_text('Keep this unrelated directory')
    result = build('--production', '--config', 'config/production.example.json', '--output', str(output))
    assert result.returncode != 0 and 'not a release directory' in result.stderr
    assert original.read_text() == 'Keep this unrelated directory'
    assert list(tmp_path.iterdir()) == [output]


def test_output_cannot_use_symlink_parent_to_replace_source(tmp_path):
    alias = tmp_path / 'source-alias'
    alias.symlink_to(ROOT, target_is_directory=True)
    result = build('--production', '--config', 'config/production.example.json', '--output', str(alias / 'app'))
    assert result.returncode != 0 and 'Production output' in result.stderr
    assert alias.is_symlink()

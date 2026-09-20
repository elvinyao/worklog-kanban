"""Run a workspace-writing helper as the bind-mounted checkout's owner."""
import os
from pathlib import Path
import sys


def prepare_outputs(root,owner):
    # Older development containers created these two output parents as root.
    # Repair only those directories, never recursively change user files.
    for name in ('dist','.tmp'):
        path=root/name
        if path.is_dir() and not path.is_symlink() and path.stat().st_uid==0:
            os.chown(path,owner.st_uid,owner.st_gid)
            path.chmod(path.stat().st_mode | 0o700)


if __name__=='__main__':
    root=Path('/workspace')
    owner=root.stat()
    if os.getuid()==0:
        if len(sys.argv)>2 and sys.argv[2] in ('/opt/worklog/docker/export_extension.py','/opt/worklog/docker/save_state.py','/opt/worklog/docker/deployment.py'):
            prepare_outputs(root,owner)
        os.setgroups([])
        os.setgid(owner.st_gid)
        os.setuid(owner.st_uid)
    os.environ['HOME']='/tmp'
    os.execvp(sys.argv[1],sys.argv[1:])

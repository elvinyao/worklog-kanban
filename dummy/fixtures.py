"""All content in this module is synthetic; never import it into production."""

import base64
from datetime import datetime, timedelta, timezone

PUBLIC_POST = 'a' * 26
PRIVATE_POST = 'b' * 26
LONG_POST = 'l' * 26
UNSAFE_POST = 'x' * 26
AUTHOR = 'u' * 26
PUBLIC_CHANNEL = 'c' * 26
PRIVATE_CHANNEL = 'p' * 26
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=')

ISSUES = {
    'DEMO-1': {'summary': '验证个人预览与共享工作记录', 'assignee': {'name':'demo-author','displayName':'模拟担当者'}, 'status': {'name':'In Progress'}},
    'DEMO-2': {'summary': 'ALICE_ONLY_MARKER：模拟受限票据', 'assignee': {'name':'alice','displayName':'Alice'}, 'status': {'name':'Open'}},
    'DEMO-3': {'summary': '没有评论和担当者的模拟票据', 'assignee': None, 'status': {'name':'Open'}},
}


def visible_comments(key: str, identity: str):
    if key == 'DEMO-3':
        return []
    start = datetime(2026, 9, 18, tzinfo=timezone.utc)
    result = []
    for index in range(1, 55):
        if index == 54 and identity != 'alice':
            continue
        created = (start + timedelta(minutes=index)).isoformat()
        result.append({
            'id': str(index), 'author': {'name':'demo-author','displayName':'模拟作者'},
            'body': 'ALICE_ONLY_MARKER：最新的受限模拟评论' if index == 54 else f'第 {index} 条模拟评论',
            'created': created,
            'updated': (start + timedelta(days=2)).isoformat() if index == 1 else created,
        })
    return result


POSTS = {
    PUBLIC_POST: {'message': '**模拟消息**：请在看板更新共享笔记。\n\n- 核对评论分页\n- 保留草稿', 'channel_id': PUBLIC_CHANNEL},
    PRIVATE_POST: {'message': 'ALICE_ONLY_MARKER：模拟受限频道消息', 'channel_id': PRIVATE_CHANNEL},
    LONG_POST: {'message': '这是一条需要截断的模拟长消息。' * 100, 'channel_id': PUBLIC_CHANNEL},
    UNSAFE_POST: {'message': '<script>window.__xss=1</script>\n![remote](http://untrusted.localhost:4190/pixel)\n[bad](javascript:alert(1))\n**保留安全格式**', 'channel_id': PUBLIC_CHANNEL},
}


def post_data(post_id: str):
    return {'id': post_id, 'user_id': AUTHOR, 'create_at': 1789689600000,
            'update_at': 1789689600000, 'root_id': '', **POSTS[post_id]}

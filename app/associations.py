"""Shared link relationships. Source previews never enter the database."""
import uuid

from app.errors import StoreError


def snapshot(connection):
    messages, unassigned, tickets = {}, {}, {}
    for row in connection.execute('SELECT * FROM mattermost_links ORDER BY position'):
        link = {'id':row['id'],'postId':row['post_id'],'team':row['team'],'url':row['url'],'description':row['description'],'position':row['position']}
        target, key = (messages,row['jira_link_id']) if row['jira_link_id'] else (unassigned,row['card_id'])
        target.setdefault(key,[]).append(link)
    for row in connection.execute('SELECT * FROM jira_links ORDER BY position'):
        tickets.setdefault(row['card_id'],[]).append({'id':row['id'],'key':row['jira_key'],'url':row['url'],'position':row['position'],'mattermostLinks':messages.get(row['id'],[])})
    return tickets, unassigned


def migrate_legacy(connection):
    for row in connection.execute('SELECT id,jira_key,jira_url FROM cards WHERE jira_key IS NOT NULL').fetchall():
        connection.execute('INSERT INTO jira_links VALUES (?,?,?,?,0)',(uuid.uuid4().hex,row['id'],row['jira_key'],row['jira_url']))
    connection.execute('''INSERT INTO mattermost_links (id,card_id,jira_link_id,post_id,team,url,description,position)
        SELECT m.id,m.card_id,j.id,m.post_id,m.team,m.url,m.description,m.position
        FROM legacy_mattermost_links m LEFT JOIN jira_links j ON j.card_id=m.card_id''')
    connection.execute('UPDATE cards SET jira_key=NULL,jira_url=NULL')
    connection.execute('DROP TABLE legacy_mattermost_links')


def replace(connection, card_id, jiras, unassigned, parse):
    # Validate all inputs before changing either collection; the caller owns the transaction.
    normalized = None
    if jiras is not None:
        normalized = [(parse('jira',jira.url),[(link,parse('mattermost',link.url)) for link in jira.mattermostLinks]) for jira in jiras]
        if len({jira['id'] for jira,_ in normalized}) != len(normalized):
            raise StoreError('invalid_link')
    retained = None
    if unassigned is not None:
        existing = {row['id']:row for row in connection.execute('SELECT * FROM mattermost_links WHERE card_id=? AND jira_link_id IS NULL',(card_id,))}
        if len({link.id for link in unassigned}) != len(unassigned):
            raise StoreError('invalid_link')
        retained = []
        for link in unassigned:
            old = existing.get(link.id)
            if old is None or link.url != old['url']:
                raise StoreError('invalid_link')
            retained.append((link,old))
    total = (sum(len(links) for _,links in normalized) if normalized is not None else connection.execute('SELECT COUNT(*) FROM mattermost_links WHERE card_id=? AND jira_link_id IS NOT NULL',(card_id,)).fetchone()[0])
    total += len(retained) if retained is not None else connection.execute('SELECT COUNT(*) FROM mattermost_links WHERE card_id=? AND jira_link_id IS NULL',(card_id,)).fetchone()[0]
    if total > 100:
        raise StoreError('invalid_link')
    if normalized is not None:
        connection.execute('DELETE FROM jira_links WHERE card_id=?',(card_id,))
        for position,(jira,links) in enumerate(normalized):
            jira_id = uuid.uuid4().hex
            connection.execute('INSERT INTO jira_links VALUES (?,?,?,?,?)',(jira_id,card_id,jira['id'],jira['url'],position))
            for index,(link,resource) in enumerate(links):
                connection.execute('INSERT INTO mattermost_links VALUES (?,?,?,?,?,?,?,?)',(uuid.uuid4().hex,card_id,jira_id,resource['id'],resource['team'],resource['url'],link.description,index))
    if retained is not None:
        connection.execute('DELETE FROM mattermost_links WHERE card_id=? AND jira_link_id IS NULL',(card_id,))
        for position,(link,old) in enumerate(retained):
            connection.execute('INSERT INTO mattermost_links VALUES (?,?,?,?,?,?,?,?)',(link.id,card_id,None,old['post_id'],old['team'],old['url'],link.description,position))

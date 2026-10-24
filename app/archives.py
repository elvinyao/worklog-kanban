"""Immutable shared snapshots and atomic Current transitions. No source previews."""
import base64
from datetime import datetime, timezone
import hashlib
import json
import sqlite3
import uuid

from app.errors import StoreError
from app.schemas import ArchiveDetail, ArchiveList, ArchiveSummary, ArchiveWrite, BoardSnapshot
from app.events import WriteResult


def summary(row):
    return ArchiveSummary(id=row['id'],name=row['name'],description=row['description'],createdAt=row['created_at'],sourceRevision=row['source_revision'],metadataVersion=row['metadata_version'],cardCount=row['card_count'],jiraLinkCount=row['jira_link_count'])


class Archives:
    def __init__(self,store):
        self.store=store

    @staticmethod
    def _row(connection,archive_id):
        row=connection.execute('SELECT * FROM board_archives WHERE id=?',(archive_id,)).fetchone()
        if row is None:
            raise StoreError('not_found')
        return row

    def list(self,q='',cursor=None,limit=20):
        clauses=['instr(lower(name || char(10) || description),lower(?))>0'];values=[q]
        with self.store.connection() as c:
            c.execute('BEGIN')
            total=c.execute('SELECT COUNT(*) FROM board_archives WHERE '+clauses[0],values).fetchone()[0]
            if cursor:
                try:
                    parts=json.loads(base64.urlsafe_b64decode(cursor.encode()).decode())
                    if not isinstance(parts,list) or len(parts)!=2 or not all(isinstance(p,str) and 0<len(p)<101 for p in parts):
                        raise ValueError()
                except (ValueError,UnicodeError,TypeError):
                    raise StoreError('invalid_cursor') from None
                clauses.append('(created_at,id)<(?,?)');values.extend(parts)
            rows=c.execute('SELECT id,name,description,created_at,source_revision,metadata_version,card_count,jira_link_count FROM board_archives WHERE '+' AND '.join(clauses)+' ORDER BY created_at DESC,id DESC LIMIT ?',[*values,limit+1]).fetchall()
            next_cursor=None
            if len(rows)>limit:
                last=rows[limit-1];next_cursor=base64.urlsafe_b64encode(json.dumps([last['created_at'],last['id']]).encode()).decode()
            return ArchiveList(items=[summary(row) for row in rows[:limit]],total=total,nextCursor=next_cursor)

    def detail(self,archive_id):
        with self.store.connection() as c:
            c.execute('BEGIN');row=self._row(c,archive_id)
            if row['snapshot_schema_version']!=1:
                raise StoreError('unsupported_archive_version')
            restored={r['archived_card_id']:r['restored_card_id'] for r in c.execute('SELECT * FROM archive_restorations WHERE archive_id=?',(archive_id,))}
            return ArchiveDetail(**summary(row).model_dump(),snapshot=BoardSnapshot.model_validate_json(row['snapshot_json']),restoredCards=restored)

    def location(self,card_id):
        with self.store.connection() as c:
            row=c.execute('SELECT archive_id FROM archived_cards WHERE card_id=?',(card_id,)).fetchone()
            if row is None:
                raise StoreError('not_found')
            return {'archiveId':row[0]}

    def _write(self,action,data,source,operation,archive_id=''):
        raw=data.model_dump()
        if 'cardIds' in raw:
            raw['cardIds']=sorted(raw['cardIds'])
        fingerprint=hashlib.sha256(json.dumps([action,archive_id,raw],sort_keys=True,ensure_ascii=False).encode()).hexdigest()
        request_id=getattr(data,'requestId',None)
        try:
            with self.store.connection() as c:
                c.execute('BEGIN IMMEDIATE')
                if request_id:
                    previous=c.execute('SELECT * FROM archive_operations WHERE request_id=?',(request_id,)).fetchone()
                    if previous:
                        if previous['fingerprint']!=fingerprint:
                            raise StoreError('request_conflict')
                        board=self.store._snapshot(c)
                        return WriteResult(ArchiveWrite(**json.loads(previous['result_json']),board=board),board.revision,False)
                result=operation(c)
                revision=self.store._record(c,action,result['archiveId'],source)
                if request_id:
                    c.execute('INSERT INTO archive_operations VALUES (?,?,?)',(request_id,fingerprint,json.dumps(result)))
                value=ArchiveWrite(**result,board=self.store._snapshot(c))
                c.commit()
                return WriteResult(value,revision,True)
        except sqlite3.IntegrityError:
            raise StoreError('invalid_change') from None
        except sqlite3.OperationalError as error:
            if 'locked' in str(error).lower() or 'busy' in str(error).lower():
                raise StoreError('busy') from None
            raise

    def create(self,data,source):
        def operation(c):
            self.store._revision(c,data.expectedBoardRevision)
            board=self.store._snapshot(c);selected=set(data.cardIds)
            cards=[card for card in board.cards if card.id in selected]
            if len(cards)!=len(selected):
                raise StoreError('not_found')
            completed={column.id for column in board.columns if column.isDone}
            if any(card.columnId not in completed for card in cards):
                raise StoreError('not_completed')
            archive_id=uuid.uuid4().hex
            frozen=board.model_copy(update={'cards':cards})
            c.execute('INSERT INTO board_archives VALUES (?,?,?,?,?,1,1,?,?,?)',(archive_id,data.name,data.description,datetime.now(timezone.utc).isoformat(),board.revision,len(cards),sum(len(card.jiraLinks) for card in cards),frozen.model_dump_json()))
            c.executemany('INSERT INTO archived_cards VALUES (?,?)',[(card.id,archive_id) for card in cards])
            c.executemany('DELETE FROM cards WHERE id=?',[(card.id,) for card in cards])
            self.store._arrange_cards(c,{column:self.store._ids(c,column) for column in {card.columnId for card in cards}})
            return {'archiveId':archive_id,'restoredCards':{}}
        return self._write('archive.create',data,source,operation)

    def rename(self,archive_id,data,source):
        def operation(c):
            row=self._row(c,archive_id)
            if row['metadata_version']!=data.expectedMetadataVersion:
                raise StoreError('conflict')
            name=data.name if 'name' in data.model_fields_set else row['name']
            description=data.description if 'description' in data.model_fields_set else row['description']
            c.execute('UPDATE board_archives SET name=?,description=?,metadata_version=metadata_version+1 WHERE id=?',(name,description,archive_id))
            return {'archiveId':archive_id,'restoredCards':{}}
        return self._write('archive.rename',data,source,operation,archive_id)

    def restore(self,archive_id,data,source):
        def operation(c):
            self.store._revision(c,data.expectedBoardRevision);self.store._column(c,data.targetColumnId)
            row=self._row(c,archive_id)
            if row['snapshot_schema_version']!=1:
                raise StoreError('unsupported_archive_version')
            frozen=BoardSnapshot.model_validate_json(row['snapshot_json']);selected=set(data.cardIds)
            cards=[card for card in frozen.cards if card.id in selected]
            if len(cards)!=len(selected):
                raise StoreError('not_found')
            restored={r[0] for r in c.execute('SELECT archived_card_id FROM archive_restorations WHERE archive_id=?',(archive_id,))}
            if selected & restored:
                raise StoreError('already_restored')
            position=c.execute('SELECT COUNT(*) FROM cards WHERE column_id=?',(data.targetColumnId,)).fetchone()[0]
            mapping={}
            for offset,card in enumerate(cards):
                card_id=uuid.uuid4().hex;mapping[card.id]=card_id
                c.execute('INSERT INTO cards (id,title,notes,column_id,position,version) VALUES (?,?,?,?,?,1)',(card_id,card.title,card.notes,data.targetColumnId,position+offset))
                for jira in card.jiraLinks:
                    resource=self.store._resource('jira',jira.url);jira_id=uuid.uuid4().hex
                    c.execute('INSERT INTO jira_links VALUES (?,?,?,?,?)',(jira_id,card_id,resource['id'],resource['url'],jira.position))
                    self._copy_messages(c,card_id,jira_id,jira.mattermostLinks)
                self._copy_messages(c,card_id,None,card.unassignedMattermostLinks)
                c.execute('INSERT INTO archive_restorations VALUES (?,?,?)',(archive_id,card.id,card_id))
            return {'archiveId':archive_id,'restoredCards':mapping}
        try:
            return self._write('archive.restore',data,source,operation,archive_id)
        except StoreError as error:
            if error.code=='invalid_link':
                raise StoreError('archive_links_changed') from None
            raise

    def _copy_messages(self,c,card_id,jira_id,messages):
        for link in messages:
            resource=self.store._resource('mattermost',link.url)
            c.execute('INSERT INTO mattermost_links VALUES (?,?,?,?,?,?,?,?)',(uuid.uuid4().hex,card_id,jira_id,resource['id'],resource['team'],resource['url'],link.description,link.position))

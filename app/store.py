from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import sqlite3
import uuid

from app.config import SiteConfig
from app import associations
from app.errors import StoreError
from app.resource_links import parse_resource
from app.schemas import BoardSnapshot, ChangeColumn, CreateCard, DeleteColumn, EditCard, MoveCard, ReorderColumns
from app.events import WriteResult


class Store:
    """Each public work unit owns its connection in the calling worker thread."""
    def __init__(self, path: Path, config: SiteConfig):
        self.path, self.config = Path(path), config

    @contextmanager
    def connection(self):
        connection = sqlite3.connect(self.path, timeout=5, isolation_level=None)
        connection.row_factory = sqlite3.Row
        connection.execute('PRAGMA foreign_keys=ON')
        connection.execute('PRAGMA busy_timeout=5000')
        try:
            yield connection
        finally:
            if connection.in_transaction:
                connection.rollback()
            connection.close()

    def initialize(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as connection:
            version = connection.execute('PRAGMA user_version').fetchone()[0]
            if version > 3:
                raise StoreError('unsupported_database_version')
            connection.execute('PRAGMA journal_mode=WAL')
            existing = connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='cards'").fetchone() is not None
            legacy = version < 2 and existing
            if existing and version < 3:
                backup_path = self.path.with_name(self.path.name+'.pre-v3-'+uuid.uuid4().hex+'.sqlite3')
                with sqlite3.connect(backup_path) as backup:
                    connection.backup(backup)
            prefix = 'BEGIN IMMEDIATE;\n'
            if legacy:
                prefix += 'ALTER TABLE mattermost_links RENAME TO legacy_mattermost_links;\n'
            if existing and version < 3:
                prefix += 'ALTER TABLE columns ADD COLUMN is_done INTEGER NOT NULL DEFAULT 0 CHECK(is_done IN (0,1));\n'
            connection.executescript(prefix+Path(__file__).with_name('schema.sql').read_text())
            if legacy:
                associations.migrate_legacy(connection)
            if existing and version < 3:
                self._migrate_completed_columns(connection)
            if connection.execute('SELECT 1 FROM board_meta WHERE id=1').fetchone() is None:
                connection.execute('INSERT INTO board_meta VALUES (1,0)')
                for position, name in enumerate(['待处理','调查中','实装中','单体测试','结合测试','完成']):
                    connection.execute('INSERT INTO columns (id,name,position,is_done) VALUES (?,?,?,?)', (uuid.uuid4().hex,name,position,int(name=='完成')))
            if connection.execute('PRAGMA foreign_key_check').fetchall():
                raise StoreError('invalid_database')
            connection.execute('PRAGMA user_version=3')
            connection.commit()

    @staticmethod
    def _migrate_completed_columns(connection):
        connection.execute("UPDATE columns SET is_done=1 WHERE name='完成' AND id NOT IN (SELECT resource_id FROM audit_events WHERE action IN ('column.create','column.rename'))")

    def snapshot(self) -> BoardSnapshot:
        with self.connection() as connection:
            connection.execute('BEGIN')
            return self._snapshot(connection)

    @staticmethod
    def _snapshot(connection):
        revision = connection.execute('SELECT revision FROM board_meta WHERE id=1').fetchone()[0]
        columns = [dict(row) for row in connection.execute('SELECT id,name,position,is_done FROM columns ORDER BY position')]
        # Seed columns alone lack create/rename audit records. This also works for
        # existing databases without rewriting names or migrating stored data.
        custom = {row[0] for row in connection.execute("SELECT DISTINCT resource_id FROM audit_events WHERE action IN ('column.create','column.rename')")}
        defaults = dict(zip(['待处理','调查中','实装中','单体测试','结合测试','完成'], ['todo','investigating','implementing','unitTesting','integrationTesting','done']))
        for column in columns:
            column['isDone'] = bool(column.pop('is_done'))
            column['defaultNameKey'] = None if column['id'] in custom else defaults.get(column['name'])
        tickets, unassigned = associations.snapshot(connection)
        cards = []
        for row in connection.execute('SELECT cards.* FROM cards JOIN columns ON cards.column_id=columns.id ORDER BY columns.position,cards.position'):
            cards.append({'id':row['id'],'columnId':row['column_id'],'title':row['title'],'notes':row['notes'],'position':row['position'],'version':row['version'],'jiraLinks':tickets.get(row['id'],[]),'unassignedMattermostLinks':unassigned.get(row['id'],[])})
        count=connection.execute('SELECT COUNT(*) FROM board_archives').fetchone()[0]
        archive_revision=connection.execute("SELECT COALESCE(MAX(revision),0) FROM audit_events WHERE action IN ('archive.create','archive.rename','archive.restore')").fetchone()[0]
        return BoardSnapshot(revision=revision,columns=columns,cards=cards,archiveCount=count,archiveRevision=archive_revision)

    @staticmethod
    def _record(connection, action, resource_id, source_ip):
        revision=connection.execute('UPDATE board_meta SET revision=revision+1 WHERE id=1 RETURNING revision').fetchone()[0]
        connection.execute('INSERT INTO audit_events (revision,timestamp,action,resource_id,source_ip) VALUES (?,?,?,?,?)',(revision,datetime.now(timezone.utc).isoformat(),action,resource_id,source_ip))
        return revision

    def _write(self, action, resource_id, source_ip, operation, *, create_request=None):
        request_table, resource_field = ('create_column_requests', 'column_id') if action == 'column.create' else ('create_card_requests', 'card_id')
        try:
            with self.connection() as connection:
                connection.execute('BEGIN IMMEDIATE')
                if create_request is not None:
                    request_id, fingerprint = create_request
                    previous = connection.execute(f'SELECT fingerprint FROM {request_table} WHERE request_id=?', (request_id,)).fetchone()
                    if previous is not None:
                        if previous['fingerprint'] != fingerprint:
                            raise StoreError('request_conflict')
                        result = self._snapshot(connection)
                        return WriteResult(result, result.revision, False)
                operation(connection)
                self._record(connection,action,resource_id,source_ip)
                if create_request is not None:
                    connection.execute(f'INSERT INTO {request_table} (request_id,fingerprint,{resource_field}) VALUES (?,?,?)', (request_id,fingerprint,resource_id))
                result = self._snapshot(connection)
                connection.commit()
                return WriteResult(result, result.revision, True) if create_request is not None else result
        except sqlite3.IntegrityError:
            raise StoreError('invalid_change') from None
        except sqlite3.OperationalError as error:
            if 'locked' in str(error).lower() or 'busy' in str(error).lower():
                raise StoreError('busy') from None
            raise

    @staticmethod
    def _revision(connection, expected):
        if connection.execute('SELECT revision FROM board_meta WHERE id=1').fetchone()[0] != expected:
            raise StoreError('conflict')

    @staticmethod
    def _column(connection, column_id):
        if connection.execute('SELECT 1 FROM columns WHERE id=?', (column_id,)).fetchone() is None:
            raise StoreError('not_found')

    @staticmethod
    def _card(connection, card_id):
        row = connection.execute('SELECT * FROM cards WHERE id=?', (card_id,)).fetchone()
        if row is None:
            archived=connection.execute('SELECT archive_id FROM archived_cards WHERE card_id=?',(card_id,)).fetchone()
            if archived:
                raise StoreError('archived',archived[0])
            raise StoreError('not_found')
        return row

    def _resource(self, kind, value):
        try:
            return parse_resource(kind,value,self.config)
        except ValueError:
            raise StoreError('invalid_link') from None

    def create_card(self, data: CreateCard, source_ip: str) -> BoardSnapshot | WriteResult:
        card_id = uuid.uuid4().hex
        create_request = None
        if data.requestId is not None:
            payload = json.dumps(data.model_dump(exclude={'requestId'}), sort_keys=True, ensure_ascii=False)
            create_request = (data.requestId, hashlib.sha256(payload.encode()).hexdigest())
        def operation(connection):
            self._column(connection,data.columnId)
            position = connection.execute('SELECT COUNT(*) FROM cards WHERE column_id=?', (data.columnId,)).fetchone()[0]
            connection.execute('INSERT INTO cards (id,title,notes,column_id,position,version) VALUES (?,?,?,?,?,?)', (card_id,data.title,data.notes,data.columnId,position,1))
            associations.replace(connection,card_id,data.jiraLinks,None,self._resource)
        return self._write('card.create',card_id,source_ip,operation,create_request=create_request)

    def edit_card(self, card_id: str, data: EditCard, source_ip: str):
        def operation(connection):
            card = self._card(connection,card_id)
            if card['version'] != data.expectedVersion:
                raise StoreError('conflict')
            fields = data.model_fields_set
            title = data.title if 'title' in fields else card['title']
            notes = data.notes if 'notes' in fields else card['notes']
            connection.execute('UPDATE cards SET title=?,notes=?,version=version+1 WHERE id=?', (title,notes,card_id))
            if fields & {'jiraLinks','unassignedMattermostLinks'}:
                associations.replace(connection,card_id,data.jiraLinks,data.unassignedMattermostLinks,self._resource)
        return self._write('card.edit',card_id,source_ip,operation)

    @staticmethod
    def _ids(connection, column_id):
        return [row[0] for row in connection.execute('SELECT id FROM cards WHERE column_id=? ORDER BY position', (column_id,))]

    @staticmethod
    def _arrange_cards(connection, orders):
        # Vacate unique positions before assigning the final atomic layout.
        old = {}
        for column_id in orders:
            for row in connection.execute('SELECT id,column_id,position FROM cards WHERE column_id=?', (column_id,)):
                old[row['id']] = (row['column_id'],row['position'])
        ids = [card_id for values in orders.values() for card_id in values]
        if len(set(ids)) != len(ids) or set(ids) != set(old):
            raise StoreError('invalid_position')
        offset = connection.execute('SELECT COALESCE(MAX(position),0) FROM cards').fetchone()[0] + 1
        for index,card_id in enumerate(ids):
            connection.execute('UPDATE cards SET position=? WHERE id=?', (offset+index,card_id))
        for column_id,values in orders.items():
            for position,card_id in enumerate(values):
                changed = int(old[card_id] != (column_id,position))
                connection.execute('UPDATE cards SET column_id=?,position=?,version=version+? WHERE id=?', (column_id,position,changed,card_id))

    def move_card(self, card_id: str, data: MoveCard, source_ip: str):
        def operation(connection):
            card = self._card(connection,card_id)
            self._revision(connection,data.expectedBoardRevision)
            self._column(connection,data.targetColumnId)
            source = card['column_id']
            orders = {column:self._ids(connection,column) for column in {source,data.targetColumnId}}
            orders[source].remove(card_id)
            if data.index > len(orders[data.targetColumnId]):
                raise StoreError('invalid_position')
            orders[data.targetColumnId].insert(data.index,card_id)
            self._arrange_cards(connection,orders)
        return self._write('card.move',card_id,source_ip,operation)

    def create_column(self, data: ChangeColumn, source_ip: str):
        column_id = uuid.uuid4().hex
        create_request = None
        if data.requestId is not None:
            payload = json.dumps(data.model_dump(exclude={'requestId'}), sort_keys=True, ensure_ascii=False)
            create_request = (data.requestId, hashlib.sha256(payload.encode()).hexdigest())
        def operation(connection):
            self._revision(connection,data.expectedBoardRevision)
            position = connection.execute('SELECT COUNT(*) FROM columns').fetchone()[0]
            if position >= 100:
                raise StoreError('column_limit')
            connection.execute('INSERT INTO columns (id,name,position) VALUES (?,?,?)', (column_id,data.name,position))
        return self._write('column.create',column_id,source_ip,operation,create_request=create_request)

    def rename_column(self, column_id: str, data: ChangeColumn, source_ip: str):
        def operation(connection):
            self._revision(connection,data.expectedBoardRevision)
            self._column(connection,column_id)
            if 'name' in data.model_fields_set:
                connection.execute('UPDATE columns SET name=? WHERE id=?', (data.name,column_id))
            if 'isDone' in data.model_fields_set:
                connection.execute('UPDATE columns SET is_done=? WHERE id=?', (int(data.isDone),column_id))
        return self._write('column.rename' if 'name' in data.model_fields_set else 'column.completion',column_id,source_ip,operation)

    @staticmethod
    def _arrange_columns(connection, ids):
        offset = connection.execute('SELECT COALESCE(MAX(position),0) FROM columns').fetchone()[0] + 1
        for index,column_id in enumerate(ids):
            connection.execute('UPDATE columns SET position=? WHERE id=?', (offset+index,column_id))
        for position,column_id in enumerate(ids):
            connection.execute('UPDATE columns SET position=? WHERE id=?', (position,column_id))

    def reorder_columns(self, data: ReorderColumns, source_ip: str):
        def operation(connection):
            self._revision(connection,data.expectedBoardRevision)
            existing = {row[0] for row in connection.execute('SELECT id FROM columns')}
            if set(data.columnIds) != existing or len(data.columnIds) != len(existing):
                raise StoreError('invalid_columns')
            self._arrange_columns(connection,data.columnIds)
        return self._write('column.reorder','board',source_ip,operation)

    def delete_column(self, column_id: str, data: DeleteColumn, source_ip: str):
        def operation(connection):
            self._revision(connection,data.expectedBoardRevision)
            columns = [row[0] for row in connection.execute('SELECT id FROM columns ORDER BY position')]
            if len(columns) <= 1:
                raise StoreError('last_column')
            self._column(connection,column_id)
            self._column(connection,data.targetColumnId)
            if column_id == data.targetColumnId:
                raise StoreError('invalid_target')
            orders = {column_id:[],data.targetColumnId:self._ids(connection,data.targetColumnId)+self._ids(connection,column_id)}
            self._arrange_cards(connection,orders)
            connection.execute('DELETE FROM columns WHERE id=?', (column_id,))
            self._arrange_columns(connection,[value for value in columns if value != column_id])
        return self._write('column.delete',column_id,source_ip,operation)

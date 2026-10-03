CREATE TABLE IF NOT EXISTS board_meta (
 id INTEGER PRIMARY KEY CHECK (id=1), revision INTEGER NOT NULL CHECK (revision>=0)
);
CREATE TABLE IF NOT EXISTS columns (
 id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK (length(trim(name))>0),
 position INTEGER NOT NULL UNIQUE CHECK (position>=0), is_done INTEGER NOT NULL DEFAULT 0 CHECK(is_done IN (0,1))
);
CREATE TABLE IF NOT EXISTS cards (
 id TEXT PRIMARY KEY, title TEXT NOT NULL CHECK (length(trim(title))>0), notes TEXT NOT NULL,
 column_id TEXT NOT NULL REFERENCES columns(id) ON DELETE RESTRICT,
 position INTEGER NOT NULL CHECK (position>=0), version INTEGER NOT NULL CHECK (version>0),
 jira_key TEXT, jira_url TEXT,
 CHECK ((jira_key IS NULL) = (jira_url IS NULL)), UNIQUE(column_id,position)
);
CREATE TABLE IF NOT EXISTS jira_links (
 id TEXT PRIMARY KEY, card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
 jira_key TEXT NOT NULL, url TEXT NOT NULL, position INTEGER NOT NULL CHECK(position>=0),
 UNIQUE(card_id,position), UNIQUE(card_id,jira_key), UNIQUE(id,card_id)
);
CREATE TABLE IF NOT EXISTS mattermost_links (
 id TEXT PRIMARY KEY, card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
 jira_link_id TEXT,
 post_id TEXT NOT NULL, team TEXT NOT NULL, url TEXT NOT NULL, description TEXT NOT NULL,
 position INTEGER NOT NULL CHECK(position>=0),
 FOREIGN KEY(jira_link_id,card_id) REFERENCES jira_links(id,card_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS message_parent_position ON mattermost_links(jira_link_id,position) WHERE jira_link_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS unassigned_card_position ON mattermost_links(card_id,position) WHERE jira_link_id IS NULL;
CREATE TABLE IF NOT EXISTS audit_events (
 id INTEGER PRIMARY KEY, revision INTEGER NOT NULL UNIQUE, timestamp TEXT NOT NULL,
 action TEXT NOT NULL, resource_id TEXT NOT NULL, source_ip TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_action_revision ON audit_events(action,revision);
-- Keep completed create requests after their cards are archived or moved.
CREATE TABLE IF NOT EXISTS create_card_requests (
 request_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, card_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS board_archives (
 id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK(length(trim(name))>0), description TEXT NOT NULL,
 created_at TEXT NOT NULL, source_revision INTEGER NOT NULL, metadata_version INTEGER NOT NULL,
 snapshot_schema_version INTEGER NOT NULL, card_count INTEGER NOT NULL, jira_link_count INTEGER NOT NULL,
 snapshot_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS archive_date ON board_archives(created_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS archived_cards (
 card_id TEXT PRIMARY KEY, archive_id TEXT NOT NULL REFERENCES board_archives(id)
);
CREATE TABLE IF NOT EXISTS archive_operations (
 request_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, result_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS archive_restorations (
 archive_id TEXT NOT NULL REFERENCES board_archives(id), archived_card_id TEXT NOT NULL,
 restored_card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
 PRIMARY KEY(archive_id,archived_card_id), UNIQUE(restored_card_id)
);

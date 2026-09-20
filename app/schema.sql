CREATE TABLE IF NOT EXISTS board_meta (
 id INTEGER PRIMARY KEY CHECK (id=1), revision INTEGER NOT NULL CHECK (revision>=0)
);
CREATE TABLE IF NOT EXISTS columns (
 id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK (length(trim(name))>0),
 position INTEGER NOT NULL UNIQUE CHECK (position>=0)
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

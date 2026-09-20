CREATE TABLE board_meta (id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL);
CREATE TABLE columns (id TEXT PRIMARY KEY,name TEXT NOT NULL,position INTEGER NOT NULL UNIQUE);
CREATE TABLE cards (id TEXT PRIMARY KEY,title TEXT NOT NULL,notes TEXT NOT NULL,column_id TEXT NOT NULL REFERENCES columns(id) ON DELETE RESTRICT,position INTEGER NOT NULL,version INTEGER NOT NULL,jira_key TEXT,jira_url TEXT,UNIQUE(column_id,position));
CREATE TABLE jira_links (id TEXT PRIMARY KEY,card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,jira_key TEXT NOT NULL,url TEXT NOT NULL,position INTEGER NOT NULL,UNIQUE(card_id,position),UNIQUE(card_id,jira_key),UNIQUE(id,card_id));
CREATE TABLE mattermost_links (id TEXT PRIMARY KEY,card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,jira_link_id TEXT,post_id TEXT NOT NULL,team TEXT NOT NULL,url TEXT NOT NULL,description TEXT NOT NULL,position INTEGER NOT NULL,FOREIGN KEY(jira_link_id,card_id) REFERENCES jira_links(id,card_id) ON DELETE CASCADE);
CREATE UNIQUE INDEX message_parent_position ON mattermost_links(jira_link_id,position) WHERE jira_link_id IS NOT NULL;
CREATE UNIQUE INDEX unassigned_card_position ON mattermost_links(card_id,position) WHERE jira_link_id IS NULL;
CREATE TABLE audit_events (id INTEGER PRIMARY KEY,revision INTEGER NOT NULL UNIQUE,timestamp TEXT NOT NULL,action TEXT NOT NULL,resource_id TEXT NOT NULL,source_ip TEXT NOT NULL);
PRAGMA user_version=2;

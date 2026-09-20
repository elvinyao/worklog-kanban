BEGIN IMMEDIATE;
CREATE TABLE board_meta (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL CHECK(revision>=0));
CREATE TABLE columns (id TEXT PRIMARY KEY,name TEXT NOT NULL CHECK(length(trim(name))>0),position INTEGER NOT NULL UNIQUE CHECK(position>=0));
CREATE TABLE cards (
 id TEXT PRIMARY KEY,title TEXT NOT NULL CHECK(length(trim(title))>0),notes TEXT NOT NULL,
 column_id TEXT NOT NULL REFERENCES columns(id) ON DELETE RESTRICT,
 position INTEGER NOT NULL CHECK(position>=0),version INTEGER NOT NULL CHECK(version>0),jira_key TEXT,jira_url TEXT,
 CHECK((jira_key IS NULL)=(jira_url IS NULL)),UNIQUE(column_id,position)
);
CREATE TABLE mattermost_links (
 id TEXT PRIMARY KEY,card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
 post_id TEXT NOT NULL,team TEXT NOT NULL,url TEXT NOT NULL,description TEXT NOT NULL,
 position INTEGER NOT NULL CHECK(position>=0),UNIQUE(card_id,position)
);
CREATE TABLE audit_events (id INTEGER PRIMARY KEY,revision INTEGER NOT NULL UNIQUE,timestamp TEXT NOT NULL,action TEXT NOT NULL,resource_id TEXT NOT NULL,source_ip TEXT NOT NULL);
PRAGMA user_version=1;
COMMIT;

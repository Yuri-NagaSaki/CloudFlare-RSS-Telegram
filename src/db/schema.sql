PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user (
  id INTEGER PRIMARY KEY,
  state INTEGER DEFAULT 0,
  lang TEXT DEFAULT 'zh-Hans',
  admin INTEGER,
  sub_limit INTEGER,
  interval INTEGER,
  notify INTEGER DEFAULT 1,
  send_mode INTEGER DEFAULT 0,
  length_limit INTEGER DEFAULT 0,
  link_preview INTEGER DEFAULT 0,
  display_author INTEGER DEFAULT 0,
  display_via INTEGER DEFAULT 0,
  display_title INTEGER DEFAULT 0,
  display_entry_tags INTEGER DEFAULT -1,
  style INTEGER DEFAULT 0,
  display_media INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feed (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  state INTEGER DEFAULT 1,
  link TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  interval INTEGER,
  etag TEXT,
  last_modified TEXT,
  error_count INTEGER DEFAULT 0,
  next_check_time TEXT,
  lock_until TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sub (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  state INTEGER DEFAULT 1,
  user_id INTEGER NOT NULL,
  feed_id INTEGER NOT NULL,
  title TEXT,
  tags TEXT,
  interval INTEGER,
  notify INTEGER DEFAULT -100,
  send_mode INTEGER DEFAULT -100,
  length_limit INTEGER DEFAULT -100,
  link_preview INTEGER DEFAULT -100,
  display_author INTEGER DEFAULT -100,
  display_via INTEGER DEFAULT -100,
  display_title INTEGER DEFAULT -100,
  display_entry_tags INTEGER DEFAULT -100,
  style INTEGER DEFAULT -100,
  display_media INTEGER DEFAULT -100,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, feed_id),
  FOREIGN KEY(user_id) REFERENCES user(id) ON DELETE CASCADE,
  FOREIGN KEY(feed_id) REFERENCES feed(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS option (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feed_entry (
  feed_id INTEGER NOT NULL,
  entry_hash TEXT NOT NULL,
  published_at TEXT,
  PRIMARY KEY (feed_id, entry_hash),
  FOREIGN KEY(feed_id) REFERENCES feed(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_feed_next_check ON feed(next_check_time);
CREATE INDEX IF NOT EXISTS idx_sub_user ON sub(user_id);

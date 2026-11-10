import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function createStore(filename = process.env.MUSIC_DB_PATH ?? "data/sonora.sqlite") {
  const resolvedPath = resolve(filename);
  mkdirSync(dirname(resolvedPath), { recursive: true });

  const db = new DatabaseSync(resolvedPath);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      bio TEXT NOT NULL DEFAULT '',
      avatar_url TEXT,
      interests TEXT NOT NULL DEFAULT '[]',
      is_private INTEGER NOT NULL DEFAULT 0,
      allow_dm INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS follows (
      follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      followed_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (follower_id, followed_id),
      CHECK (follower_id != followed_id)
    );
    CREATE TABLE IF NOT EXISTS follow_requests (
      requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (requester_id, target_id),
      CHECK (requester_id != target_id)
    );
    CREATE TABLE IF NOT EXISTS blocks (
      blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (blocker_id, blocked_id),
      CHECK (blocker_id != blocked_id)
    );
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      track_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS posts_created ON posts(created_at DESC);
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS reactions (
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('like', 'love', 'fire')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (post_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS feedback (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      track_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('like', 'dislike', 'save', 'listened')),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, track_id)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_message_id TEXT,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (sender_id != recipient_id)
    );
    CREATE INDEX IF NOT EXISTS messages_conversation ON messages(sender_id, recipient_id, id);
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY,
      reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,
      message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      kind TEXT NOT NULL,
      post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, is_read, id DESC);
    CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS collection_tracks (
      collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      track_id TEXT NOT NULL,
      added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (collection_id, track_id)
    );
  `);

  const messageColumns = db.prepare("PRAGMA table_info(messages)").all();
  if (!messageColumns.some((column) => column.name === "client_message_id")) {
    db.exec("ALTER TABLE messages ADD COLUMN client_message_id TEXT");
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS messages_idempotency ON messages(sender_id, client_message_id) WHERE client_message_id IS NOT NULL");

  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());

  return {
    db,
    close() {
      db.close();
    }
  };
}

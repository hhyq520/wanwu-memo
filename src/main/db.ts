import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import Database from "better-sqlite3";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const dir = app.getPath("userData");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "wanwu.sqlite");
  db = new Database(file);
  db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}

function migrate(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '未分类',
      tags TEXT NOT NULL DEFAULT '[]',
      app_name TEXT NOT NULL DEFAULT '',
      path TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      launch_command TEXT NOT NULL DEFAULT '',
      open_with TEXT NOT NULL DEFAULT 'default',
      body TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      howto TEXT NOT NULL DEFAULT '',
      keywords TEXT NOT NULL DEFAULT '[]',
      source_kind TEXT NOT NULL DEFAULT 'text',
      source_raw TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      name TEXT PRIMARY KEY,
      sort INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      extra TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
      title,
      summary,
      howto,
      body,
      tags,
      keywords,
      app_name,
      content='items',
      content_rowid='rowid'
    );

    CREATE TRIGGER IF NOT EXISTS items_ai AFTER INSERT ON items BEGIN
      INSERT INTO items_fts(rowid, title, summary, howto, body, tags, keywords, app_name)
      VALUES (new.rowid, new.title, new.summary, new.howto, new.body, new.tags, new.keywords, new.app_name);
    END;

    CREATE TRIGGER IF NOT EXISTS items_ad AFTER DELETE ON items BEGIN
      INSERT INTO items_fts(items_fts, rowid, title, summary, howto, body, tags, keywords, app_name)
      VALUES ('delete', old.rowid, old.title, old.summary, old.howto, old.body, old.tags, old.keywords, old.app_name);
    END;

    CREATE TRIGGER IF NOT EXISTS items_au AFTER UPDATE ON items BEGIN
      INSERT INTO items_fts(items_fts, rowid, title, summary, howto, body, tags, keywords, app_name)
      VALUES ('delete', old.rowid, old.title, old.summary, old.howto, old.body, old.tags, old.keywords, old.app_name);
      INSERT INTO items_fts(rowid, title, summary, howto, body, tags, keywords, app_name)
      VALUES (new.rowid, new.title, new.summary, new.howto, new.body, new.tags, new.keywords, new.app_name);
    END;
  `);

  const presets = [
    ["软件", 1],
    ["开发", 2],
    ["写作", 3],
    ["设计", 4],
    ["效率", 5],
    ["收藏网址", 6],
    ["备忘", 7],
    ["未分类", 99]
  ] as const;
  const insert = database.prepare(
    "INSERT OR IGNORE INTO categories (name, sort) VALUES (?, ?)"
  );
  for (const [name, sort] of presets) insert.run(name, sort);
}

export function closeDb(): void {
  db?.close();
  db = null;
}

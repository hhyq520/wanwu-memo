import { randomUUID } from "node:crypto";
import fs from "node:fs";
import type { CatalogItem, ItemDraft, ItemType, OpenWith, SourceKind } from "@shared/types";
import { getDb } from "./db";
import { expandUserPath, portablePath } from "./paths";

interface ItemRow {
  id: string;
  title: string;
  type: string;
  category: string;
  tags: string;
  app_name: string;
  path: string;
  url: string;
  launch_command: string;
  open_with: string;
  body: string;
  summary: string;
  howto: string;
  keywords: string;
  source_kind: string;
  source_raw: string;
  created_at: number;
  updated_at: number;
}

function parseJsonArray(raw: string): string[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
  } catch {
    return raw
      ? raw
          .split(/[,，]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  }
}

function rowToItem(row: ItemRow): CatalogItem {
  const storedPath = row.path || "";
  const expanded = storedPath ? expandUserPath(storedPath) : "";
  return {
    id: row.id,
    title: row.title,
    type: row.type as ItemType,
    category: row.category,
    tags: parseJsonArray(row.tags),
    appName: row.app_name,
    path: storedPath,
    url: row.url,
    launchCommand: row.launch_command,
    openWith: (row.open_with as OpenWith) || "default",
    body: row.body,
    summary: row.summary,
    howto: row.howto,
    keywords: parseJsonArray(row.keywords),
    sourceKind: row.source_kind as SourceKind,
    sourceRaw: row.source_raw,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pathMissing: Boolean(expanded) && !fs.existsSync(expanded)
  };
}

export function listCategories(): string[] {
  const rows = getDb()
    .prepare("SELECT name FROM categories ORDER BY sort ASC, name ASC")
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

export function ensureCategory(name: string): void {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "全部") return;
  getDb()
    .prepare("INSERT OR IGNORE INTO categories (name, sort) VALUES (?, 50)")
    .run(trimmed);
}

export function listItems(category?: string): CatalogItem[] {
  const db = getDb();
  const rows =
    category && category !== "全部"
      ? (db
          .prepare("SELECT * FROM items WHERE category = ? ORDER BY updated_at DESC")
          .all(category) as ItemRow[])
      : (db.prepare("SELECT * FROM items ORDER BY updated_at DESC").all() as ItemRow[]);
  return rows.map(rowToItem);
}

export function getItem(id: string): CatalogItem | null {
  const row = getDb().prepare("SELECT * FROM items WHERE id = ?").get(id) as ItemRow | undefined;
  return row ? rowToItem(row) : null;
}

export function getItemByUrl(url: string): CatalogItem | null {
  const href = url.trim();
  if (!href) return null;
  const row = getDb().prepare("SELECT * FROM items WHERE url = ? LIMIT 1").get(href) as
    | ItemRow
    | undefined;
  return row ? rowToItem(row) : null;
}

export function deleteItem(id: string): boolean {
  const result = getDb().prepare("DELETE FROM items WHERE id = ?").run(id);
  return result.changes > 0;
}

export function upsertItem(draft: ItemDraft & { id?: string }): CatalogItem {
  const db = getDb();
  const now = Date.now();
  const existing = draft.id ? getItem(draft.id) : null;
  const id = existing?.id ?? draft.id ?? randomUUID();
  const pathValue = portablePath(draft.path ?? existing?.path ?? "");
  const item: CatalogItem = {
    id,
    title: (draft.title || existing?.title || "未命名").trim(),
    type: draft.type ?? existing?.type ?? "note",
    category: (draft.category || existing?.category || "未分类").trim(),
    tags: draft.tags ?? existing?.tags ?? [],
    appName: draft.appName ?? existing?.appName ?? "",
    path: pathValue,
    url: draft.url ?? existing?.url ?? "",
    launchCommand: draft.launchCommand ?? existing?.launchCommand ?? "",
    openWith: draft.openWith ?? existing?.openWith ?? "default",
    body: draft.body ?? existing?.body ?? "",
    summary: draft.summary ?? existing?.summary ?? "",
    howto: draft.howto ?? existing?.howto ?? "",
    keywords: draft.keywords ?? existing?.keywords ?? [],
    sourceKind: draft.sourceKind ?? existing?.sourceKind ?? "text",
    sourceRaw: draft.sourceRaw ?? existing?.sourceRaw ?? "",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  ensureCategory(item.category);
  db.prepare(
    `INSERT INTO items (
      id, title, type, category, tags, app_name, path, url, launch_command, open_with,
      body, summary, howto, keywords, source_kind, source_raw, created_at, updated_at
    ) VALUES (
      @id, @title, @type, @category, @tags, @appName, @path, @url, @launchCommand, @openWith,
      @body, @summary, @howto, @keywords, @sourceKind, @sourceRaw, @createdAt, @updatedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title, type=excluded.type, category=excluded.category, tags=excluded.tags,
      app_name=excluded.app_name, path=excluded.path, url=excluded.url,
      launch_command=excluded.launch_command, open_with=excluded.open_with,
      body=excluded.body, summary=excluded.summary, howto=excluded.howto, keywords=excluded.keywords,
      source_kind=excluded.source_kind, source_raw=excluded.source_raw, updated_at=excluded.updated_at`
  ).run({
    ...item,
    tags: JSON.stringify(item.tags),
    keywords: JSON.stringify(item.keywords)
  });
  return getItem(id)!;
}

function ftsQuery(raw: string): string {
  return raw
    .split(/[\s,，、]+/)
    .map((part) => part.replace(/["']/g, "").trim())
    .filter((part) => part.length > 0)
    .map((part) => `"${part}"`)
    .join(" OR ");
}

export function searchItems(query: string): CatalogItem[] {
  const q = query.trim();
  if (!q) return [];
  const db = getDb();
  const seen = new Map<string, CatalogItem>();
  const match = ftsQuery(q);
  if (match) {
    try {
      const rows = db
        .prepare(
          `SELECT items.* FROM items
           JOIN items_fts ON items.rowid = items_fts.rowid
           WHERE items_fts MATCH ?
           ORDER BY rank`
        )
        .all(match) as ItemRow[];
      for (const row of rows) seen.set(row.id, rowToItem(row));
    } catch {
      // FTS syntax can fail on odd punctuation; fall through to LIKE.
    }
  }

  const like = `%${q}%`;
  const likeRows = db
    .prepare(
      `SELECT * FROM items WHERE
        title LIKE ? OR summary LIKE ? OR howto LIKE ? OR body LIKE ? OR tags LIKE ?
        OR keywords LIKE ? OR app_name LIKE ? OR path LIKE ? OR url LIKE ?
      ORDER BY updated_at DESC`
    )
    .all(like, like, like, like, like, like, like, like, like) as ItemRow[];
  for (const row of likeRows) {
    if (!seen.has(row.id)) seen.set(row.id, rowToItem(row));
  }

  const tokens = q.split(/[\s,，、]+/).filter((t) => t.length >= 2);
  if (tokens.length > 1) {
    for (const token of tokens) {
      const extra = searchItems(token);
      for (const item of extra) {
        if (!seen.has(item.id)) seen.set(item.id, item);
      }
    }
  }

  return [...seen.values()];
}

export function replaceAllItems(items: CatalogItem[], mode: "merge" | "overwrite"): {
  imported: number;
  skipped: number;
  overwritten: number;
} {
  let imported = 0;
  let skipped = 0;
  let overwritten = 0;
  for (const item of items) {
    const existing = getItem(item.id);
    if (existing && mode === "merge") {
      skipped += 1;
      continue;
    }
    if (existing) overwritten += 1;
    else imported += 1;
    upsertItem(item);
  }
  return { imported, skipped, overwritten };
}

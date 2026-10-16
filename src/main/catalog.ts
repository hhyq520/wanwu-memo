import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { asRemindKind, computeRemindAt } from "@shared/remind";
import type { CatalogItem, ItemDraft, ItemType, OpenWith, RemindKind, SourceKind } from "@shared/types";
import { getDb } from "./db";
import { sanitizeLaunchCommand } from "./inspect";
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
  remind_kind?: string;
  remind_date?: string;
  remind_at?: number;
  remind_dismissed_at?: number;
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
    remindKind: asRemindKind(row.remind_kind),
    remindDate: row.remind_date || "",
    remindAt: row.remind_at || 0,
    remindDismissedAt: row.remind_dismissed_at || 0,
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

export function listDueReminders(now = Date.now()): CatalogItem[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM items
       WHERE remind_kind != 'none' AND remind_at > 0 AND remind_at <= ? AND remind_dismissed_at = 0
       ORDER BY remind_at ASC`
    )
    .all(now) as ItemRow[];
  return rows.map(rowToItem);
}

export function nextReminderAt(now = Date.now()): number | null {
  const row = getDb()
    .prepare(
      `SELECT MIN(remind_at) AS at FROM items
       WHERE remind_kind != 'none' AND remind_dismissed_at = 0 AND remind_at > ?`
    )
    .get(now) as { at: number | null } | undefined;
  return row?.at ?? null;
}

export function dismissReminder(id: string, now = Date.now()): boolean {
  const result = getDb()
    .prepare(
      `UPDATE items SET remind_dismissed_at = ?
       WHERE id = ? AND remind_dismissed_at = 0 AND remind_kind != 'none'`
    )
    .run(now, id);
  return result.changes > 0;
}

function reminderFields(
  draft: ItemDraft,
  existing: CatalogItem | null,
  createdAt: number
): Pick<CatalogItem, "remindKind" | "remindDate" | "remindAt" | "remindDismissedAt"> {
  const kind: RemindKind =
    draft.remindKind !== undefined ? asRemindKind(draft.remindKind) : (existing?.remindKind ?? "none");
  const date = (draft.remindDate !== undefined ? draft.remindDate : (existing?.remindDate ?? "")).trim();
  const storedDate = kind === "date" || kind === "at" ? date : "";
  const changed =
    !existing || existing.remindKind !== kind || (existing.remindDate || "") !== storedDate;
  return {
    remindKind: kind,
    remindDate: storedDate,
    remindAt: computeRemindAt(kind, storedDate, createdAt),
    remindDismissedAt: changed ? 0 : (existing?.remindDismissedAt ?? 0)
  };
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
    launchCommand: sanitizeLaunchCommand(draft.launchCommand ?? existing?.launchCommand ?? ""),
    openWith: draft.openWith ?? existing?.openWith ?? "default",
    body: draft.body ?? existing?.body ?? "",
    summary: draft.summary ?? existing?.summary ?? "",
    howto: draft.howto ?? existing?.howto ?? "",
    keywords: draft.keywords ?? existing?.keywords ?? [],
    sourceKind: draft.sourceKind ?? existing?.sourceKind ?? "text",
    sourceRaw: draft.sourceRaw ?? existing?.sourceRaw ?? "",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...reminderFields(draft, existing, existing?.createdAt ?? now)
  };
  ensureCategory(item.category);
  db.prepare(
    `INSERT INTO items (
      id, title, type, category, tags, app_name, path, url, launch_command, open_with,
      body, summary, howto, keywords, source_kind, source_raw, created_at, updated_at,
      remind_kind, remind_date, remind_at, remind_dismissed_at
    ) VALUES (
      @id, @title, @type, @category, @tags, @appName, @path, @url, @launchCommand, @openWith,
      @body, @summary, @howto, @keywords, @sourceKind, @sourceRaw, @createdAt, @updatedAt,
      @remindKind, @remindDate, @remindAt, @remindDismissedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title, type=excluded.type, category=excluded.category, tags=excluded.tags,
      app_name=excluded.app_name, path=excluded.path, url=excluded.url,
      launch_command=excluded.launch_command, open_with=excluded.open_with,
      body=excluded.body, summary=excluded.summary, howto=excluded.howto, keywords=excluded.keywords,
      source_kind=excluded.source_kind, source_raw=excluded.source_raw, updated_at=excluded.updated_at,
      remind_kind=excluded.remind_kind, remind_date=excluded.remind_date,
      remind_at=excluded.remind_at, remind_dismissed_at=excluded.remind_dismissed_at`
  ).run({
    ...item,
    tags: JSON.stringify(item.tags),
    keywords: JSON.stringify(item.keywords)
  });
  return getItem(id)!;
}

const PURPOSE_SYNONYMS: Record<string, string[]> = {
  设计: ["design", "designer"],
  design: ["设计"],
  designer: ["设计"],
  网站: ["website", "web", "site"],
  website: ["网站"],
  web: ["网站"],
  site: ["网站"],
  下载: ["download"],
  download: ["下载"],
  视频: ["video"],
  video: ["视频"],
  图片: ["image", "photo", "pic"],
  image: ["图片"],
  photo: ["图片"],
  写作: ["writing", "write"],
  writing: ["写作"],
  write: ["写作"],
  笔记: ["note", "memo"],
  note: ["笔记"],
  memo: ["备忘", "笔记"],
  备忘: ["memo", "note"],
  效率: ["productivity"],
  productivity: ["效率"],
  浏览器: ["browser"],
  browser: ["浏览器"],
  音乐: ["music"],
  music: ["音乐"],
  电影: ["movie", "film"],
  movie: ["电影"],
  剪辑: ["edit", "editing"],
  翻译: ["translate", "translation"],
  translate: ["翻译"],
  translation: ["翻译"],
  代码: ["code", "coding"],
  code: ["代码"],
  coding: ["代码"],
  开发: ["dev", "develop", "development"],
  develop: ["开发"],
  development: ["开发"],
  会议: ["meeting"],
  meeting: ["会议"],
  邮箱: ["email", "mail"],
  email: ["邮箱"],
  日历: ["calendar"],
  calendar: ["日历"],
  云盘: ["drive", "cloud", "storage"],
  存储: ["storage", "cloud"],
  人工智能: ["AI"],
  生成: ["generate", "generator"],
  generate: ["生成"],
  generator: ["生成"]
};

function queryParts(query: string): string[] {
  return query
    .split(/[\s,，、]+/)
    .map((part) => part.replace(/["']/g, "").trim())
    .filter(Boolean);
}

function expandSearchTokens(query: string): string[] {
  const parts = queryParts(query);
  const out = new Set<string>(parts);
  const lower = query.toLowerCase();
  for (const [key, extras] of Object.entries(PURPOSE_SYNONYMS)) {
    if (query.includes(key) || lower.includes(key.toLowerCase())) {
      out.add(key);
      for (const extra of extras) out.add(extra);
    }
  }
  return [...out].filter((token) => token.length >= 2);
}

function ftsQuery(tokens: string[]): string {
  return tokens.map((part) => `"${part.replace(/["']/g, "")}"`).join(" OR ");
}

function containsToken(haystack: string, token: string): boolean {
  return haystack.toLowerCase().includes(token.toLowerCase());
}

function scoreTokenAgainstItem(item: CatalogItem, token: string): number {
  if (!token) return 0;
  const title = item.title;
  if (title.toLowerCase() === token.toLowerCase()) return 100;
  if (containsToken(title, token)) return 50;
  if (item.keywords.some((word) => containsToken(word, token))) return 35;
  if (item.tags.some((tag) => containsToken(tag, token))) return 30;
  if (containsToken(item.summary, token) || containsToken(item.appName, token)) return 20;
  if (containsToken(item.url, token) || containsToken(item.path, token)) return 12;
  if (containsToken(item.body, token) || containsToken(item.howto, token)) return 8;
  return 0;
}

function isOriginalToken(token: string, original: Set<string>): boolean {
  return original.has(token.toLowerCase());
}

function scoreItem(item: CatalogItem, query: string, tokens: string[], original: Set<string>): number {
  let originalScore = 0;
  let synonymScore = 0;
  for (const token of tokens) {
    const points = scoreTokenAgainstItem(item, token);
    if (isOriginalToken(token, original)) originalScore += points;
    else synonymScore += points * 0.55;
  }
  let score = Math.max(originalScore, synonymScore);
  const q = query.toLowerCase();
  if (q && item.title.toLowerCase() === q) score += 80;
  else if (q.length >= 2 && item.title.toLowerCase().includes(q)) score += 40;
  const origTokens = [...original];
  if (origTokens.length > 1 && origTokens.every((token) => containsToken(item.title, token))) {
    score += 25;
  }
  return score;
}

function ftsBonus(ftsRank: number | undefined): number {
  if (ftsRank == null || Number.isNaN(ftsRank)) return 0;
  return Math.min(12, Math.max(0, -ftsRank) * 2);
}

interface RankedRow extends ItemRow {
  fts_rank?: number;
}

interface ScoredHit {
  item: CatalogItem;
  score: number;
  ftsRank?: number;
}

function searchItemsRaw(query: string): ScoredHit[] {
  const q = query.trim();
  if (!q) return [];
  const db = getDb();
  const seen = new Map<string, ScoredHit>();
  const match = ftsQuery(queryParts(q));
  if (match) {
    try {
      const rows = db
        .prepare(
          `SELECT items.*, bm25(items_fts) AS fts_rank FROM items
           JOIN items_fts ON items.rowid = items_fts.rowid
           WHERE items_fts MATCH ?`
        )
        .all(match) as RankedRow[];
      for (const row of rows) {
        const item = rowToItem(row);
        seen.set(item.id, { item, score: 0, ftsRank: row.fts_rank });
      }
    } catch {
      try {
        const rows = db
          .prepare(
            `SELECT items.* FROM items
             JOIN items_fts ON items.rowid = items_fts.rowid
             WHERE items_fts MATCH ?`
          )
          .all(match) as ItemRow[];
        for (const row of rows) {
          const item = rowToItem(row);
          seen.set(item.id, { item, score: 0 });
        }
      } catch {
        // FTS syntax can fail on odd punctuation; fall through to LIKE.
      }
    }
  }

  const like = `%${q}%`;
  const likeRows = db
    .prepare(
      `SELECT * FROM items WHERE
        title LIKE ? OR summary LIKE ? OR howto LIKE ? OR body LIKE ? OR tags LIKE ?
        OR keywords LIKE ? OR app_name LIKE ? OR path LIKE ? OR url LIKE ?`
    )
    .all(like, like, like, like, like, like, like, like, like) as ItemRow[];
  for (const row of likeRows) {
    if (!seen.has(row.id)) {
      const item = rowToItem(row);
      seen.set(item.id, { item, score: 0 });
    }
  }
  return [...seen.values()];
}

function keepBetter(seen: Map<string, ScoredHit>, hit: ScoredHit): void {
  const prev = seen.get(hit.item.id);
  if (!prev || hit.score > prev.score || (hit.score === prev.score && (hit.ftsRank ?? 0) < (prev.ftsRank ?? 0))) {
    seen.set(hit.item.id, hit);
  }
}

export function searchItems(query: string): CatalogItem[] {
  const q = query.trim();
  if (!q) return [];
  const original = new Set(queryParts(q).map((part) => part.toLowerCase()));
  const tokens = expandSearchTokens(q);
  const seen = new Map<string, ScoredHit>();

  const scoreHits = (needle: string): void => {
    for (const hit of searchItemsRaw(needle)) {
      const score = scoreItem(hit.item, q, tokens, original) + ftsBonus(hit.ftsRank);
      keepBetter(seen, { item: hit.item, score, ftsRank: hit.ftsRank });
    }
  };

  scoreHits(q);
  for (const token of tokens) {
    if (token === q) continue;
    scoreHits(token);
  }

  return [...seen.values()]
    .sort((a, b) => b.score - a.score || b.item.updatedAt - a.item.updatedAt)
    .map((hit) => hit.item);
}

export function rankItemsByQuery(items: CatalogItem[], query: string): CatalogItem[] {
  const q = query.trim();
  if (!q || items.length <= 1) return items;
  const original = new Set(queryParts(q).map((part) => part.toLowerCase()));
  const tokens = expandSearchTokens(q);
  return [...items].sort((a, b) => {
    const delta = scoreItem(b, q, tokens, original) - scoreItem(a, q, tokens, original);
    return delta || b.updatedAt - a.updatedAt;
  });
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

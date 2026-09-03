import { createHash } from "node:crypto";
import { dialog } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CatalogItem, ChatStep, ImportResult, ItemDraft } from "@shared/types";
import { getItem, getItemByUrl, upsertItem } from "./catalog";
import { enrichUrlItems } from "./enrich";

interface ChromeNode {
  type?: string;
  name?: string;
  url?: string;
  guid?: string;
  children?: ChromeNode[];
}

interface ChromeBookmarksFile {
  roots?: {
    bookmark_bar?: ChromeNode;
    other?: ChromeNode;
    synced?: ChromeNode;
  };
}

const ROOT_LABELS: Record<string, string> = {
  bookmark_bar: "书签栏",
  other: "其他书签",
  synced: "已同步"
};

function defaultBookmarkFiles(): string[] {
  const home = os.homedir();
  if (process.platform === "darwin") {
    const chrome = path.join(home, "Library", "Application Support", "Google", "Chrome");
    return collectProfileBookmarks(chrome);
  }
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    return collectProfileBookmarks(path.join(local, "Google", "Chrome", "User Data"));
  }
  return collectProfileBookmarks(path.join(home, ".config", "google-chrome"));
}

function collectProfileBookmarks(userData: string): string[] {
  const files: string[] = [];
  const names = ["Default", "Profile 1", "Profile 2", "Profile 3"];
  for (const name of names) {
    const file = path.join(userData, name, "Bookmarks");
    if (fs.existsSync(file)) files.push(file);
  }
  return files;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function stableId(guid: string | undefined, url: string): string {
  if (guid?.trim()) return `chrome:${guid.trim()}`;
  return `chrome:${createHash("sha1").update(url).digest("hex").slice(0, 16)}`;
}

function walk(
  node: ChromeNode | undefined,
  folders: string[],
  out: ItemDraft[]
): void {
  if (!node) return;
  if (node.type === "url") {
    const url = (node.url || "").trim();
    if (!url || url.startsWith("javascript:")) return;
    const folderPath = folders.filter(Boolean).join("/");
    const host = hostnameOf(url);
    const title = (node.name || host || url).trim();
    out.push({
      id: stableId(node.guid, url),
      title,
      type: "url",
      category: "收藏网址",
      tags: folderPath ? [folderPath] : [],
      url,
      keywords: [title, folderPath, host].filter(Boolean),
      summary: folderPath ? `${folderPath} · ${url}` : url,
      sourceKind: "url",
      sourceRaw: url
    });
    return;
  }
  const next = node.name ? [...folders, node.name] : folders;
  for (const child of node.children ?? []) walk(child, next, out);
}

function parseBookmarksFile(filePath: string): ItemDraft[] {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as ChromeBookmarksFile;
  const items: ItemDraft[] = [];
  const roots = raw.roots ?? {};
  for (const key of ["bookmark_bar", "other", "synced"] as const) {
    walk(roots[key], [ROOT_LABELS[key]], items);
  }
  return items;
}

async function pickBookmarksFile(): Promise<string | null> {
  const defaults = defaultBookmarkFiles();
  const result = await dialog.showOpenDialog({
    title: "选择 Chrome 的 Bookmarks 文件",
    defaultPath: defaults[0] || os.homedir(),
    properties: ["openFile"],
    filters: [{ name: "Chrome Bookmarks", extensions: ["", "json"] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
}

export async function importChromeBookmarks(
  onProgress?: (step: ChatStep) => void
): Promise<ImportResult & { ok: boolean; message: string }> {
  let files = defaultBookmarkFiles();
  if (files.length === 0) {
    const picked = await pickBookmarksFile();
    if (!picked) {
      return { ok: false, imported: 0, skipped: 0, overwritten: 0, message: "已取消导入" };
    }
    files = [picked];
  }

  const drafts: ItemDraft[] = [];
  const seenUrl = new Set<string>();
  for (const file of files) {
    try {
      for (const draft of parseBookmarksFile(file)) {
        const url = draft.url || "";
        if (!url || seenUrl.has(url)) continue;
        seenUrl.add(url);
        drafts.push(draft);
      }
    } catch (error) {
      return {
        ok: false,
        imported: 0,
        skipped: 0,
        overwritten: 0,
        message: `读不了书签文件：${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  let imported = 0;
  let skipped = 0;
  const created: CatalogItem[] = [];
  for (const draft of drafts) {
    if (getItem(draft.id || "") || getItemByUrl(draft.url || "")) {
      skipped += 1;
      continue;
    }
    created.push(upsertItem(draft));
    imported += 1;
  }

  let extra = "";
  if (created.length > 0) {
    onProgress?.({ title: "抓取网页简介", detail: `共 ${created.length} 条` });
    const enrich = await enrichUrlItems(created, onProgress);
    extra = `，补全 ${enrich.enriched} 条简介`;
    if (enrich.tagged) extra += `，标注 ${enrich.tagged} 条关键词`;
    if (enrich.failed) extra += `，${enrich.failed} 条网页没读到`;
  }

  return {
    ok: true,
    imported,
    skipped,
    overwritten: 0,
    message: `导入 Chrome 书签 ${imported} 条，跳过已有 ${skipped} 条${extra}`
  };
}

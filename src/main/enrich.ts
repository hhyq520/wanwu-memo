import type { CatalogItem, ChatStep, EnrichResult } from "@shared/types";
import { getItem, listItems, upsertItem } from "./catalog";
import { inspectUrl } from "./inspect";
import { tagPurposeKeywords } from "./llm/tag-keywords";

const FETCH_CONCURRENCY = 6;
const MAX_KEYWORDS = 24;

export function needsUrlEnrichment(item: CatalogItem): boolean {
  if (item.type !== "url" || !item.url.trim()) return false;
  if (!canFetchUrl(item.url)) return false;
  const summary = (item.summary || "").trim();
  if (!summary) return true;
  if (summary === item.url) return true;
  if (summary.includes(" · ") && summary.endsWith(item.url)) return true;
  return false;
}

export function listWeakUrlItems(): CatalogItem[] {
  return listItems().filter(needsUrlEnrichment);
}

export function canFetchUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export async function enrichUrlItems(
  items: CatalogItem[],
  onProgress?: (step: ChatStep) => void
): Promise<EnrichResult> {
  const targets = items.filter((item) => item.type === "url" && canFetchUrl(item.url));
  let enriched = 0;
  let failed = 0;
  let fetched = 0;

  await mapPool(targets, FETCH_CONCURRENCY, async (item) => {
    const page = await inspectUrl(item.url);
    fetched += 1;
    onProgress?.({
      title: "抓取网页简介",
      detail: `${fetched}/${targets.length}`
    });
    if (!page.ok) {
      failed += 1;
      return;
    }
    const description = (page.description || "").trim();
    const pageTitle = (page.title || "").trim();
    const extracted = uniqueWords([
      ...item.keywords,
      item.title,
      pageTitle,
      hostnameOf(item.url),
      ...item.tags,
      ...wordsFrom(description)
    ]);
    const summary = description || item.summary || pageTitle || item.url;
    upsertItem({
      ...item,
      title: item.title,
      type: item.type,
      summary,
      keywords: extracted.slice(0, MAX_KEYWORDS)
    });
    enriched += 1;
  });

  const fresh = targets
    .map((item) => getItem(item.id))
    .filter((item): item is CatalogItem => Boolean(item));
  const taggedMap = await tagPurposeKeywords(fresh, onProgress);
  let tagged = 0;
  for (const item of fresh) {
    const extra = taggedMap.get(item.id);
    if (!extra?.length) continue;
    const keywords = uniqueWords([...item.keywords, ...extra]).slice(0, MAX_KEYWORDS);
    upsertItem({
      ...item,
      title: item.title,
      type: item.type,
      keywords
    });
    tagged += 1;
  }

  return { enriched, failed, tagged };
}

export async function enrichWeakUrlItems(
  onProgress?: (step: ChatStep) => void
): Promise<EnrichResult & { ok: boolean; message: string }> {
  const weak = listWeakUrlItems();
  if (weak.length === 0) {
    return {
      ok: true,
      enriched: 0,
      failed: 0,
      tagged: 0,
      message: "没有需要补全的书签"
    };
  }
  onProgress?.({ title: "补全书签简介", detail: `共 ${weak.length} 条` });
  const result = await enrichUrlItems(weak, onProgress);
  return {
    ok: true,
    ...result,
    message: `补全 ${result.enriched} 条简介，标注 ${result.tagged} 条关键词${
      result.failed ? `，${result.failed} 条网页没读到` : ""
    }`
  };
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function wordsFrom(text: string): string[] {
  return text
    .split(/[\s,，、|·./_\-–—:：;；!?！？()（）[\]【】"'“”]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2 && part.length <= 32);
}

function uniqueWords(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const word = raw.trim();
    if (!word) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out;
}

async function mapPool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      await fn(items[index]);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) || 0 }, () => worker());
  await Promise.all(workers);
}

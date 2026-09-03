import type { ItemType } from "@shared/types";

export const TYPE_LABEL: Record<ItemType, string> = {
  app: "软件",
  project: "项目",
  url: "网址",
  note: "备忘"
};

export function accession(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

export function locationLine(item: {
  path?: string;
  url?: string;
  appName?: string;
  pathMissing?: boolean;
}): string {
  if (item.path) return item.pathMissing ? `${item.path}（路径不在这台电脑）` : item.path;
  if (item.url) return item.url;
  if (item.appName) return item.appName;
  return "";
}

export function cardLocationLine(item: {
  path?: string;
  url?: string;
  appName?: string;
  pathMissing?: boolean;
  summary?: string;
}): string {
  const loc = locationLine(item);
  if (!loc) return "";
  const summary = item.summary ?? "";
  if (summary === loc || (summary && summary.includes(loc))) return "";
  return loc;
}

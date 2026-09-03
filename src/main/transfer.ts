import { dialog } from "electron";
import fs from "node:fs";
import JSZip from "jszip";
import type { CatalogDump, CatalogItem, ImportResult } from "@shared/types";
import { listCategories, listItems, replaceAllItems } from "./catalog";

const SCHEMA_VERSION = 1;

export async function exportCatalog(): Promise<{ ok: boolean; filePath?: string; message: string }> {
  const result = await dialog.showSaveDialog({
    title: "导出万物备忘",
    defaultPath: `万物备忘-${new Date().toISOString().slice(0, 10)}.zip`,
    filters: [{ name: "Zip", extensions: ["zip"] }]
  });
  if (result.canceled || !result.filePath) {
    return { ok: false, message: "已取消导出" };
  }
  const dump: CatalogDump = {
    meta: { schemaVersion: SCHEMA_VERSION, exportedAt: Date.now(), app: "wanwu-memo" },
    items: listItems(),
    categories: listCategories()
  };
  const zip = new JSZip();
  zip.file("catalog.json", JSON.stringify(dump.items, null, 2));
  zip.file("meta.json", JSON.stringify(dump.meta, null, 2));
  zip.file("categories.json", JSON.stringify(dump.categories, null, 2));
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  fs.writeFileSync(result.filePath, buf);
  return { ok: true, filePath: result.filePath, message: `已导出 ${dump.items.length} 条` };
}

export async function importCatalog(
  mode: "merge" | "overwrite"
): Promise<ImportResult & { ok: boolean; message: string }> {
  const result = await dialog.showOpenDialog({
    title: "导入万物备忘",
    filters: [{ name: "Zip 或 JSON", extensions: ["zip", "json"] }],
    properties: ["openFile"]
  });
  if (result.canceled || !result.filePaths[0]) {
    return { ok: false, imported: 0, skipped: 0, overwritten: 0, message: "已取消导入" };
  }
  const file = result.filePaths[0];
  let items: CatalogItem[] = [];
  if (file.endsWith(".json")) {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as CatalogItem[] | CatalogDump;
    items = Array.isArray(parsed) ? parsed : parsed.items;
  } else {
    const zip = await JSZip.loadAsync(fs.readFileSync(file));
    const catalog = zip.file("catalog.json");
    if (!catalog) {
      return { ok: false, imported: 0, skipped: 0, overwritten: 0, message: "压缩包里没有 catalog.json" };
    }
    items = JSON.parse(await catalog.async("string")) as CatalogItem[];
  }
  const stats = replaceAllItems(items, mode);
  return {
    ok: true,
    ...stats,
    message: `导入 ${stats.imported}，覆盖 ${stats.overwritten}，跳过 ${stats.skipped}`
  };
}

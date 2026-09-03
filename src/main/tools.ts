import type { ItemDraft, ItemType, LaunchAction, SourceKind } from "@shared/types";
import { getItem, searchItems, upsertItem } from "./catalog";
import { inspectGit, inspectPath, inspectUrl, resolveApp } from "./inspect";
import { launchItem } from "./launcher";

export const TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "inspect_path",
      description: "只读查看本地路径：是否存在、顶层文件、README 与清单、猜测的启动命令。分析本地项目时必须先调用。",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "本地文件夹或文件路径" } },
        required: ["path"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "inspect_git",
      description: "只读查看 GitHub/GitLab 仓库的名称、描述和 README 摘要。不要 clone。",
      parameters: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "inspect_url",
      description: "只读抓取网页标题和描述。",
      parameters: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "resolve_app",
      description: "按软件名在本机查找已安装应用路径。记住本机软件时尽量调用。找不到也可以只凭名字入库。",
      parameters: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "search_items",
      description: "在已保存的记忆里模糊查找。用户在找东西时必须先调用，再根据结果列举并询问下一步。",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "关键词，可含同义词，空格分隔" } },
        required: ["query"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "propose_item",
      description:
        "提出一条待确认的记忆草稿。不会立刻写入。信息够了就调用；用户说确定之前不要 upsert。",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          type: { type: "string", enum: ["app", "project", "url", "note"] },
          category: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          keywords: { type: "array", items: { type: "string" } },
          appName: { type: "string" },
          path: { type: "string" },
          url: { type: "string" },
          launchCommand: { type: "string" },
          openWith: { type: "string", enum: ["cursor", "default", "app"] },
          body: { type: "string" },
          summary: { type: "string" },
          howto: { type: "string" },
          sourceKind: { type: "string", enum: ["app", "local_path", "git", "url", "text"] },
          sourceRaw: { type: "string" }
        },
        required: ["title", "type"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "upsert_item",
      description: "仅在用户明确说确定、保存、对之后，把草稿写入本地库。",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          type: { type: "string", enum: ["app", "project", "url", "note"] },
          category: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          keywords: { type: "array", items: { type: "string" } },
          appName: { type: "string" },
          path: { type: "string" },
          url: { type: "string" },
          launchCommand: { type: "string" },
          openWith: { type: "string", enum: ["cursor", "default", "app"] },
          body: { type: "string" },
          summary: { type: "string" },
          howto: { type: "string" },
          sourceKind: { type: "string", enum: ["app", "local_path", "git", "url", "text"] },
          sourceRaw: { type: "string" }
        },
        required: ["title", "type"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "open_item",
      description:
        "打开或运行已保存条目。必须先列举匹配项并得到用户同意（打开/要/1）后才能调用。",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          action: {
            type: "string",
            enum: ["open_app", "open_folder", "open_cursor", "open_url", "run_command"]
          }
        },
        required: ["id", "action"]
      }
    }
  }
];

export interface ToolRuntime {
  drafts: ItemDraft[];
  matches: ReturnType<typeof searchItems>;
}

function asDraft(args: Record<string, unknown>): ItemDraft {
  return {
    id: typeof args.id === "string" ? args.id : undefined,
    title: String(args.title || "未命名"),
    type: (args.type as ItemType) || "note",
    category: String(args.category || "未分类"),
    tags: Array.isArray(args.tags) ? args.tags.map(String) : [],
    keywords: Array.isArray(args.keywords) ? args.keywords.map(String) : [],
    appName: String(args.appName || ""),
    path: String(args.path || ""),
    url: String(args.url || ""),
    launchCommand: String(args.launchCommand || ""),
    openWith: (args.openWith as ItemDraft["openWith"]) || "default",
    body: String(args.body || ""),
    summary: String(args.summary || ""),
    howto: String(args.howto || ""),
    sourceKind: (args.sourceKind as SourceKind) || "text",
    sourceRaw: String(args.sourceRaw || "")
  };
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  runtime: ToolRuntime
): Promise<string> {
  switch (name) {
    case "inspect_path":
      return JSON.stringify(inspectPath(String(args.path || "")));
    case "inspect_git":
      return JSON.stringify(await inspectGit(String(args.url || "")));
    case "inspect_url":
      return JSON.stringify(await inspectUrl(String(args.url || "")));
    case "resolve_app":
      return JSON.stringify(await resolveApp(String(args.name || "")));
    case "search_items": {
      const matches = searchItems(String(args.query || ""));
      runtime.matches = mergeUnique(runtime.matches, matches);
      return JSON.stringify(
        matches.map((item, index) => ({
          n: index + 1,
          id: item.id,
          title: item.title,
          type: item.type,
          category: item.category,
          summary: item.summary,
          appName: item.appName,
          path: item.path,
          url: item.url,
          bodyPreview: item.body.slice(0, 160)
        }))
      );
    }
    case "propose_item": {
      const draft = asDraft(args);
      runtime.drafts.push(draft);
      return JSON.stringify({ ok: true, draft, note: "已生成确认卡，等用户确定后再 upsert" });
    }
    case "upsert_item": {
      const saved = upsertItem(asDraft(args));
      return JSON.stringify({ ok: true, item: saved });
    }
    case "open_item": {
      const id = String(args.id || "");
      const item = getItem(id);
      if (!item) return JSON.stringify({ ok: false, message: "条目不存在" });
      const result = await launchItem(id, args.action as LaunchAction);
      return JSON.stringify(result);
    }
    default:
      return JSON.stringify({ error: `未知工具 ${name}` });
  }
}

function mergeUnique<T extends { id: string }>(current: T[], extra: T[]): T[] {
  const map = new Map(current.map((x) => [x.id, x]));
  for (const item of extra) map.set(item.id, item);
  return [...map.values()];
}

export function cursorCustomTools(runtime: ToolRuntime) {
  const tools: Record<
    string,
    {
      description: string;
      inputSchema: Record<string, unknown>;
      execute: (args: Record<string, unknown>) => Promise<string>;
    }
  > = {};
  for (const def of TOOL_DEFINITIONS) {
    tools[def.function.name] = {
      description: def.function.description,
      inputSchema: def.function.parameters,
      async execute(args) {
        return executeTool(def.function.name, args ?? {}, runtime);
      }
    };
  }
  return tools;
}

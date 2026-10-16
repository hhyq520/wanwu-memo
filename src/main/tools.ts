import { stampReminder } from "@shared/remind";
import type { ChatStep, ItemDraft, ItemType, SourceKind } from "@shared/types";
import { rankItemsByQuery, searchItems, upsertItem } from "./catalog";
import { inspectGit, inspectPath, inspectUrl, resolveApp } from "./inspect";

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
      description:
        "按软件名在本机查找已安装应用路径。记住本机软件时尽量调用。参数填软件名，如 VidBee。name / query / appName 任一即可。只有真正扫过本机仍找不到，才可以只凭名字入库。",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "软件名，如 VidBee" },
          query: { type: "string", description: "软件名别名，与 name 相同" },
          appName: { type: "string", description: "软件名别名，与 name 相同" }
        }
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "search_items",
      description:
        "在已保存的记忆里模糊查找，结果已按匹配度从高到低排列。用户在找东西时必须先调用。用途/需求类问题要连搜 2 到 4 次：原句、中英同义词、常见产品名或域名。只根据返回结果列举，顺序与编号保持一致，不要编造未搜到的条目。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "一次一个检索式。可含同义词，空格分隔。例：AI 设计网站 / AI design / v0 midjourney"
          }
        },
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
          sourceRaw: { type: "string" },
          remindKind: {
            type: "string",
            enum: ["none", "year", "date", "at"],
            description:
              "none 不提醒；year 满一年的前一天；date 指定日期的前一天；at 在说定的时刻提醒，时长不限。"
          },
          remindDate: {
            type: "string",
            description:
              "date 时写 YYYY-MM-DD，是要记住的那一天。at 时写触发时刻的毫秒时间戳。"
          }
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
          sourceRaw: { type: "string" },
          remindKind: {
            type: "string",
            enum: ["none", "year", "date", "at"],
            description:
              "none 不提醒；year 满一年的前一天；date 指定日期的前一天；at 在说定的时刻提醒，时长不限。"
          },
          remindDate: {
            type: "string",
            description:
              "date 时写 YYYY-MM-DD，是要记住的那一天。at 时写触发时刻的毫秒时间戳。"
          }
        },
        required: ["title", "type"]
      }
    }
  }
];

export interface ToolRuntime {
  drafts: ItemDraft[];
  matches: ReturnType<typeof searchItems>;
  steps: ChatStep[];
  onStep?: (step: ChatStep) => void;
  userText?: string;
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function parseObject(text: string): Record<string, unknown> | unknown[] | null {
  try {
    const value = JSON.parse(text) as unknown;
    if (value && typeof value === "object") return value as Record<string, unknown> | unknown[];
    return null;
  } catch {
    return null;
  }
}

function describeTool(name: string, args: Record<string, unknown>, output: string): ChatStep {
  const data = parseObject(output);
  const obj = data && !Array.isArray(data) ? data : null;
  switch (name) {
    case "resolve_app": {
      const needle = firstText(args.name, args.query, args.appName, obj?.name);
      if (obj?.error === "missing name") {
        return { title: "按软件名查找", detail: "参数空了，还没扫本机" };
      }
      if (obj?.found && obj.path) {
        return { title: `按软件名查找 ${needle}`, detail: `找到 ${String(obj.path)}` };
      }
      return { title: `按软件名查找 ${needle || "（未给名）"}`, detail: "本机没搜到匹配路径" };
    }
    case "inspect_path": {
      const p = firstText(args.path, obj?.path);
      return {
        title: `查看本地路径 ${p}`,
        detail: obj?.exists ? "路径存在" : "路径不存在"
      };
    }
    case "inspect_git": {
      const url = firstText(args.url, obj?.url);
      return {
        title: `查看仓库 ${url}`,
        detail: obj?.ok ? String(obj.name || obj.description || "已读到简介") : String(obj?.error || "没读到")
      };
    }
    case "inspect_url": {
      const url = firstText(args.url, obj?.url);
      return {
        title: `抓取网页 ${url}`,
        detail: obj?.ok ? String(obj.title || "已读到标题") : String(obj?.error || "没读到")
      };
    }
    case "search_items": {
      const q = firstText(args.query);
      const count = Array.isArray(data) ? data.length : 0;
      return { title: `在记忆里搜「${q}」`, detail: count ? `找到 ${count} 条` : "没有匹配" };
    }
    case "propose_item": {
      const dataObj = obj;
      const pathHint = firstText(
        args.path,
        dataObj && "draft" in dataObj
          ? (dataObj.draft as { path?: string } | undefined)?.path
          : undefined
      );
      return {
        title: `生成确认卡「${firstText(args.title) || "未命名"}」`,
        detail: pathHint ? `路径 ${pathHint}` : undefined
      };
    }
    case "upsert_item":
      return { title: `写入「${firstText(args.title) || "未命名"}」` };
    default:
      return { title: `调用 ${name}` };
  }
}

function pushStep(runtime: ToolRuntime, step: ChatStep): void {
  runtime.steps.push(step);
  runtime.onStep?.(step);
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
    sourceRaw: String(args.sourceRaw || ""),
    ...reminderArgs(args)
  };
}

function reminderArgs(args: Record<string, unknown>): Partial<ItemDraft> {
  const patch: Partial<ItemDraft> = {};
  if (args.remindKind === "none" || args.remindKind === "year" || args.remindKind === "date" || args.remindKind === "at") {
    patch.remindKind = args.remindKind;
  }
  if (typeof args.remindDate === "string") patch.remindDate = args.remindDate.trim();
  return patch;
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  runtime: ToolRuntime
): Promise<string> {
  const output = await runTool(name, args, runtime);
  pushStep(runtime, describeTool(name, args, output));
  return output;
}

async function runTool(
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
    case "resolve_app": {
      const needle = firstText(args.name, args.query, args.appName);
      if (!needle) {
        return JSON.stringify({ name: "", found: false, candidates: [], error: "missing name" });
      }
      return JSON.stringify(await resolveApp(needle));
    }
    case "search_items": {
      const query = String(args.query || "");
      const matches = searchItems(query);
      runtime.matches = rankItemsByQuery(
        mergeUnique(runtime.matches, matches),
        runtime.userText || query
      );
      return JSON.stringify(
        rankItemsByQuery(matches, runtime.userText || query).map((item, index) => ({
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
      if (draft.type === "app" && !draft.path) {
        const resolved = await resolveApp(draft.appName || draft.title);
        if (resolved.found && resolved.path) {
          draft.path = resolved.path;
          draft.appName = draft.appName || resolved.name;
        }
      }
      runtime.drafts.push(draft);
      return JSON.stringify({ ok: true, draft, note: "已生成确认卡，等用户确定后再 upsert" });
    }
    case "upsert_item": {
      const stamped = stampReminder(runtime.userText || "", asDraft(args));
      const saved = upsertItem(stamped.draft);
      return JSON.stringify({ ok: true, item: saved, note: stamped.note || undefined });
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

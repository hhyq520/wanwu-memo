import type { ItemDraft, ItemType } from "@shared/types";
import { inspectPath } from "../inspect";
import { searchItems } from "../catalog";
import type { ToolRuntime } from "../tools";

const REMEMBER_RE = /记住|记一下|存下来|帮我记|记下/;
const APP_RE = /软件|应用|app|安装了/i;
const URL_RE = /https?:\/\/[^\s]+/i;
const PATH_RE = /(\/[^\s]+|[A-Za-z]:\\[^\s]+|~\/[^\s]+)/;
const GIT_RE = /(?:git@|https?:\/\/)(?:github|gitlab)\.com[^\s]+/i;

export function runLocalFallback(userText: string): {
  text: string;
  drafts: ItemDraft[];
  matches: ToolRuntime["matches"];
} {
  const text = userText.trim();
  const remember = REMEMBER_RE.test(text);
  const url = text.match(URL_RE)?.[0];
  const git = text.match(GIT_RE)?.[0];
  const pathMatch = text.match(PATH_RE)?.[0];

  if (!remember) {
    const matches = searchItems(text);
    if (matches.length === 0) {
      return {
        text: "本地检索没有找到。设置里填上模型密钥后，我可以帮你分析再记、再找。",
        drafts: [],
        matches: []
      };
    }
    const lines = matches.map(
      (item, i) => `${i + 1}. ${item.title}（${typeLabel(item.type)}）${item.summary ? ` — ${item.summary}` : ""}`
    );
    const ask =
      matches.length === 1
        ? `要我帮你${actionHint(matches[0].type)}「${matches[0].title}」吗？`
        : "要我帮你打开哪一个？回复编号，或说不用。";
    return { text: `找到这些：\n${lines.join("\n")}\n\n${ask}`, drafts: [], matches };
  }

  if (APP_RE.test(text)) {
    const name =
      text.match(/名字叫\s*([^\s,，。]+)/)?.[1] ||
      text.match(/叫\s*([^\s,，。]+)/)?.[1] ||
      "未命名软件";
    const draft: ItemDraft = {
      title: name,
      type: "app",
      category: "软件",
      appName: name,
      sourceKind: "app",
      sourceRaw: text,
      body: text,
      summary: text.replace(REMEMBER_RE, "").trim(),
      keywords: extractKeywords(text).concat(name)
    };
    return {
      text: "还没配置模型，我按字面整理了一张确认卡。核对软件名后点保存。设置密钥后我可以先在本机帮你找这个软件。",
      drafts: [draft],
      matches: []
    };
  }

  if (git) {
    return {
      text: "识别到 git 地址。没有模型时我无法拉 README，确认卡请你补全简介后保存。",
      drafts: [
        {
          title: git.split("/").filter(Boolean).pop() || git,
          type: "project",
          category: "开发",
          url: git,
          sourceKind: "git",
          sourceRaw: git,
          keywords: extractKeywords(text)
        }
      ],
      matches: []
    };
  }

  if (url) {
    return {
      text: "识别到网址。没有模型时只能先记下地址，确认后保存。",
      drafts: [
        {
          title: url,
          type: "url",
          category: "收藏网址",
          url,
          sourceKind: "url",
          sourceRaw: url,
          keywords: extractKeywords(text)
        }
      ],
      matches: []
    };
  }

  if (pathMatch) {
    const inspected = inspectPath(pathMatch);
    return {
      text: inspected.exists
        ? "识别到本地路径，并读了目录。没有模型，简介需要你看一眼再保存。"
        : "这个路径现在不存在。仍可以先存下来，换机导入后会标红。",
      drafts: [
        {
          title: pathMatch.split(/[\\/]/).filter(Boolean).pop() || pathMatch,
          type: "project",
          category: "开发",
          path: inspected.path || pathMatch,
          launchCommand: inspected.guessedCommand || "",
          sourceKind: "local_path",
          sourceRaw: pathMatch,
          summary: inspected.readme?.split("\n").find((l) => l.trim()) || "",
          keywords: extractKeywords(text)
        }
      ],
      matches: []
    };
  }

  return {
    text: "按原文记一条备忘。没有模型时关键词比较粗，确认后保存。",
    drafts: [
      {
        title: text.slice(0, 24),
        type: "note",
        category: "备忘",
        body: text.replace(REMEMBER_RE, "").trim() || text,
        sourceKind: "text",
        sourceRaw: text,
        keywords: extractKeywords(text)
      }
    ],
    matches: []
  };
}

function typeLabel(type: ItemType): string {
  return { app: "本机软件", project: "项目", url: "网址", note: "备忘" }[type];
}

function actionHint(type: ItemType): string {
  return { app: "打开", project: "打开", url: "在浏览器打开", note: "复制" }[type];
}

function extractKeywords(text: string): string[] {
  return [...new Set(text.split(/[\s,，、。！？]+/).filter((w) => w.length >= 2))].slice(0, 12);
}

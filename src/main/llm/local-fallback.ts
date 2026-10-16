import { stampReminder } from "@shared/remind";
import type { ChatStep, ItemDraft, ItemType } from "@shared/types";
import { cleanAppName, inspectPath, resolveApp } from "../inspect";
import { searchItems } from "../catalog";
import type { ToolRuntime } from "../tools";

const REMEMBER_RE = /记住|记一下|存下来|帮我记|记下/;
const APP_RE = /软件|应用|app|安装了/i;
const URL_RE = /https?:\/\/[^\s]+/i;
const PATH_RE = /(\/[^\s]+|[A-Za-z]:\\[^\s]+|~\/[^\s]+)/;
const GIT_RE = /(?:git@|https?:\/\/)(?:github|gitlab)\.com[^\s]+/i;

export async function runLocalFallback(
  userText: string,
  onStep?: (step: ChatStep) => void
): Promise<{
  text: string;
  drafts: ItemDraft[];
  matches: ToolRuntime["matches"];
  steps: ChatStep[];
}> {
  const text = userText.trim();
  const remember = REMEMBER_RE.test(text);
  const url = text.match(URL_RE)?.[0];
  const git = text.match(GIT_RE)?.[0];
  const pathMatch = text.match(PATH_RE)?.[0];

  const steps: ChatStep[] = [];
  const emit = (step: ChatStep) => {
    steps.push(step);
    onStep?.(step);
  };
  const finish = (reply: string, drafts: ItemDraft[], matches: ToolRuntime["matches"]) => {
    const stamped = drafts.map((draft) => stampReminder(text, draft));
    const note = stamped.find((item) => item.note)?.note;
    return {
      text: note && !reply.includes(note) ? `${reply}\n\n${note}` : reply,
      drafts: stamped.map((item) => item.draft),
      matches,
      steps
    };
  };

  if (!remember) {
    emit({ title: `在记忆里搜「${text}」` });
    const matches = searchItems(text);
    if (matches.length === 0) {
      return finish("本地检索没有找到。设置里填上模型密钥后，我可以帮你分析再记、再找。", [], []);
    }
    const lines = matches.map(
      (item, i) => `${i + 1}. ${item.title}（${typeLabel(item.type)}）${item.summary ? ` — ${item.summary}` : ""}`
    );
    const ask =
      matches.length === 1
        ? `要我帮你${actionHint(matches[0].type)}「${matches[0].title}」吗？`
        : "要我帮你打开哪一个？回复编号，或说不用。";
    emit({ title: `找到 ${matches.length} 条` });
    return finish(`找到这些：\n${lines.join("\n")}\n\n${ask}`, [], matches);
  }

  const named =
    text.match(/名字叫\s*([^\s,，。]+)/)?.[1] ||
    text.match(/记住[：:]\s*([^\s,，。]+)/)?.[1] ||
    text.match(/叫\s*([^\s,，。]+)/)?.[1];
  if (APP_RE.test(text) || named) {
    const name = cleanAppName(named || text) || "未命名软件";
    emit({ title: `按软件名查找 ${name}` });
    const resolved = await resolveApp(name);
    const draft: ItemDraft = {
      title: name,
      type: "app",
      category: "软件",
      appName: name,
      path: resolved.path || "",
      sourceKind: "app",
      sourceRaw: text,
      body: text,
      summary: text.replace(REMEMBER_RE, "").trim(),
      keywords: extractKeywords(text).concat(name)
    };
    emit({
      title: `按软件名查找 ${name}`,
      detail: resolved.found && resolved.path ? `找到 ${resolved.path}` : "本机没搜到匹配路径"
    });
    return finish(
      resolved.path
        ? `找到了 ${resolved.path}，看确认卡后点保存。`
        : "本机没搜到安装路径，先按软件名做成确认卡，你可以补路径再保存。",
      [draft],
      []
    );
  }

  if (git) {
    return finish("识别到 git 地址。没有模型时我无法拉 README，确认卡请你补全简介后保存。", [
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
      []
    );
  }

  if (url) {
    return finish("识别到网址。没有模型时只能先记下地址，确认后保存。", [
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
      []
    );
  }

  if (pathMatch) {
    const inspected = inspectPath(pathMatch);
    return finish(
      inspected.exists
        ? "识别到本地路径，并读了目录。没有模型，简介需要你看一眼再保存。"
        : "这个路径现在不存在。仍可以先存下来，换机导入后会标红。",
      [
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
      []
    );
  }

  return finish("按原文记一条备忘。没有模型时关键词比较粗，确认后保存。", [
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
    []
  );
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

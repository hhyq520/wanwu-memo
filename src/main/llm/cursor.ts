import type { ChatMessage, ChatStep, ItemDraft } from "@shared/types";
import { cursorCustomTools, type ToolRuntime } from "../tools";
import { sandboxCwd } from "../settings";
import { privacySource } from "@shared/privacy";
import { SYSTEM_PROMPT } from "./system-prompt";

export async function runCursorAgent(options: {
  model: string;
  apiKey: string;
  history: ChatMessage[];
  userText: string;
  onStep?: (step: ChatStep) => void;
}): Promise<{ text: string; drafts: ItemDraft[]; matches: ToolRuntime["matches"]; steps: ChatStep[] }> {
  const { Agent, CursorAgentError } = await import("@cursor/sdk");
  const runtime: ToolRuntime = {
    drafts: [],
    matches: [],
    steps: [],
    onStep: options.onStep,
    userText: options.userText,
    lockText: privacySource(
      options.history.filter((msg) => msg.role === "user").map((msg) => msg.content),
      options.userText
    )
  };
  runtime.onStep?.({ title: "正在调用模型" });
  runtime.steps.push({ title: "正在调用模型" });
  const prior = options.history
    .slice(-8)
    .map((msg) => `${msg.role === "user" ? "用户" : "助手"}: ${msg.content}`)
    .join("\n");
  const prompt = `${SYSTEM_PROMPT}\n\n最近对话：\n${prior || "（无）"}\n\n用户：${options.userText}`;

  try {
    const agent = await Agent.create({
      apiKey: options.apiKey,
      model: { id: options.model || "composer-2.5" },
      disallowedTools: ["shell", "edit", "task"],
      local: {
        cwd: sandboxCwd(),
        customTools: cursorCustomTools(runtime)
      }
    });
    try {
      const run = await agent.send(prompt);
      const result = await run.wait();
      if (result.status === "error") {
        return {
          text: "Cursor 这一轮执行失败。可换 DeepSeek / 智谱再试。",
          drafts: runtime.drafts,
          matches: runtime.matches,
          steps: runtime.steps
        };
      }
      const text =
        (result as { result?: string }).result?.trim() ||
        "已处理。看上面的确认卡或列表。";
      return { text, drafts: runtime.drafts, matches: runtime.matches, steps: runtime.steps };
    } finally {
      await agent[Symbol.asyncDispose]();
    }
  } catch (error) {
    if (error instanceof CursorAgentError) {
      return {
        text: `Cursor 没能启动：${error.message}`,
        drafts: [],
        matches: [],
        steps: runtime.steps
      };
    }
    throw error;
  }
}

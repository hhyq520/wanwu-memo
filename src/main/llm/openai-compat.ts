import OpenAI from "openai";
import type { ChatMessage, ChatStep, ItemDraft } from "@shared/types";
import { PROVIDER_DEFAULTS, type ProviderId } from "@shared/types";
import { executeTool, TOOL_DEFINITIONS, type ToolRuntime } from "../tools";
import { SYSTEM_PROMPT } from "./system-prompt";

type CompatProvider = Exclude<ProviderId, "cursor">;

export async function runOpenAICompat(options: {
  provider: CompatProvider;
  model: string;
  apiKey: string;
  history: ChatMessage[];
  userText: string;
  onStep?: (step: ChatStep) => void;
}): Promise<{ text: string; drafts: ItemDraft[]; matches: ToolRuntime["matches"]; steps: ChatStep[] }> {
  const spec = PROVIDER_DEFAULTS[options.provider];
  const client = new OpenAI({
    apiKey: options.apiKey,
    baseURL: spec.baseURL
  });

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...options.history.slice(-16).map((msg) => ({
      role: msg.role,
      content: msg.content
    })),
    { role: "user", content: options.userText }
  ];

  const runtime: ToolRuntime = {
    drafts: [],
    matches: [],
    steps: [],
    onStep: options.onStep,
    userText: options.userText
  };
  const tools = TOOL_DEFINITIONS as OpenAI.Chat.ChatCompletionTool[];
  runtime.onStep?.({ title: "正在调用模型" });
  runtime.steps.push({ title: "正在调用模型" });

  for (let step = 0; step < 8; step += 1) {
    const completion = await client.chat.completions.create({
      model: options.model,
      messages,
      tools,
      tool_choice: "auto"
    });
    const choice = completion.choices[0];
    const message = choice?.message;
    if (!message) break;
    messages.push(message);

    const calls = message.tool_calls ?? [];
    if (calls.length === 0 || choice.finish_reason === "stop") {
      return {
        text: message.content?.trim() || "好。",
        drafts: runtime.drafts,
        matches: runtime.matches,
        steps: runtime.steps
      };
    }

    for (const call of calls) {
      if (call.type !== "function") continue;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
      } catch {
        args = {};
      }
      const output = await executeTool(call.function.name, args, runtime);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: output
      });
    }
  }

  return {
    text: "这一轮分析被打断了。再说一次你要记什么，或要找什么。",
    drafts: runtime.drafts,
    matches: runtime.matches,
    steps: runtime.steps
  };
}

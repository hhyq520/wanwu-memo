import type { ChatTurnResult } from "@shared/types";
import { addMessage, getOrCreateConversation, listMessages } from "../conversations";
import { getApiKey, getSettings } from "../settings";
import { runCursorAgent } from "./cursor";
import { runLocalFallback } from "./local-fallback";
import { runOpenAICompat } from "./openai-compat";

export async function handleChat(conversationId: string | undefined, userText: string): Promise<ChatTurnResult> {
  const convo = getOrCreateConversation(conversationId);
  const history = listMessages(convo.id);
  const userMessage = addMessage(convo.id, "user", userText);
  const settings = getSettings();
  const apiKey = getApiKey();

  let result: { text: string; drafts: ChatTurnResult["assistantMessage"]["drafts"]; matches: ChatTurnResult["assistantMessage"]["matches"] };

  try {
    if (!apiKey) {
      result = runLocalFallback(userText);
    } else if (settings.provider === "cursor") {
      result = await runCursorAgent({
        model: settings.model,
        apiKey,
        history,
        userText
      });
    } else {
      result = await runOpenAICompat({
        provider: settings.provider,
        model: settings.model,
        apiKey,
        history,
        userText
      });
    }
  } catch (error) {
    result = {
      text: error instanceof Error ? `调用模型失败：${error.message}` : "调用模型失败",
      drafts: [],
      matches: []
    };
  }

  const assistantMessage = addMessage(convo.id, "assistant", result.text, {
    drafts: result.drafts,
    matches: result.matches
  });

  return { conversationId: convo.id, userMessage, assistantMessage };
}

import { stampReminder } from "@shared/remind";
import type { ChatStep, ChatTurnResult, ItemDraft } from "@shared/types";
import { rankItemsByQuery } from "../catalog";
import { addMessage, getOrCreateConversation, listMessages } from "../conversations";
import { getApiKey, getSettings } from "../settings";
import { runCursorAgent } from "./cursor";
import { runLocalFallback } from "./local-fallback";
import { runOpenAICompat } from "./openai-compat";

export async function handleChat(
  conversationId: string | undefined,
  userText: string,
  onStep?: (step: ChatStep) => void
): Promise<ChatTurnResult> {
  const convo = getOrCreateConversation(conversationId);
  const history = listMessages(convo.id);
  const userMessage = addMessage(convo.id, "user", userText);
  const settings = getSettings();
  const apiKey = getApiKey();

  let result: {
    text: string;
    drafts: ChatTurnResult["assistantMessage"]["drafts"];
    matches: ChatTurnResult["assistantMessage"]["matches"];
    steps: ChatStep[];
  };

  try {
    if (!apiKey) {
      result = await runLocalFallback(userText, onStep);
    } else if (settings.provider === "cursor") {
      result = await runCursorAgent({
        model: settings.model,
        apiKey,
        history,
        userText,
        onStep
      });
    } else {
      result = await runOpenAICompat({
        provider: settings.provider,
        model: settings.model,
        apiKey,
        history,
        userText,
        onStep
      });
    }
  } catch (error) {
    result = {
      text: error instanceof Error ? `调用模型失败：${error.message}` : "调用模型失败",
      drafts: [],
      matches: [],
      steps: []
    };
  }

  const reminded = applyReminder(userText, result.drafts, result.text);
  result = { ...result, text: reminded.text, drafts: reminded.drafts };

  const assistantMessage = addMessage(convo.id, "assistant", result.text, {
    drafts: result.drafts,
    matches: rankItemsByQuery(result.matches ?? [], userText),
    steps: result.steps
  });

  return { conversationId: convo.id, userMessage, assistantMessage };
}

function applyReminder(
  userText: string,
  drafts: ItemDraft[] | undefined,
  text: string
): { drafts: ItemDraft[] | undefined; text: string } {
  if (!drafts?.length) return { drafts, text };
  const stamped = drafts.map((draft) => stampReminder(userText, draft));
  const note = stamped.find((item) => item.note)?.note;
  return {
    drafts: stamped.map((item) => item.draft),
    text: note && !text.includes(note) ? `${text}\n\n${note}` : text
  };
}

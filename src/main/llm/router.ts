import { privacySource, stampPrivacy, vaultIntent } from "@shared/privacy";
import { stampReminder } from "@shared/remind";
import type { ChatStep, ChatTurnResult, ItemDraft } from "@shared/types";
import { rankItemsByQuery } from "../catalog";
import { addMessage, getOrCreateConversation, listMessages } from "../conversations";
import { getApiKey, getSettings } from "../settings";
import { authenticateVault, isVaultOpen, setVaultOpen } from "../vault";
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
  const lockText = privacySource(
    history.filter((msg) => msg.role === "user").map((msg) => msg.content),
    userText
  );
  const locked = applyPrivacy(lockText, reminded.drafts, reminded.text);
  result = { ...result, text: locked.text, drafts: locked.drafts };
  const vault = await applyVault(userText, result);
  if (vault) result = { ...result, text: vault.text };

  const assistantMessage = addMessage(convo.id, "assistant", result.text, {
    drafts: result.drafts,
    matches: rankItemsByQuery(result.matches ?? [], userText),
    steps: result.steps
  });

  return { conversationId: convo.id, userMessage, assistantMessage, vault: vault?.state };
}

function applyPrivacy(
  userText: string,
  drafts: ItemDraft[] | undefined,
  text: string
): { drafts: ItemDraft[] | undefined; text: string } {
  if (!drafts?.length) return { drafts, text };
  const stamped = drafts.map((draft) => stampPrivacy(userText, draft));
  const note = stamped.find((item) => item.note)?.note;
  return {
    drafts: stamped.map((item) => item.draft),
    text: note && !text.includes(note) ? `${text}\n\n${note}` : text
  };
}

async function applyVault(
  userText: string,
  result: { text: string; drafts?: ItemDraft[] }
): Promise<{ text: string; state: NonNullable<ChatTurnResult["vault"]> } | null> {
  const intent = vaultIntent(userText);
  if (!intent) return null;
  const ok = await authenticateVault(intent === "show" ? "显示锁起来的卡片" : "隐藏锁起来的卡片");
  if (ok) setVaultOpen(intent === "show");
  const note = ok
    ? intent === "show"
      ? "已通过验证，锁起来的卡片现在显示在原来的分类里。"
      : "已通过验证，锁起来的卡片已隐藏。"
    : "没验证，还是保持原样。";
  const text = result.drafts?.length ? `${result.text}\n\n${note}` : note;
  return { text, state: { visible: isVaultOpen(), changed: ok } };
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

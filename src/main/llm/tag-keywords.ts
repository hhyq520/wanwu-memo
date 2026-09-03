import OpenAI from "openai";
import type { CatalogItem, ChatStep } from "@shared/types";
import { PROVIDER_DEFAULTS } from "@shared/types";
import { getApiKey, getSettings } from "../settings";

const BATCH = 16;

export async function tagPurposeKeywords(
  items: CatalogItem[],
  onProgress?: (step: ChatStep) => void
): Promise<Map<string, string[]>> {
  const tagged = new Map<string, string[]>();
  if (items.length === 0) return tagged;

  const settings = getSettings();
  const apiKey = getApiKey();
  if (!apiKey || settings.provider === "cursor") return tagged;

  const spec = PROVIDER_DEFAULTS[settings.provider];
  const client = new OpenAI({
    apiKey,
    baseURL: spec.baseURL
  });

  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    onProgress?.({
      title: "标注关键词",
      detail: `${Math.min(i + BATCH, items.length)}/${items.length}`
    });
    try {
      const extra = await tagBatch(client, settings.model, batch);
      for (const [id, words] of extra) tagged.set(id, words);
    } catch {
      // 单批失败不影响其余
    }
  }
  return tagged;
}

async function tagBatch(
  client: OpenAI,
  model: string,
  batch: CatalogItem[]
): Promise<Map<string, string[]>> {
  const payload = batch.map((item) => ({
    id: item.id,
    title: item.title,
    url: item.url,
    summary: item.summary.slice(0, 240)
  }));
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "你是关键词标注员。根据标题、网址、网页描述，给每条生成 4 到 8 个中文用途词和英文别名，方便以后按「我需要一个xx」找到。只输出 JSON 数组，不要 markdown。格式：[{\"id\":\"...\",\"keywords\":[\"AI设计\",\"设计网站\"]}]。不要编造页面没有的功能。"
      },
      {
        role: "user",
        content: JSON.stringify(payload)
      }
    ]
  });
  const text = completion.choices[0]?.message?.content?.trim() || "[]";
  return parseKeywordMap(text);
}

function parseKeywordMap(text: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const json = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return out;
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const id = String((row as { id?: unknown }).id || "");
      const keywords = (row as { keywords?: unknown }).keywords;
      if (!id || !Array.isArray(keywords)) continue;
      const words = keywords.map(String).map((w) => w.trim()).filter((w) => w.length >= 2 && w.length <= 24);
      if (words.length) out.set(id, words);
    }
  } catch {
    return out;
  }
  return out;
}

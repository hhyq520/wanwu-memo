import { randomUUID } from "node:crypto";
import type { ChatMessage, Conversation, ItemDraft, CatalogItem } from "@shared/types";
import { getDb } from "./db";

interface ConversationRow {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  extra: string;
  created_at: number;
}

function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function listConversations(): Conversation[] {
  return (getDb()
    .prepare("SELECT * FROM conversations ORDER BY updated_at DESC")
    .all() as ConversationRow[]).map(toConversation);
}

export function getOrCreateConversation(id?: string): Conversation {
  const db = getDb();
  if (id) {
    const found = db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as
      | ConversationRow
      | undefined;
    if (found) return toConversation(found);
  }
  const latest = db
    .prepare("SELECT * FROM conversations ORDER BY updated_at DESC LIMIT 1")
    .get() as ConversationRow | undefined;
  if (latest && !id) return toConversation(latest);
  const now = Date.now();
  const convo: Conversation = {
    id: randomUUID(),
    title: "新对话",
    createdAt: now,
    updatedAt: now
  };
  db.prepare(
    "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)"
  ).run(convo.id, convo.title, convo.createdAt, convo.updatedAt);
  return convo;
}

export function listMessages(conversationId: string): ChatMessage[] {
  const rows = getDb()
    .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC")
    .all(conversationId) as MessageRow[];
  return rows.map((row) => {
    let extra: { drafts?: ItemDraft[]; matches?: CatalogItem[]; steps?: ChatMessage["steps"] } = {};
    try {
      extra = JSON.parse(row.extra);
    } catch {
      extra = {};
    }
    return {
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role as "user" | "assistant",
      content: row.content,
      drafts: extra.drafts,
      matches: extra.matches,
      steps: extra.steps,
      createdAt: row.created_at
    };
  });
}

export function addMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  extra?: { drafts?: ItemDraft[]; matches?: CatalogItem[]; steps?: ChatMessage["steps"] }
): ChatMessage {
  const db = getDb();
  const message: ChatMessage = {
    id: randomUUID(),
    conversationId,
    role,
    content,
    drafts: extra?.drafts,
    matches: extra?.matches,
    steps: extra?.steps,
    createdAt: Date.now()
  };
  db.prepare(
    "INSERT INTO messages (id, conversation_id, role, content, extra, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(
    message.id,
    conversationId,
    role,
    content,
    JSON.stringify({
      drafts: extra?.drafts ?? [],
      matches: extra?.matches ?? [],
      steps: extra?.steps ?? []
    }),
    message.createdAt
  );
  if (role === "user") {
    const title = content.replace(/\s+/g, " ").slice(0, 24) || "新对话";
    db.prepare("UPDATE conversations SET title = ?, updated_at = ? WHERE id = ? AND title = '新对话'").run(
      title,
      message.createdAt,
      conversationId
    );
  }
  db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(
    message.createdAt,
    conversationId
  );
  return message;
}

export function newConversation(): Conversation {
  return getOrCreateConversation(randomUUID());
}

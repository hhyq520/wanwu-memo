export const ITEM_TYPES = ["app", "project", "url", "note"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const SOURCE_KINDS = ["app", "local_path", "git", "url", "text"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const OPEN_WITH = ["cursor", "default", "app"] as const;
export type OpenWith = (typeof OPEN_WITH)[number];

export const PRESET_CATEGORIES = [
  "全部",
  "软件",
  "开发",
  "写作",
  "设计",
  "效率",
  "收藏网址",
  "备忘",
  "未分类"
] as const;

export const REMIND_KINDS = ["none", "year", "date", "at"] as const;
export type RemindKind = (typeof REMIND_KINDS)[number];

export type ProviderId = "cursor" | "deepseek" | "openai" | "zhipu";

export interface CatalogItem {
  id: string;
  title: string;
  type: ItemType;
  category: string;
  tags: string[];
  appName: string;
  path: string;
  url: string;
  launchCommand: string;
  openWith: OpenWith;
  body: string;
  summary: string;
  howto: string;
  keywords: string[];
  sourceKind: SourceKind;
  sourceRaw: string;
  createdAt: number;
  updatedAt: number;
  remindKind: RemindKind;
  remindDate: string;
  remindAt: number;
  remindDismissedAt: number;
  calendarEventId: string;
  pathMissing?: boolean;
}

export type ItemDraft = Partial<CatalogItem> & {
  title: string;
  type: ItemType;
};

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatStep {
  title: string;
  detail?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  drafts?: ItemDraft[];
  matches?: CatalogItem[];
  steps?: ChatStep[];
  createdAt: number;
}

export interface ChatTurnResult {
  conversationId: string;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
}

export interface AppSettings {
  provider: ProviderId;
  model: string;
  apiKeySet: boolean;
}

export interface AppSettingsInput {
  provider: ProviderId;
  model: string;
  apiKey?: string;
}

export interface ExportMeta {
  schemaVersion: number;
  exportedAt: number;
  app: string;
}

export interface CatalogDump {
  meta: ExportMeta;
  items: CatalogItem[];
  categories: string[];
}

export interface ImportResult {
  imported: number;
  skipped: number;
  overwritten: number;
}

export interface EnrichResult {
  enriched: number;
  failed: number;
  tagged: number;
}

export type LaunchAction =
  | "open_app"
  | "open_folder"
  | "open_cursor"
  | "open_url"
  | "run_command"
  | "copy_body";

export interface ReminderFeed {
  seq: number;
  items: CatalogItem[];
}

export interface LaunchResult {
  ok: boolean;
  message: string;
}

export interface InspectPathResult {
  exists: boolean;
  path: string;
  isDirectory: boolean;
  topFiles: string[];
  readme?: string;
  manifests: Record<string, unknown>;
  guessedCommand?: string;
  gitRemote?: string;
}

export interface InspectGitResult {
  ok: boolean;
  url: string;
  name?: string;
  description?: string;
  readme?: string;
  error?: string;
}

export interface InspectUrlResult {
  ok: boolean;
  url: string;
  title?: string;
  description?: string;
  error?: string;
}

export interface ResolveAppResult {
  name: string;
  found: boolean;
  path?: string;
  candidates: string[];
  error?: string;
}

export const PROVIDER_DEFAULTS: Record<
  ProviderId,
  { label: string; baseURL?: string; defaultModel: string }
> = {
  cursor: { label: "Cursor SDK", defaultModel: "composer-2.5" },
  deepseek: {
    label: "DeepSeek",
    baseURL: "https://api.deepseek.com",
    defaultModel: "deepseek-chat"
  },
  openai: { label: "OpenAI", defaultModel: "gpt-4.1" },
  zhipu: {
    label: "智谱 GLM",
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4-plus"
  }
};

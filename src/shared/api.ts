import type {
  AppSettings,
  AppSettingsInput,
  CatalogItem,
  ChatMessage,
  ChatStep,
  ChatTurnResult,
  Conversation,
  EnrichResult,
  ImportResult,
  ItemDraft,
  LaunchAction,
  LaunchResult,
  ReminderFeed
} from "./types";

export interface DesktopApi {
  catalog: {
    list: (category?: string) => Promise<CatalogItem[]>;
    get: (id: string) => Promise<CatalogItem | null>;
    search: (query: string) => Promise<CatalogItem[]>;
    upsert: (draft: ItemDraft) => Promise<CatalogItem>;
    delete: (id: string) => Promise<boolean>;
    categories: () => Promise<string[]>;
  };
  reminders: {
    list: () => Promise<ReminderFeed>;
    dismiss: (id: string) => Promise<ReminderFeed>;
    onDue: (cb: (feed: ReminderFeed) => void) => () => void;
  };
  chat: {
    send: (conversationId: string | undefined, text: string) => Promise<ChatTurnResult>;
    list: () => Promise<Conversation[]>;
    messages: (id?: string) => Promise<{ conversation: Conversation; messages: ChatMessage[] }>;
    new: () => Promise<{ conversation: Conversation; messages: ChatMessage[] }>;
    onStep: (cb: (step: ChatStep) => void) => () => void;
  };
  launch: {
    run: (id: string, action: LaunchAction) => Promise<LaunchResult>;
  };
  clipboard: {
    write: (text: string) => Promise<LaunchResult>;
  };
  settings: {
    get: () => Promise<AppSettings>;
    set: (input: AppSettingsInput) => Promise<AppSettings>;
  };
  transfer: {
    export: () => Promise<{ ok: boolean; filePath?: string; message: string }>;
    import: (mode: "merge" | "overwrite") => Promise<ImportResult & { ok: boolean; message: string }>;
    importChrome: () => Promise<ImportResult & { ok: boolean; message: string }>;
    enrichUrls: () => Promise<EnrichResult & { ok: boolean; message: string }>;
    onProgress: (cb: (step: ChatStep) => void) => () => void;
  };
}

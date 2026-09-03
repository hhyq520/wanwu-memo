import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSettingsInput,
  ChatStep,
  ItemDraft,
  LaunchAction
} from "../shared/types";

const api = {
  catalog: {
    list: (category?: string) => ipcRenderer.invoke("catalog:list", category),
    get: (id: string) => ipcRenderer.invoke("catalog:get", id),
    search: (query: string) => ipcRenderer.invoke("catalog:search", query),
    upsert: (draft: ItemDraft) => ipcRenderer.invoke("catalog:upsert", draft),
    delete: (id: string) => ipcRenderer.invoke("catalog:delete", id),
    categories: () => ipcRenderer.invoke("catalog:categories")
  },
  chat: {
    send: (conversationId: string | undefined, text: string) =>
      ipcRenderer.invoke("chat:send", conversationId, text),
    list: () => ipcRenderer.invoke("chat:list"),
    messages: (id?: string) => ipcRenderer.invoke("chat:messages", id),
    new: () => ipcRenderer.invoke("chat:new"),
    onStep: (cb: (step: ChatStep) => void) => {
      const listener = (_event: unknown, step: ChatStep) => cb(step);
      ipcRenderer.on("chat:step", listener);
      return () => {
        ipcRenderer.removeListener("chat:step", listener);
      };
    }
  },
  launch: {
    run: (id: string, action: LaunchAction) => ipcRenderer.invoke("launch:run", id, action)
  },
  clipboard: {
    write: (text: string) => ipcRenderer.invoke("clipboard:write", text)
  },
  inspect: {
    path: (p: string) => ipcRenderer.invoke("inspect:path", p),
    git: (url: string) => ipcRenderer.invoke("inspect:git", url),
    url: (url: string) => ipcRenderer.invoke("inspect:url", url),
    app: (name: string) => ipcRenderer.invoke("inspect:app", name)
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (input: AppSettingsInput) => ipcRenderer.invoke("settings:set", input)
  },
  transfer: {
    export: () => ipcRenderer.invoke("transfer:export"),
    import: (mode: "merge" | "overwrite") => ipcRenderer.invoke("transfer:import", mode),
    importChrome: () => ipcRenderer.invoke("transfer:importChrome")
  }
};

contextBridge.exposeInMainWorld("api", api);

export type DesktopApi = typeof api;

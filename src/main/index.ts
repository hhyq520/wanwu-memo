import { app, BrowserWindow, ipcMain, clipboard } from "electron";
import path from "node:path";
import { deleteItem, getItem, listCategories, listItems, searchItems, upsertItem } from "./catalog";
import { getOrCreateConversation, listConversations, listMessages, newConversation } from "./conversations";
import { closeDb, getDb } from "./db";
import { inspectGit, inspectPath, inspectUrl, resolveApp } from "./inspect";
import { launchItem } from "./launcher";
import { handleChat } from "./llm/router";
import { getSettings, setSettings } from "./settings";
import { exportCatalog, importCatalog } from "./transfer";
import type { AppSettingsInput, ItemDraft, LaunchAction } from "@shared/types";

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

function focusMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    focusMainWindow();
    return mainWindow;
  }

  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: "万物备忘",
    backgroundColor: "#243040",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  mainWindow = win;
  return win;
}

app.on("open-file", (event) => {
  event.preventDefault();
});

app.on("open-url", (event) => {
  event.preventDefault();
});

app.on("second-instance", () => {
  focusMainWindow();
});

app.whenReady().then(() => {
  getDb();
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow();
    else focusMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  closeDb();
});

function registerIpc(): void {
  ipcMain.handle("catalog:list", (_e, category?: string) => listItems(category));
  ipcMain.handle("catalog:get", (_e, id: string) => getItem(id));
  ipcMain.handle("catalog:search", (_e, query: string) => searchItems(query));
  ipcMain.handle("catalog:upsert", (_e, draft: ItemDraft) => upsertItem(draft));
  ipcMain.handle("catalog:delete", (_e, id: string) => deleteItem(id));
  ipcMain.handle("catalog:categories", () => listCategories());

  ipcMain.handle("chat:send", (e, conversationId: string | undefined, text: string) =>
    handleChat(conversationId, text, (step) => {
      e.sender.send("chat:step", step);
    })
  );
  ipcMain.handle("chat:list", () => listConversations());
  ipcMain.handle("chat:messages", (_e, id?: string) => {
    const convo = getOrCreateConversation(id);
    return { conversation: convo, messages: listMessages(convo.id) };
  });
  ipcMain.handle("chat:new", () => {
    const convo = newConversation();
    return { conversation: convo, messages: [] };
  });

  ipcMain.handle("launch:run", (_e, id: string, action: LaunchAction) => launchItem(id, action));
  ipcMain.handle("clipboard:write", (_e, text: string) => {
    clipboard.writeText(text);
    return { ok: true, message: "已复制" };
  });

  ipcMain.handle("inspect:path", (_e, p: string) => inspectPath(p));
  ipcMain.handle("inspect:git", (_e, url: string) => inspectGit(url));
  ipcMain.handle("inspect:url", (_e, url: string) => inspectUrl(url));
  ipcMain.handle("inspect:app", (_e, name: string) => resolveApp(name));

  ipcMain.handle("settings:get", () => getSettings());
  ipcMain.handle("settings:set", (_e, input: AppSettingsInput) => setSettings(input));

  ipcMain.handle("transfer:export", () => exportCatalog());
  ipcMain.handle("transfer:import", (_e, mode: "merge" | "overwrite") => importCatalog(mode));
}

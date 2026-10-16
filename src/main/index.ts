import { app, BrowserWindow, ipcMain, clipboard } from "electron";
import path from "node:path";
import { setReminderBadge } from "./badge";
import { removeItemCalendar, syncItemCalendar, syncUnlinkedCalendars } from "./calendar";
import {
  deleteItem,
  dismissReminder,
  getItem,
  listCategories,
  listDueReminders,
  listItems,
  nextReminderAt,
  searchItems,
  upsertItem
} from "./catalog";
import { getOrCreateConversation, listConversations, listMessages, newConversation } from "./conversations";
import { closeDb, getDb } from "./db";
import { inspectGit, inspectPath, inspectUrl, resolveApp } from "./inspect";
import { launchItem } from "./launcher";
import { handleChat } from "./llm/router";
import { getSettings, setSettings } from "./settings";
import { importChromeBookmarks } from "./chrome-bookmarks";
import { enrichWeakUrlItems } from "./enrich";
import { exportCatalog, importCatalog } from "./transfer";
import type { AppSettingsInput, ItemDraft, LaunchAction } from "@shared/types";

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let reminderTimer: NodeJS.Timeout | null = null;
let reminderSeq = 0;

function armReminderClock(): void {
  if (reminderTimer) clearTimeout(reminderTimer);
  const upcoming = nextReminderAt(Date.now());
  const wait = upcoming == null ? 60_000 : Math.max(200, upcoming - Date.now() + 50);
  reminderTimer = setTimeout(() => publishReminders(), Math.min(60_000, wait));
}

function publishReminders() {
  const feed = { seq: ++reminderSeq, items: listDueReminders() };
  setReminderBadge(feed.items.length, mainWindow);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("reminders:due", feed);
  armReminderClock();
  return feed;
}

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
  publishReminders();
  void syncUnlinkedCalendars();
  app.on("browser-window-focus", () => publishReminders());
  app.on("activate", () => {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow();
    else focusMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (reminderTimer) clearTimeout(reminderTimer);
  closeDb();
});

function registerIpc(): void {
  ipcMain.handle("catalog:list", (_e, category?: string) => listItems(category));
  ipcMain.handle("catalog:get", (_e, id: string) => getItem(id));
  ipcMain.handle("catalog:search", (_e, query: string) => searchItems(query));
  ipcMain.handle("catalog:upsert", async (_e, draft: ItemDraft) => {
    const item = upsertItem(draft);
    await syncItemCalendar(getItem(item.id) ?? item);
    publishReminders();
    return getItem(item.id) ?? item;
  });
  ipcMain.handle("catalog:delete", async (_e, id: string) => {
    const removed = deleteItem(id);
    await removeItemCalendar(id);
    publishReminders();
    return removed;
  });
  ipcMain.handle("catalog:categories", () => listCategories());
  ipcMain.handle("reminders:list", () => publishReminders());
  ipcMain.handle("reminders:dismiss", async (_e, id: string) => {
    dismissReminder(id);
    const item = getItem(id);
    if (item) await syncItemCalendar(item);
    return publishReminders();
  });

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
  ipcMain.handle("transfer:import", async (_e, mode: "merge" | "overwrite") => {
    const result = await importCatalog(mode);
    publishReminders();
    return result;
  });
  ipcMain.handle("transfer:importChrome", async (e) => {
    const result = await importChromeBookmarks((step) => {
      e.sender.send("transfer:progress", step);
    });
    publishReminders();
    return result;
  });
  ipcMain.handle("transfer:enrichUrls", (e) =>
    enrichWeakUrlItems((step) => {
      e.sender.send("transfer:progress", step);
    })
  );
}

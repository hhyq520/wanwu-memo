import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { shell } from "electron";
import type { CatalogItem, LaunchAction, LaunchResult } from "@shared/types";
import { getItem } from "./catalog";
import { sanitizeLaunchCommand } from "./inspect";
import { expandUserPath } from "./paths";

const execFileAsync = promisify(execFile);

function fail(message: string): LaunchResult {
  return { ok: false, message };
}

function ok(message: string): LaunchResult {
  return { ok: true, message };
}

function normalizeLaunchTarget(target: string): string {
  const trimmed = target.trim().replace(/^file:\/\//, "");
  return expandUserPath(decodeURIComponent(trimmed));
}

function cleanLaunchEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ASAR;
  delete env.ELECTRON_RENDERER_URL;
  return env;
}

async function macOpen(args: string[]): Promise<void> {
  await execFileAsync("/usr/bin/open", args, { env: cleanLaunchEnv() });
}

async function openByNameMac(name: string): Promise<LaunchResult> {
  try {
    await macOpen(["-a", name]);
    return ok(`已打开 ${name}`);
  } catch {
    return fail(`没找到软件「${name}」，请在条目里补路径`);
  }
}

async function openMacApp(appRef: string): Promise<LaunchResult> {
  const target = normalizeLaunchTarget(appRef);
  try {
    await macOpen(["-a", target]);
    return ok(`已打开 ${target}`);
  } catch {
    const base = target.replace(/\.app\/?$/i, "").split("/").pop() || target;
    if (base !== target) return openByNameMac(base);
    return fail(`打不开 ${target}`);
  }
}

async function openMacFolder(target: string): Promise<LaunchResult> {
  const expanded = normalizeLaunchTarget(target);
  try {
    await macOpen(["-a", "Finder", expanded]);
    return ok(`已打开 ${expanded}`);
  } catch {
    return fail(`打不开 ${expanded}`);
  }
}

async function openPath(target: string): Promise<LaunchResult> {
  const expanded = normalizeLaunchTarget(target);
  if (process.platform === "darwin") {
    if (expanded.toLowerCase().endsWith(".app")) return openMacApp(expanded);
    return openMacFolder(expanded);
  }
  const error = await shell.openPath(expanded);
  if (error) return fail(error);
  return ok(`已打开 ${expanded}`);
}

export async function launchItem(id: string, action: LaunchAction): Promise<LaunchResult> {
  const item = getItem(id);
  if (!item) return fail("条目不存在");
  return launchResolved(item, action);
}

export async function launchResolved(
  item: CatalogItem,
  action: LaunchAction
): Promise<LaunchResult> {
  switch (action) {
    case "open_app": {
      if (item.path && process.platform === "darwin") return openMacApp(item.path);
      if (item.path) return openPath(item.path);
      if (item.appName && process.platform === "darwin") {
        const asPath = normalizeLaunchTarget(item.appName);
        if (asPath.toLowerCase().endsWith(".app")) return openMacApp(asPath);
        return openByNameMac(item.appName);
      }
      if (item.appName && process.platform === "win32") {
        try {
          spawn("cmd", ["/c", "start", "", item.appName], { detached: true, stdio: "ignore" });
          return ok(`已尝试打开 ${item.appName}`);
        } catch {
          return fail(`没找到软件「${item.appName}」`);
        }
      }
      return fail("没有软件名或路径，无法打开");
    }
    case "open_folder": {
      const target = item.path || item.appName;
      if (!target) return fail("没有可打开的路径");
      return openPath(target);
    }
    case "open_cursor": {
      const target = expandUserPath(item.path);
      if (!target) return fail("没有项目路径");
      if (process.platform === "darwin") {
        try {
          await macOpen(["-a", "Cursor", target]);
          return ok(`已用 Cursor 打开 ${target}`);
        } catch {
          return fail("打不开 Cursor，确认已安装并加入 PATH");
        }
      }
      try {
        spawn("cursor", [target], { detached: true, stdio: "ignore", env: cleanLaunchEnv() });
        return ok(`已用 Cursor 打开 ${target}`);
      } catch {
        return fail("打不开 Cursor，确认已安装并加入 PATH");
      }
    }
    case "open_url": {
      const href = item.url || item.sourceRaw;
      if (!href) return fail("没有网址");
      if (href.startsWith("file://") || href.toLowerCase().endsWith(".app")) {
        return openPath(href);
      }
      await shell.openExternal(href);
      return ok(`已在浏览器打开 ${href}`);
    }
    case "run_command": {
      const cmd = sanitizeLaunchCommand(item.launchCommand);
      if (!cmd) return fail("没有启动命令");
      const cwd = item.path ? expandUserPath(item.path) : undefined;
      if (process.platform === "darwin") {
        const script = cwd
          ? `tell application "Terminal" to do script ${JSON.stringify(`cd ${JSON.stringify(cwd)} && ${cmd}`)}`
          : `tell application "Terminal" to do script ${JSON.stringify(cmd)}`;
        await execFileAsync("/usr/bin/osascript", ["-e", script], { env: cleanLaunchEnv() });
        return ok("已在终端运行启动命令");
      }
      if (process.platform === "win32") {
        const line = cwd ? `cd /d ${cwd} && ${cmd}` : cmd;
        spawn("cmd", ["/c", "start", "cmd", "/k", line], { detached: true, stdio: "ignore" });
        return ok("已在终端运行启动命令");
      }
      spawn("x-terminal-emulator", ["-e", `bash -lc ${JSON.stringify(cmd)}`], {
        cwd,
        detached: true,
        stdio: "ignore"
      });
      return ok("已尝试在终端运行启动命令");
    }
    case "copy_body":
      return fail("复制原文由界面完成");
    default:
      return fail("未知操作");
  }
}

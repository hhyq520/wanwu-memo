import { exec, spawn } from "node:child_process";
import { promisify } from "node:util";
import { shell } from "electron";
import type { CatalogItem, LaunchAction, LaunchResult } from "@shared/types";
import { getItem } from "./catalog";
import { expandUserPath } from "./paths";

const execAsync = promisify(exec);

function fail(message: string): LaunchResult {
  return { ok: false, message };
}

function ok(message: string): LaunchResult {
  return { ok: true, message };
}

async function openByNameMac(name: string): Promise<LaunchResult> {
  try {
    await execAsync(`open -a ${JSON.stringify(name)}`);
    return ok(`已打开 ${name}`);
  } catch {
    return fail(`没找到软件「${name}」，请在条目里补路径`);
  }
}

async function openPath(target: string): Promise<LaunchResult> {
  const expanded = expandUserPath(target);
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
      if (item.path) return openPath(item.path);
      if (item.appName && process.platform === "darwin") return openByNameMac(item.appName);
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
      try {
        spawn("cursor", [target], { detached: true, stdio: "ignore" });
        return ok(`已用 Cursor 打开 ${target}`);
      } catch {
        if (process.platform === "darwin") {
          try {
            await execAsync(`open -a Cursor ${JSON.stringify(target)}`);
            return ok(`已用 Cursor 打开 ${target}`);
          } catch {
            return fail("打不开 Cursor，确认已安装并加入 PATH");
          }
        }
        return fail("打不开 Cursor，确认已安装并加入 PATH");
      }
    }
    case "open_url": {
      const href = item.url || item.sourceRaw;
      if (!href) return fail("没有网址");
      await shell.openExternal(href);
      return ok(`已在浏览器打开 ${href}`);
    }
    case "run_command": {
      if (!item.launchCommand) return fail("没有启动命令");
      const cwd = item.path ? expandUserPath(item.path) : undefined;
      const cmd = item.launchCommand;
      if (process.platform === "darwin") {
        const script = cwd
          ? `tell application "Terminal" to do script ${JSON.stringify(`cd ${JSON.stringify(cwd)} && ${cmd}`)}`
          : `tell application "Terminal" to do script ${JSON.stringify(cmd)}`;
        await execAsync(`osascript -e ${JSON.stringify(script)}`);
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

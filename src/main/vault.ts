import { spawn } from "node:child_process";
import path from "node:path";
import { app } from "electron";

let open = false;

export function isVaultOpen(): boolean {
  return open;
}

export function lockVault(): void {
  open = false;
}

export function setVaultOpen(next: boolean): void {
  open = next;
}

function authBinary(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, "wanwu-auth");
  return path.join(app.getAppPath(), "build", "wanwu-auth");
}

export function authenticateVault(reason: string): Promise<boolean> {
  if (process.platform !== "darwin") return Promise.resolve(false);
  return new Promise((resolve) => {
    const child = spawn(authBinary(), [reason], { timeout: 120000 });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      console.error("私密验证失败", error);
      resolve(false);
    });
    child.on("close", (code) => {
      if (code !== 0 && stderr.trim()) console.error("私密验证失败", stderr.trim());
      resolve(code === 0);
    });
  });
}

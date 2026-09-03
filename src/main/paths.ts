import { app } from "electron";
import os from "node:os";
import path from "node:path";

const PLACEHOLDERS: Record<string, () => string> = {
  "{{HOME}}": () => os.homedir(),
  "{{DOCUMENTS}}": () => app.getPath("documents"),
  "{{DESKTOP}}": () => app.getPath("desktop"),
  "{{DOWNLOADS}}": () => app.getPath("downloads")
};

export function expandUserPath(input: string): string {
  if (!input) return "";
  let out = input.trim();
  if (out.startsWith("~/") || out === "~") {
    out = path.join(os.homedir(), out.slice(1));
  }
  for (const [token, resolve] of Object.entries(PLACEHOLDERS)) {
    if (out.includes(token)) out = out.split(token).join(resolve());
  }
  return out;
}

export function portablePath(input: string): string {
  if (!input) return "";
  const abs = expandUserPath(input);
  const mappings = [
    [app.getPath("documents"), "{{DOCUMENTS}}"],
    [app.getPath("desktop"), "{{DESKTOP}}"],
    [app.getPath("downloads"), "{{DOWNLOADS}}"],
    [os.homedir(), "{{HOME}}"]
  ] as const;
  for (const [prefix, token] of mappings) {
    if (abs === prefix || abs.startsWith(prefix + path.sep)) {
      return token + abs.slice(prefix.length).replaceAll("\\", "/");
    }
  }
  return abs.replaceAll("\\", "/");
}

export function sandboxDir(): string {
  return path.join(app.getPath("userData"), "agent-sandbox");
}

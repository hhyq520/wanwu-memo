import fs from "node:fs";
import path from "node:path";
import { app, safeStorage } from "electron";
import type { AppSettings, AppSettingsInput, ProviderId } from "@shared/types";
import { PROVIDER_DEFAULTS } from "@shared/types";

interface StoredSettings {
  provider: ProviderId;
  model: string;
  apiKeyEnc?: string;
  apiKeyPlain?: string;
}

function settingsFile(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

function readRaw(): StoredSettings {
  try {
    const raw = fs.readFileSync(settingsFile(), "utf8");
    return JSON.parse(raw) as StoredSettings;
  } catch {
    return { provider: "deepseek", model: PROVIDER_DEFAULTS.deepseek.defaultModel };
  }
}

function writeRaw(data: StoredSettings): void {
  fs.writeFileSync(settingsFile(), JSON.stringify(data, null, 2), "utf8");
}

export function getSettings(): AppSettings {
  const raw = readRaw();
  return {
    provider: raw.provider,
    model: raw.model,
    apiKeySet: Boolean(getApiKey())
  };
}

export function getApiKey(): string {
  const raw = readRaw();
  if (raw.apiKeyEnc && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(raw.apiKeyEnc, "base64"));
    } catch {
      return "";
    }
  }
  return raw.apiKeyPlain || process.env.CURSOR_API_KEY || process.env.OPENAI_API_KEY || "";
}

export function setSettings(input: AppSettingsInput): AppSettings {
  const current = readRaw();
  const next: StoredSettings = {
    provider: input.provider,
    model: input.model || PROVIDER_DEFAULTS[input.provider].defaultModel
  };
  const key = input.apiKey?.trim();
  if (key) {
    if (safeStorage.isEncryptionAvailable()) {
      next.apiKeyEnc = safeStorage.encryptString(key).toString("base64");
    } else {
      next.apiKeyPlain = key;
    }
  } else {
    next.apiKeyEnc = current.apiKeyEnc;
    next.apiKeyPlain = current.apiKeyPlain;
  }
  writeRaw(next);
  return getSettings();
}

export function sandboxCwd(): string {
  const dir = path.join(app.getPath("userData"), "agent-sandbox");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

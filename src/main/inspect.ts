import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type {
  InspectGitResult,
  InspectPathResult,
  InspectUrlResult,
  ResolveAppResult
} from "@shared/types";
import { expandUserPath } from "./paths";

const execFileAsync = promisify(execFile);
const MAX_TEXT = 12_000;

function readTextLimited(filePath: string): string | undefined {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > 200_000) return undefined;
    return fs.readFileSync(filePath, "utf8").slice(0, MAX_TEXT);
  } catch {
    return undefined;
  }
}

function guessCommand(manifests: Record<string, unknown>, readme?: string): string | undefined {
  const pkg = manifests["package.json"] as { scripts?: Record<string, string> } | undefined;
  if (pkg?.scripts) {
    for (const name of ["dev", "start", "serve"]) {
      if (pkg.scripts[name]) return `npm run ${name}`;
    }
  }
  if (manifests["pyproject.toml"] || manifests["requirements.txt"]) return "python main.py";
  if (manifests["Cargo.toml"]) return "cargo run";
  if (manifests["go.mod"]) return "go run .";
  if (readme) {
    const match = readme.match(/`((?:npm|pnpm|yarn|uv|python|cargo|go)[^`]+)`/);
    if (match) return match[1];
  }
  return undefined;
}

export function inspectPath(rawPath: string): InspectPathResult {
  const resolved = expandUserPath(rawPath);
  const exists = fs.existsSync(resolved);
  if (!exists) {
    return { exists: false, path: resolved, isDirectory: false, topFiles: [], manifests: {} };
  }
  const stat = fs.statSync(resolved);
  const dir = stat.isDirectory() ? resolved : path.dirname(resolved);
  let topFiles: string[] = [];
  try {
    topFiles = fs.readdirSync(dir).slice(0, 40);
  } catch {
    topFiles = [];
  }

  const manifests: Record<string, unknown> = {};
  const manifestNames = [
    "package.json",
    "pyproject.toml",
    "requirements.txt",
    "Cargo.toml",
    "go.mod",
    "composer.json",
    "Makefile"
  ];
  for (const name of manifestNames) {
    const text = readTextLimited(path.join(dir, name));
    if (!text) continue;
    if (name.endsWith(".json")) {
      try {
        manifests[name] = JSON.parse(text);
      } catch {
        manifests[name] = { raw: text };
      }
    } else {
      manifests[name] = text.slice(0, 4000);
    }
  }

  const readmeName = topFiles.find((f) => /^readme/i.test(f));
  const readme = readmeName ? readTextLimited(path.join(dir, readmeName)) : undefined;

  let gitRemote: string | undefined;
  const gitConfig = readTextLimited(path.join(dir, ".git", "config"));
  if (gitConfig) {
    const remote = gitConfig.match(/url\s*=\s*(.+)/);
    if (remote) gitRemote = remote[1].trim();
  }

  return {
    exists: true,
    path: resolved,
    isDirectory: stat.isDirectory(),
    topFiles,
    readme,
    manifests,
    guessedCommand: guessCommand(manifests, readme),
    gitRemote
  };
}

function githubApiUrl(url: string): string | null {
  const https = url
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\.git$/, "");
  const m = https.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
  if (!m) return null;
  return `https://api.github.com/repos/${m[1]}/${m[2]}`;
}

function gitlabApiUrl(url: string): string | null {
  const https = url.replace(/\.git$/, "");
  const m = https.match(/gitlab\.com\/(.+?)(?:\.git)?$/i);
  if (!m) return null;
  return `https://gitlab.com/api/v4/projects/${encodeURIComponent(m[1])}`;
}

export async function inspectGit(url: string): Promise<InspectGitResult> {
  try {
    const gh = githubApiUrl(url);
    if (gh) {
      const res = await fetch(gh, { headers: { "User-Agent": "wanwu-memo" } });
      if (!res.ok) return { ok: false, url, error: `GitHub ${res.status}` };
      const json = (await res.json()) as { name?: string; description?: string };
      let readme: string | undefined;
      const readmeRes = await fetch(`${gh}/readme`, {
        headers: { "User-Agent": "wanwu-memo", Accept: "application/vnd.github.raw" }
      });
      if (readmeRes.ok) readme = (await readmeRes.text()).slice(0, MAX_TEXT);
      return { ok: true, url, name: json.name, description: json.description, readme };
    }
    const gl = gitlabApiUrl(url);
    if (gl) {
      const res = await fetch(gl, { headers: { "User-Agent": "wanwu-memo" } });
      if (!res.ok) return { ok: false, url, error: `GitLab ${res.status}` };
      const json = (await res.json()) as { name?: string; description?: string };
      return { ok: true, url, name: json.name, description: json.description };
    }
    return { ok: false, url, error: "暂只解析 GitHub / GitLab 公开仓库" };
  } catch (error) {
    return { ok: false, url, error: error instanceof Error ? error.message : String(error) };
  }
}

function extractMeta(html: string, name: string): string | undefined {
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`, "i")
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1];
  }
  return undefined;
}

export async function inspectUrl(url: string): Promise<InspectUrlResult> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "wanwu-memo" },
      redirect: "follow",
      signal: AbortSignal.timeout(12_000)
    });
    if (!res.ok) return { ok: false, url, error: `HTTP ${res.status}` };
    const html = (await res.text()).slice(0, 80_000);
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
    const description =
      extractMeta(html, "description") || extractMeta(html, "og:description") || undefined;
    return { ok: true, url, title, description };
  } catch (error) {
    return { ok: false, url, error: error instanceof Error ? error.message : String(error) };
  }
}

function listDirSafe(dir: string): string[] {
  try {
    return fs.readdirSync(dir).map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

export async function resolveApp(name: string): Promise<ResolveAppResult> {
  const needle = name.trim();
  const candidates: string[] = [];
  if (!needle) return { name: needle, found: false, candidates };

  if (process.platform === "darwin") {
    const roots = ["/Applications", path.join(os.homedir(), "Applications")];
    for (const root of roots) {
      for (const entry of listDirSafe(root)) {
        if (entry.toLowerCase().includes(needle.toLowerCase()) && entry.endsWith(".app")) {
          candidates.push(entry);
        }
      }
    }
    try {
      const { stdout } = await execFileAsync("mdfind", [
        `kMDItemKind == 'Application' && kMDItemDisplayName == '*${needle}*'c`
      ]);
      for (const line of stdout.split("\n").map((s) => s.trim()).filter(Boolean)) {
        if (!candidates.includes(line)) candidates.push(line);
      }
    } catch {
      // Spotlight may be unavailable.
    }
  } else if (process.platform === "win32") {
    const roots = [
      process.env.ProgramFiles,
      process.env["ProgramFiles(x86)"],
      path.join(os.homedir(), "AppData", "Local", "Programs"),
      path.join(process.env.ProgramData || "C:\\ProgramData", "Microsoft", "Windows", "Start Menu", "Programs")
    ].filter(Boolean) as string[];
    for (const root of roots) {
      try {
        const { stdout } = await execFileAsync("cmd", [
          "/c",
          `dir /s /b "${root}\\*${needle}*.exe"`
        ]);
        for (const line of stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, 20)) {
          candidates.push(line);
        }
      } catch {
        // ignore missing dirs
      }
    }
  }

  return {
    name: needle,
    found: candidates.length > 0,
    path: candidates[0],
    candidates: candidates.slice(0, 12)
  };
}

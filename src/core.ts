import type { Dirent } from "fs";
import fs from "fs/promises";
import os from "os";
import path from "path";

const LOMBOK_URL = "https://projectlombok.org/downloads/lombok.jar";
const BUILD_FILES = new Set(["pom.xml", "build.gradle", "build.gradle.kts"]);
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "target",
  "out",
  ".next",
  ".turbo",
]);
const LOMBOK_MATCHERS = [
  /<artifactId>\s*lombok\s*<\/artifactId>/,
  /["']org\.projectlombok:lombok[:"']/,
  /io\.freefair\.lombok/,
];
const LOMBOK_JAVA_AGENT =
  /-javaagent:(?:"[^"]*lombok\.jar"|[^ "']*lombok\.jar)/i;

const pathExists = async (file: string) =>
  fs
    .stat(file)
    .then(() => true)
    .catch(() => false);

const readEntries = async (dir: string): Promise<Dirent[]> => {
  return fs.readdir(dir, { withFileTypes: true }).catch(() => []);
};

const readText = async (file: string) => {
  return fs.readFile(file, "utf8").catch(() => "");
};

export function hasLombokDependency(content: string) {
  return LOMBOK_MATCHERS.some((matcher) => matcher.test(content));
}

const containsLombokInFile = async (file: string) => {
  const content = await readText(file);
  if (!content) return false;
  return hasLombokDependency(content);
};

async function detectInDir(dir: string): Promise<boolean> {
  const entries = await readEntries(dir);

  for (const entry of entries) {
    const file = path.join(dir, entry.name);
    if (entry.isFile() && BUILD_FILES.has(entry.name)) {
      const hit = await containsLombokInFile(file);
      if (hit) return true;
    }

    if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
      const hit = await detectInDir(file);
      if (hit) return true;
    }
  }

  return false;
}

export async function detectLombokDependency(projectRoot: string) {
  return detectInDir(projectRoot);
}

export function opencodeDataDir(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir(),
) {
  if (env.XDG_DATA_HOME) return path.join(env.XDG_DATA_HOME, "opencode");
  if (platform === "darwin")
    return path.join(home, "Library", "Application Support", "opencode");
  if (platform === "win32") {
    const appData = env.APPDATA || path.win32.join(home, "AppData", "Roaming");
    return path.win32.join(appData, "opencode");
  }
  return path.join(home, ".local", "share", "opencode");
}

export function lombokJarPath(dataDir: string = opencodeDataDir()) {
  return path.join(dataDir, "bin", "jdtls", "bin", "lombok.jar");
}

export function isLspDownloadDisabled(env: NodeJS.ProcessEnv = process.env) {
  const value = env.OPENCODE_DISABLE_LSP_DOWNLOAD || "";
  return /^(1|true|yes)$/i.test(value.trim());
}

export async function ensureLombokJar(
  file: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const exists = await pathExists(file);
  if (exists) return file;
  if (isLspDownloadDisabled(env)) return undefined;

  await fs.mkdir(path.dirname(file), { recursive: true });
  const response = await fetch(LOMBOK_URL).catch(() => undefined);
  if (!response?.ok) return undefined;

  const body = await response.arrayBuffer().catch(() => undefined);
  if (!body) return undefined;

  const saved = await fs
    .writeFile(file, Buffer.from(body))
    .then(() => true)
    .catch(() => false);
  if (!saved) return undefined;

  const present = await pathExists(file);
  if (!present) return undefined;
  return file;
}

export function formatJavaAgentArg(file: string) {
  if (!/\s/.test(file)) return `-javaagent:${file}`;
  return `-javaagent:"${file.replace(/"/g, '\\"')}"`;
}

export function mergeJavaToolOptions(
  current: string | undefined,
  file: string,
) {
  const existing = current?.trim() || "";
  if (LOMBOK_JAVA_AGENT.test(existing)) return existing;
  const agent = formatJavaAgentArg(file);
  if (!existing) return agent;
  return `${existing} ${agent}`;
}

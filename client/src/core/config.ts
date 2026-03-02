import fs from "node:fs";
import { ensureBaseLayout, writeTextFile } from "./fs.js";
import { configPath } from "./paths.js";

export const DEFAULT_SERVER_URL = "ws://127.0.0.1:8787/ws";

export interface KeeperConfig {
  server: {
    url: string;
  };
}

const DEFAULT_CONFIG: KeeperConfig = {
  server: {
    url: DEFAULT_SERVER_URL
  }
};

export function defaultConfigToml(): string {
  return [
    "# TheKeeper client configuration",
    "# Edit the server URL below to point the client at a different server.",
    "",
    "[server]",
    `url = "${DEFAULT_CONFIG.server.url}"`
  ].join("\n");
}

export function ensureConfigFile(): void {
  ensureBaseLayout();
  if (fs.existsSync(configPath())) {
    return;
  }

  writeTextFile(configPath(), defaultConfigToml());
}

export function loadConfig(): KeeperConfig {
  ensureConfigFile();
  const raw = fs.readFileSync(configPath(), "utf8");
  const parsed = parseConfigToml(raw);

  return {
    server: {
      url: parsed.server.url || DEFAULT_CONFIG.server.url
    }
  };
}

export function resolveServerUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.THEKEEPER_SERVER_URL ?? loadConfig().server.url;
}

function parseConfigToml(raw: string): KeeperConfig {
  let section = "";
  let serverUrl = DEFAULT_CONFIG.server.url;

  for (const originalLine of raw.split(/\r?\n/)) {
    const line = originalLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const sectionMatch = line.match(/^\[([A-Za-z0-9_-]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      continue;
    }

    const assignmentMatch = line.match(/^([A-Za-z0-9_-]+)\s*=\s*"([^"]*)"\s*$/);
    if (!assignmentMatch) {
      throw new Error(`Invalid config line in ${configPath()}: ${originalLine}`);
    }

    const [, key, value] = assignmentMatch;
    if (section === "server" && key === "url") {
      serverUrl = value;
    }
  }

  return {
    server: {
      url: serverUrl
    }
  };
}

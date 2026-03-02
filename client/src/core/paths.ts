import os from "node:os";
import path from "node:path";

export const DEFAULT_PROFILE = "default";

export function dataRoot(): string {
  return path.join(os.homedir(), ".thekeeper");
}

export function configPath(): string {
  return path.join(dataRoot(), "config.toml");
}

export function keysRoot(): string {
  return path.join(dataRoot(), "keys");
}

export function conversationsRoot(): string {
  return path.join(dataRoot(), "conversations");
}

export function profileKeyDir(profileName: string): string {
  return path.join(keysRoot(), profileName);
}

export function profileConversationDir(profileName: string): string {
  return path.join(conversationsRoot(), profileName);
}

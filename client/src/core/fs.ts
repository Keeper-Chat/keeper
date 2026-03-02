import fs from "node:fs";
import path from "node:path";
import { conversationsRoot, dataRoot, keysRoot } from "./paths.js";

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function ensureBaseLayout(): void {
  ensureDir(dataRoot());
  ensureDir(keysRoot());
  ensureDir(conversationsRoot());
}

export function writeTextFile(filePath: string, contents: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, contents, "utf8");
}

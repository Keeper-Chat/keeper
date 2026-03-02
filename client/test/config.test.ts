import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_SERVER_URL, ensureConfigFile, loadConfig, resolveServerUrl } from "../src/core/config.js";
import { configPath } from "../src/core/paths.js";

function withTempHome(run: () => void | Promise<void>): Promise<void> | void {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "thekeeper-home-"));
  const originalHome = process.env.HOME;
  process.env.HOME = tempHome;

  const restore = (): void => {
    process.env.HOME = originalHome;
  };

  try {
    const result = run();
    if (result instanceof Promise) {
      return result.finally(restore);
    }
    restore();
  } catch (error) {
    restore();
    throw error;
  }
}

test("config file is created with the default server URL", () =>
  withTempHome(() => {
    ensureConfigFile();

    assert.equal(fs.existsSync(configPath()), true);
    assert.match(fs.readFileSync(configPath(), "utf8"), /\[server\]/);
    assert.match(fs.readFileSync(configPath(), "utf8"), new RegExp(DEFAULT_SERVER_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(loadConfig().server.url, DEFAULT_SERVER_URL);
  }));

test("config file server URL can be changed by editing config.toml", () =>
  withTempHome(() => {
    ensureConfigFile();
    fs.writeFileSync(configPath(), '[server]\nurl = "wss://chat.example.test/ws"\n', "utf8");

    assert.equal(loadConfig().server.url, "wss://chat.example.test/ws");
  }));

test("environment server URL overrides config.toml", () =>
  withTempHome(() => {
    ensureConfigFile();
    fs.writeFileSync(configPath(), '[server]\nurl = "wss://chat.example.test/ws"\n', "utf8");

    assert.equal(resolveServerUrl({ THEKEEPER_SERVER_URL: "ws://override.test/ws" }), "ws://override.test/ws");
  }));

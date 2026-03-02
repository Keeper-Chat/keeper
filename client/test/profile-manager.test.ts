import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProfileManager } from "../src/core/profile-manager.js";

test("profile manager creates default profile", async () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "thekeeper-home-"));
  const originalHome = process.env.HOME;
  process.env.HOME = tempHome;

  try {
    const manager = new ProfileManager();
    const metadata = await manager.ensureDefaultProfile();
    assert.equal(metadata.profileName, "default");
    assert.equal(manager.listProfiles().length, 1);
  } finally {
    process.env.HOME = originalHome;
  }
});

test("profile manager rejects duplicate profile names", async () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "thekeeper-home-"));
  const originalHome = process.env.HOME;
  process.env.HOME = tempHome;

  try {
    const manager = new ProfileManager();
    await manager.createProfile("duplicate");

    await assert.rejects(manager.createProfile("duplicate"), /already exists/);
    assert.equal(manager.listProfiles().length, 1);
  } finally {
    process.env.HOME = originalHome;
  }
});

import fs from "node:fs";
import path from "node:path";
import { generateProfileKeys } from "../crypto/pgp.js";
import { ProfileMetadata, ProfileRecord } from "../types.js";
import { ensureBaseLayout, ensureDir, writeTextFile } from "./fs.js";
import { DEFAULT_PROFILE, keysRoot, profileConversationDir, profileKeyDir } from "./paths.js";

export class ProfileManager {
  ensureBaseLayout(): void {
    ensureBaseLayout();
  }

  listProfiles(): ProfileMetadata[] {
    this.ensureBaseLayout();
    const entries = fs.readdirSync(keysRoot(), { withFileTypes: true }).filter((entry) => entry.isDirectory());
    const profiles: ProfileMetadata[] = [];

    for (const entry of entries) {
      const metadataPath = path.join(keysRoot(), entry.name, "profile.json");
      if (!fs.existsSync(metadataPath)) {
        continue;
      }
      const raw = fs.readFileSync(metadataPath, "utf8");
      profiles.push(JSON.parse(raw) as ProfileMetadata);
    }

    return profiles.sort((a, b) => a.profileName.localeCompare(b.profileName));
  }

  async ensureDefaultProfile(): Promise<ProfileMetadata> {
    const existing = this.listProfiles().find((profile) => profile.profileName === DEFAULT_PROFILE);
    if (existing) {
      return existing;
    }
    return this.createProfile(DEFAULT_PROFILE);
  }

  async createProfile(profileName: string, passphrase?: string): Promise<ProfileMetadata> {
    const normalizedName = profileName.trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(normalizedName)) {
      throw new Error("Profile name must use letters, numbers, hyphens, or underscores");
    }
    if (this.listProfiles().some((profile) => profile.profileName === normalizedName)) {
      throw new Error(`Profile ${normalizedName} already exists`);
    }

    const keyDir = profileKeyDir(normalizedName);
    const conversationDir = profileConversationDir(normalizedName);
    ensureDir(keyDir);
    ensureDir(conversationDir);

    const generated = await generateProfileKeys(passphrase);
    const metadata: ProfileMetadata = {
      profileName: normalizedName,
      publicKeyFingerprint: generated.fingerprint,
      publicKeyId: generated.keyId,
      createdAt: new Date().toISOString(),
      privateKeyEncrypted: generated.privateKeyEncrypted
    };

    writeTextFile(path.join(keyDir, "public.asc"), generated.publicKeyArmored);
    writeTextFile(path.join(keyDir, "private.asc"), generated.privateKeyArmored);
    writeTextFile(path.join(keyDir, "profile.json"), JSON.stringify(metadata, null, 2));

    return metadata;
  }

  loadProfile(profileName: string): ProfileRecord {
    const keyDir = profileKeyDir(profileName);
    const metadata = JSON.parse(fs.readFileSync(path.join(keyDir, "profile.json"), "utf8")) as ProfileMetadata;

    return {
      ...metadata,
      publicKeyArmored: fs.readFileSync(path.join(keyDir, "public.asc"), "utf8"),
      privateKeyArmored: fs.readFileSync(path.join(keyDir, "private.asc"), "utf8")
    };
  }
}

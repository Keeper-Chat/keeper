import test from "node:test";
import assert from "node:assert/strict";
import { generateProfileKeys } from "../src/crypto/pgp.js";
import { validateProfileUnlock } from "../src/app/unlock.js";
import { ProfileRecord } from "../src/types.js";

async function createProfileRecord(passphrase?: string): Promise<ProfileRecord> {
  const generated = await generateProfileKeys(passphrase);

  return {
    profileName: "tester",
    publicKeyFingerprint: generated.fingerprint,
    publicKeyId: generated.keyId,
    createdAt: new Date().toISOString(),
    privateKeyEncrypted: generated.privateKeyEncrypted,
    publicKeyArmored: generated.publicKeyArmored,
    privateKeyArmored: generated.privateKeyArmored
  };
}

test("validateProfileUnlock accepts the correct passphrase", async () => {
  const profile = await createProfileRecord("correct horse battery staple");

  await assert.doesNotReject(validateProfileUnlock(profile, "correct horse battery staple"));
});

test("validateProfileUnlock rejects an incorrect passphrase", async () => {
  const profile = await createProfileRecord("correct horse battery staple");

  await assert.rejects(validateProfileUnlock(profile, "wrong passphrase"));
});

test("validateProfileUnlock rejects missing passphrase for encrypted keys", async () => {
  const profile = await createProfileRecord("correct horse battery staple");

  await assert.rejects(validateProfileUnlock(profile));
});

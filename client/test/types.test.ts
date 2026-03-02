import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessageFrame } from "../src/types.js";

test("incoming message frames include sender public key", () => {
  const frame: IncomingMessageFrame = {
    type: "incoming_message",
    messageId: "msg-1",
    senderFingerprint: "sender-fp",
    senderPublicKeyArmored: "-----BEGIN PGP PUBLIC KEY BLOCK-----",
    ciphertextArmored: "ciphertext",
    receivedAt: Date.now()
  };

  assert.equal(frame.senderPublicKeyArmored.startsWith("-----BEGIN PGP"), true);
});

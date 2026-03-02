import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessageFrame, ReturnMessageFrame } from "../src/types.js";

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

test("return message frames preserve the original sender fingerprint", () => {
  const frame: ReturnMessageFrame = {
    type: "return_message",
    messageId: "msg-1",
    senderFingerprint: "sender-fp"
  };

  assert.equal(frame.senderFingerprint, "sender-fp");
});

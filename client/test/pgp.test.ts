import test from "node:test";
import assert from "node:assert/strict";
import { composeEncryptedMessage, decryptMessage, generateProfileKeys, readPrivateKey } from "../src/crypto/pgp.js";

test("outgoing messages are decryptable by the sender and recipient", async () => {
  const sender = await generateProfileKeys();
  const recipient = await generateProfileKeys();

  const senderPrivateKey = await readPrivateKey(sender.privateKeyArmored);
  const recipientPrivateKey = await readPrivateKey(recipient.privateKeyArmored);
  const composed = await composeEncryptedMessage("hello", senderPrivateKey, recipient.publicKeyArmored);

  const senderView = await decryptMessage(composed.ciphertextArmored, senderPrivateKey, sender.publicKeyArmored);
  const recipientView = await decryptMessage(composed.ciphertextArmored, recipientPrivateKey, sender.publicKeyArmored);

  assert.equal(senderView.plaintext, "hello");
  assert.equal(senderView.verified, true);
  assert.equal(recipientView.plaintext, "hello");
  assert.equal(recipientView.verified, true);
});

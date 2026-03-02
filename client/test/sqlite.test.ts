import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ConversationStore } from "../src/storage/sqlite.js";

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

test("conversation store deletes a conversation and its messages", () =>
  withTempHome(() => {
    const store = new ConversationStore("default");
    const firstConversation = store.upsertConversation("peer-1", "public-key-1");
    const secondConversation = store.upsertConversation("peer-2", "public-key-2");

    store.insertMessage({
      id: "message-1",
      conversationId: firstConversation.id,
      direction: "outgoing",
      senderFingerprint: "self",
      recipientFingerprint: "peer-1",
      sentAt: 100,
      receivedAt: null,
      ciphertextArmored: "cipher-1",
      signatureFingerprint: "self",
      deliveryState: "sent",
      serverMessageId: null
    });
    store.insertMessage({
      id: "message-2",
      conversationId: secondConversation.id,
      direction: "incoming",
      senderFingerprint: "peer-2",
      recipientFingerprint: "self",
      sentAt: 200,
      receivedAt: 200,
      ciphertextArmored: "cipher-2",
      signatureFingerprint: "peer-2",
      deliveryState: "received",
      serverMessageId: "server-2"
    });

    store.deleteConversation(firstConversation.id);

    assert.deepEqual(
      store.listConversations().map((conversation) => conversation.id),
      [secondConversation.id]
    );
    assert.deepEqual(store.getMessages(firstConversation.id), []);
    assert.deepEqual(
      store.getMessages(secondConversation.id).map((message) => message.id),
      ["message-2"]
    );
  }));

test("conversation store persists blocked keys per profile", () =>
  withTempHome(() => {
    const defaultStore = new ConversationStore("default");
    const secondStore = new ConversationStore("second");

    defaultStore.blockKey("peer-1", "public-key-1");
    secondStore.blockKey("peer-2", "public-key-2");

    assert.equal(defaultStore.isBlocked("peer-1"), true);
    assert.equal(defaultStore.isBlocked("peer-2"), false);
    assert.equal(secondStore.isBlocked("peer-2"), true);
    assert.deepEqual(
      defaultStore.listBlockedKeys().map((entry) => entry.fingerprint),
      ["peer-1"]
    );

    defaultStore.unblockKey("peer-1");

    assert.equal(defaultStore.isBlocked("peer-1"), false);
    assert.deepEqual(defaultStore.listBlockedKeys(), []);
    assert.deepEqual(
      secondStore.listBlockedKeys().map((entry) => entry.fingerprint),
      ["peer-2"]
    );
  }));

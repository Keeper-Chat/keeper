import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { BlockedKey, Conversation, StoredMessageEnvelope } from "../types.js";
import { profileConversationDir } from "../core/paths.js";
import { generateId, unixNow } from "../core/utils.js";

export class ConversationStore {
  private readonly db: Database.Database;

  constructor(profileName: string) {
    const conversationDir = profileConversationDir(profileName);
    fs.mkdirSync(conversationDir, { recursive: true });
    const dbPath = path.join(conversationDir, "messages.db");
    this.db = new Database(dbPath);
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        peer_fingerprint TEXT NOT NULL UNIQUE,
        peer_public_key_armored TEXT NOT NULL,
        nickname TEXT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_message_at INTEGER NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        direction TEXT NOT NULL,
        sender_fingerprint TEXT NOT NULL,
        recipient_fingerprint TEXT NOT NULL,
        sent_at INTEGER NOT NULL,
        received_at INTEGER NULL,
        ciphertext_armored TEXT NOT NULL,
        signature_fingerprint TEXT NOT NULL,
        delivery_state TEXT NOT NULL,
        server_message_id TEXT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation_sent_at
        ON messages (conversation_id, sent_at DESC);

      CREATE TABLE IF NOT EXISTS blocked_keys (
        fingerprint TEXT PRIMARY KEY,
        public_key_armored TEXT NOT NULL,
        blocked_at INTEGER NOT NULL
      );
    `);
  }

  listBlockedKeys(): BlockedKey[] {
    const stmt = this.db.prepare(`
      SELECT
        fingerprint,
        public_key_armored AS publicKeyArmored,
        blocked_at AS blockedAt
      FROM blocked_keys
      ORDER BY blocked_at DESC
    `);

    return stmt.all() as BlockedKey[];
  }

  isBlocked(fingerprint: string): boolean {
    const stmt = this.db.prepare(`
      SELECT 1
      FROM blocked_keys
      WHERE fingerprint = ?
    `);

    return Boolean(stmt.get(fingerprint));
  }

  blockKey(fingerprint: string, publicKeyArmored: string): void {
    this.db
      .prepare(`
        INSERT INTO blocked_keys (
          fingerprint,
          public_key_armored,
          blocked_at
        ) VALUES (?, ?, ?)
        ON CONFLICT(fingerprint) DO UPDATE SET
          public_key_armored = excluded.public_key_armored,
          blocked_at = excluded.blocked_at
      `)
      .run(fingerprint, publicKeyArmored, unixNow());
  }

  unblockKey(fingerprint: string): void {
    this.db
      .prepare(`
        DELETE FROM blocked_keys
        WHERE fingerprint = ?
      `)
      .run(fingerprint);
  }

  listConversations(): Conversation[] {
    const stmt = this.db.prepare(`
      SELECT
        id,
        peer_fingerprint AS peerFingerprint,
        peer_public_key_armored AS peerPublicKeyArmored,
        nickname,
        created_at AS createdAt,
        updated_at AS updatedAt,
        last_message_at AS lastMessageAt
      FROM conversations
      ORDER BY COALESCE(last_message_at, updated_at) DESC
    `);

    return stmt.all() as Conversation[];
  }

  getConversationByPeerFingerprint(peerFingerprint: string): Conversation | undefined {
    const stmt = this.db.prepare(`
      SELECT
        id,
        peer_fingerprint AS peerFingerprint,
        peer_public_key_armored AS peerPublicKeyArmored,
        nickname,
        created_at AS createdAt,
        updated_at AS updatedAt,
        last_message_at AS lastMessageAt
      FROM conversations
      WHERE peer_fingerprint = ?
    `);
    return stmt.get(peerFingerprint) as Conversation | undefined;
  }

  upsertConversation(peerFingerprint: string, peerPublicKeyArmored: string): Conversation {
    const existing = this.getConversationByPeerFingerprint(peerFingerprint);
    const now = unixNow();
    if (existing) {
      this.db
        .prepare(`
          UPDATE conversations
          SET peer_public_key_armored = ?, updated_at = ?
          WHERE id = ?
        `)
        .run(peerPublicKeyArmored, now, existing.id);
      return this.getConversationByPeerFingerprint(peerFingerprint)!;
    }

    const id = generateId();
    this.db
      .prepare(`
        INSERT INTO conversations (
          id,
          peer_fingerprint,
          peer_public_key_armored,
          nickname,
          created_at,
          updated_at,
          last_message_at
        ) VALUES (?, ?, ?, NULL, ?, ?, NULL)
      `)
      .run(id, peerFingerprint, peerPublicKeyArmored, now, now);
    return this.getConversationByPeerFingerprint(peerFingerprint)!;
  }

  setNickname(conversationId: string, nickname: string | null): void {
    this.db
      .prepare(`
        UPDATE conversations
        SET nickname = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(nickname, unixNow(), conversationId);
  }

  deleteConversation(conversationId: string): void {
    const deleteConversation = this.db.prepare(`
      DELETE FROM conversations
      WHERE id = ?
    `);
    const deleteMessages = this.db.prepare(`
      DELETE FROM messages
      WHERE conversation_id = ?
    `);

    this.db.transaction(() => {
      deleteMessages.run(conversationId);
      deleteConversation.run(conversationId);
    })();
  }

  insertMessage(message: StoredMessageEnvelope): void {
    this.db
      .prepare(`
        INSERT INTO messages (
          id,
          conversation_id,
          direction,
          sender_fingerprint,
          recipient_fingerprint,
          sent_at,
          received_at,
          ciphertext_armored,
          signature_fingerprint,
          delivery_state,
          server_message_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        message.id,
        message.conversationId,
        message.direction,
        message.senderFingerprint,
        message.recipientFingerprint,
        message.sentAt,
        message.receivedAt,
        message.ciphertextArmored,
        message.signatureFingerprint,
        message.deliveryState,
        message.serverMessageId
      );

    this.db
      .prepare(`
        UPDATE conversations
        SET updated_at = ?, last_message_at = ?
        WHERE id = ?
      `)
      .run(unixNow(), message.sentAt, message.conversationId);
  }

  updateDeliveryState(messageId: string, deliveryState: StoredMessageEnvelope["deliveryState"], serverMessageId?: string): void {
    this.db
      .prepare(`
        UPDATE messages
        SET delivery_state = ?, server_message_id = COALESCE(?, server_message_id)
        WHERE id = ?
      `)
      .run(deliveryState, serverMessageId ?? null, messageId);
  }

  getMessages(conversationId: string, limit = 100, beforeSentAt?: number): StoredMessageEnvelope[] {
    if (beforeSentAt) {
      const stmt = this.db.prepare(`
        SELECT
          id,
          conversation_id AS conversationId,
          direction,
          sender_fingerprint AS senderFingerprint,
          recipient_fingerprint AS recipientFingerprint,
          sent_at AS sentAt,
          received_at AS receivedAt,
          ciphertext_armored AS ciphertextArmored,
          signature_fingerprint AS signatureFingerprint,
          delivery_state AS deliveryState,
          server_message_id AS serverMessageId
        FROM messages
        WHERE conversation_id = ? AND sent_at < ?
        ORDER BY sent_at DESC
        LIMIT ?
      `);
      return stmt.all(conversationId, beforeSentAt, limit) as StoredMessageEnvelope[];
    }

    const stmt = this.db.prepare(`
      SELECT
        id,
        conversation_id AS conversationId,
        direction,
        sender_fingerprint AS senderFingerprint,
        recipient_fingerprint AS recipientFingerprint,
        sent_at AS sentAt,
        received_at AS receivedAt,
        ciphertext_armored AS ciphertextArmored,
        signature_fingerprint AS signatureFingerprint,
        delivery_state AS deliveryState,
        server_message_id AS serverMessageId
      FROM messages
      WHERE conversation_id = ?
      ORDER BY sent_at DESC
      LIMIT ?
    `);
    return stmt.all(conversationId, limit) as StoredMessageEnvelope[];
  }
}

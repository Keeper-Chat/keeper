export type DeliveryState = "failed" | "received" | "sent";

export interface ProfileMetadata {
  profileName: string;
  publicKeyFingerprint: string;
  publicKeyId: string;
  createdAt: string;
  privateKeyEncrypted: boolean;
  displayName?: string;
}

export interface ProfileRecord extends ProfileMetadata {
  publicKeyArmored: string;
  privateKeyArmored: string;
}

export interface Conversation {
  id: string;
  peerFingerprint: string;
  peerPublicKeyArmored: string;
  nickname: string | null;
  createdAt: number;
  updatedAt: number;
  lastMessageAt: number | null;
}

export interface BlockedKey {
  fingerprint: string;
  publicKeyArmored: string;
  blockedAt: number;
}

export interface StoredMessageEnvelope {
  id: string;
  conversationId: string;
  direction: "incoming" | "outgoing";
  senderFingerprint: string;
  recipientFingerprint: string;
  sentAt: number;
  receivedAt: number | null;
  ciphertextArmored: string;
  signatureFingerprint: string;
  deliveryState: DeliveryState;
  serverMessageId: string | null;
}

export interface DecryptedMessage extends StoredMessageEnvelope {
  plaintext: string;
  verified: boolean;
  verificationError?: string;
}

export type ServerFrame =
  | RegisterOkFrame
  | PresenceResultFrame
  | MessageDeliveryFrame
  | IncomingMessageFrame
  | ErrorFrame;

export type ClientFrame =
  | RegisterFrame
  | HeartbeatFrame
  | PresenceQueryFrame
  | SendMessageFrame
  | ReturnMessageFrame;

export interface RegisterFrame {
  type: "register";
  fingerprint: string;
  publicKeyArmored: string;
}

export interface HeartbeatFrame {
  type: "heartbeat";
}

export interface PresenceQueryFrame {
  type: "presence_query";
  requestId: string;
  fingerprint: string;
}

export interface SendMessageFrame {
  type: "send_message";
  requestId: string;
  messageId: string;
  recipientFingerprint: string;
  ciphertextArmored: string;
}

export interface ReturnMessageFrame {
  type: "return_message";
  messageId: string;
  senderFingerprint: string;
}

export interface RegisterOkFrame {
  type: "register_ok";
  fingerprint: string;
  serverTime: number;
}

export interface PresenceResultFrame {
  type: "presence_result";
  requestId: string;
  fingerprint: string;
  online: boolean;
}

export interface MessageDeliveryFrame {
  type: "message_delivery";
  requestId: string;
  messageId: string;
  accepted: boolean;
  reason: string;
}

export interface IncomingMessageFrame {
  type: "incoming_message";
  messageId: string;
  senderFingerprint: string;
  senderPublicKeyArmored: string;
  ciphertextArmored: string;
  receivedAt: number;
}

export interface ErrorFrame {
  type: "error";
  code: string;
  message: string;
}

export interface ComposeResult {
  ciphertextArmored: string;
  signatureFingerprint: string;
}

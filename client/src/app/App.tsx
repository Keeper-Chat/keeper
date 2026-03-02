import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { ProtocolClient } from "../protocol/client.js";
import { ProfileRecord, Conversation, DecryptedMessage } from "../types.js";
import { ConversationStore } from "../storage/sqlite.js";
import { composeEncryptedMessage, decryptMessage, fingerprintForPublicKey, readPrivateKey } from "../crypto/pgp.js";
import { generateId, truncateFingerprint, unixNow } from "../core/utils.js";

type FocusRegion = "chat" | "sidebar";
const MIN_VISIBLE_MESSAGE_LINES = 4;
const SCROLL_STEP = 5;
const ARROW_SCROLL_STEP = 1;
const SIDEBAR_WIDTH_RATIO = 0.3;
const MIN_TERMINAL_WIDTH = 80;
const MIN_TERMINAL_HEIGHT = 24;

export interface AppProps {
  profile: ProfileRecord;
  passphrase?: string;
  serverUrl: string;
}

export function App({ profile, passphrase, serverUrl }: AppProps): React.JSX.Element {
  const store = useMemo(() => new ConversationStore(profile.profileName), [profile.profileName]);
  const client = useMemo(() => new ProtocolClient(serverUrl), [serverUrl]);
  const [conversations, setConversations] = useState<Conversation[]>(() => store.listConversations());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [focus, setFocus] = useState<FocusRegion>("sidebar");
  const [composeText, setComposeText] = useState("");
  const [presence, setPresence] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState("Connecting...");
  const [privateKeyError, setPrivateKeyError] = useState<string>();
  const [newChatMode, setNewChatMode] = useState(false);
  const [newChatKeyInput, setNewChatKeyInput] = useState("");
  const [newChatError, setNewChatError] = useState<string>();
  const [conversationPendingDeletion, setConversationPendingDeletion] = useState<{ id: string; label: string }>();
  const [messageLimit, setMessageLimit] = useState(100);
  const [messageScrollOffset, setMessageScrollOffset] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [showPublicKey, setShowPublicKey] = useState(false);
  const { stdout } = useStdout();

  const selectedConversation = conversations[selectedIndex];
  const selectedConversationRef = useRef<Conversation | undefined>(selectedConversation);
  const messageLimitRef = useRef(messageLimit);
  const passphraseRef = useRef(passphrase);
  selectedConversationRef.current = selectedConversation;
  messageLimitRef.current = messageLimit;
  passphraseRef.current = passphrase;
  const publicKeyLines = profile.publicKeyArmored.trim().split("\n");
  const newChatPreviewLines = newChatKeyInput.split("\n").slice(-10);
  const terminalWidth = Math.max(stdout.columns ?? 120, MIN_TERMINAL_WIDTH);
  const terminalHeight = Math.max(stdout.rows ?? 30, MIN_TERMINAL_HEIGHT);
  const mainPaneHeight = Math.max(terminalHeight - 6, 12);
  const sidebarContentWidth = Math.max(Math.floor(terminalWidth * SIDEBAR_WIDTH_RATIO) - 4, 12);
  const chatContentWidth = Math.max(terminalWidth - Math.floor(terminalWidth * SIDEBAR_WIDTH_RATIO) - 6, 24);
  const footerContentWidth = Math.max(terminalWidth - 4, 20);
  const sidebarContentHeight = Math.max(mainPaneHeight - 2, 1);
  const chatContentHeight = Math.max(mainPaneHeight - 2, 1);
  const chatBodyHeight = Math.max(chatContentHeight - 1 - (privateKeyError ? 1 : 0), MIN_VISIBLE_MESSAGE_LINES);
  const renderedMessageLines = useMemo(
    () => formatMessageLines(messages, chatContentWidth),
    [chatContentWidth, messages]
  );
  const showScrollStatus = renderedMessageLines.length > chatBodyHeight;
  const visibleMessageLineCount = Math.max(chatBodyHeight - (showScrollStatus ? 1 : 0), 1);
  const messageWindowEnd = Math.max(renderedMessageLines.length - messageScrollOffset, 0);
  const messageWindowStart = Math.max(messageWindowEnd - visibleMessageLineCount, 0);
  const visibleMessageLines = renderedMessageLines.slice(messageWindowStart, messageWindowEnd);
  const visibleConversations = useMemo(
    () => getVisibleConversationEntries(conversations, selectedIndex, sidebarContentHeight - 1, sidebarContentWidth),
    [conversations, selectedIndex, sidebarContentHeight, sidebarContentWidth]
  );
  const footerText = truncateLine(
    focus === "chat" ? `> ${composeText}` : composeText,
    footerContentWidth,
    conversationPendingDeletion
      ? `Delete ${conversationPendingDeletion.label}? Press y to confirm or Esc to cancel.`
      : composeText
      ? undefined
      : "Type a message, /nickname <name>, press n for new chat, press d to delete a chat, or use Up/Down/PageUp/PageDown to scroll"
  );

  useEffect(() => {
    let cancelled = false;

    void client.connect(profile).then(
      () => {
        if (!cancelled) {
          setStatus("Connected");
          setIsConnected(true);
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : "Connection failed");
          setIsConnected(false);
        }
      }
    );

    client.on("disconnected", (reason) => {
      setStatus(reason);
      setIsConnected(false);
      setPresence({});
    });
    client.on("presenceResult", (frame) => {
      setPresence((current) => ({ ...current, [frame.fingerprint]: frame.online }));
    });
    client.on("messageDelivery", (frame) => {
      if (!frame.accepted) {
        store.updateDeliveryState(frame.messageId, "failed");
      } else {
        store.updateDeliveryState(frame.messageId, "sent", frame.messageId);
      }
      refreshConversations();
      void loadMessages();
    });
    client.on("incomingMessage", (frame) => {
      const conversation = store.upsertConversation(frame.senderFingerprint, frame.senderPublicKeyArmored);
      store.insertMessage({
        id: frame.messageId,
        conversationId: conversation.id,
        direction: "incoming",
        senderFingerprint: frame.senderFingerprint,
        recipientFingerprint: profile.publicKeyFingerprint,
        sentAt: frame.receivedAt,
        receivedAt: frame.receivedAt,
        ciphertextArmored: frame.ciphertextArmored,
        signatureFingerprint: frame.senderFingerprint,
        deliveryState: "received",
        serverMessageId: frame.messageId
      });
      refreshConversations();
      void loadMessages();
    });
    client.on("errorFrame", (_code, message) => setStatus(message));

    return () => {
      cancelled = true;
      client.disconnect();
    };
  }, [client, profile, store]);

  useEffect(() => {
    setMessageLimit(100);
    setMessageScrollOffset(0);
    void loadMessages(100);
    if (!selectedConversation || !isConnected) {
      return;
    }

    const queryPresence = (): void => {
      client.send({
        type: "presence_query",
        requestId: generateId(),
        fingerprint: selectedConversation.peerFingerprint
      });
    };

    queryPresence();
    const interval = setInterval(queryPresence, 5_000);
    return () => clearInterval(interval);
  }, [isConnected, selectedConversation?.id]);

  function refreshConversations(): void {
    setConversations(store.listConversations());
  }

  async function loadMessages(limit = messageLimitRef.current, conversation = selectedConversationRef.current): Promise<void> {
    if (!conversation) {
      setMessages([]);
      return;
    }

    const conversationId = conversation.id;

    try {
      const privateKey = await readPrivateKey(profile.privateKeyArmored, passphraseRef.current);
      const stored = store.getMessages(conversationId, limit).reverse();
      const decrypted = await Promise.all(
        stored.map(async (message) => {
          const verificationKey =
            message.direction === "outgoing" ? profile.publicKeyArmored : conversation.peerPublicKeyArmored;
          try {
            const result = await decryptMessage(message.ciphertextArmored, privateKey, verificationKey);
            return {
              ...message,
              plaintext: result.plaintext,
              verified: result.verified,
              verificationError: result.verificationError
            };
          } catch (error) {
            return {
              ...message,
              plaintext: "[Unable to decrypt message]",
              verified: false,
              verificationError: error instanceof Error ? error.message : "Decrypt failed"
            };
          }
        })
      );
      if (selectedConversationRef.current?.id !== conversationId) {
        return;
      }
      setPrivateKeyError(undefined);
      setMessages(decrypted);
    } catch (error) {
      if (selectedConversationRef.current?.id !== conversationId) {
        return;
      }
      setPrivateKeyError(error instanceof Error ? error.message : "Unable to load private key");
      setMessages([]);
    }
  }

  async function sendMessage(): Promise<void> {
    if (!selectedConversation || !composeText.trim()) {
      return;
    }

    if (composeText.startsWith("/nickname ")) {
      const nickname = composeText.slice("/nickname ".length).trim();
      store.setNickname(selectedConversation.id, nickname || null);
      setComposeText("");
      refreshConversations();
      return;
    }

    if (!isConnected) {
      setStatus("Not connected");
      return;
    }

    if (!presence[selectedConversation.peerFingerprint]) {
      setStatus("Recipient is offline");
      return;
    }

    const privateKey = await readPrivateKey(profile.privateKeyArmored, passphrase);
    const composed = await composeEncryptedMessage(composeText, privateKey, selectedConversation.peerPublicKeyArmored);
    const messageId = generateId();

    store.insertMessage({
      id: messageId,
      conversationId: selectedConversation.id,
      direction: "outgoing",
      senderFingerprint: profile.publicKeyFingerprint,
      recipientFingerprint: selectedConversation.peerFingerprint,
      sentAt: unixNow(),
      receivedAt: null,
      ciphertextArmored: composed.ciphertextArmored,
      signatureFingerprint: composed.signatureFingerprint,
      deliveryState: "failed",
      serverMessageId: null
    });

    client.send({
      type: "send_message",
      requestId: generateId(),
      messageId,
      recipientFingerprint: selectedConversation.peerFingerprint,
      ciphertextArmored: composed.ciphertextArmored
    });

    setComposeText("");
    setMessageScrollOffset(0);
    refreshConversations();
    await loadMessages();
  }

  async function createConversationFromInput(): Promise<void> {
    if (!newChatKeyInput.trim()) {
      setNewChatMode(false);
      return;
    }

    try {
      const conversation = await createConversation(store, normalizeArmoredKey(newChatKeyInput));
      refreshConversations();
      const updated = store.listConversations();
      const nextIndex = updated.findIndex((entry) => entry.id === conversation.id);
      setSelectedIndex(nextIndex >= 0 ? nextIndex : 0);
      setStatus("Conversation created");
      setNewChatKeyInput("");
      setNewChatError(undefined);
      setNewChatMode(false);
      setMessageScrollOffset(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create conversation";
      setNewChatError(message);
      setStatus(message);
    }
  }

  function openNewChat(): void {
    setNewChatMode(true);
    setNewChatKeyInput("");
    setNewChatError(undefined);
    setStatus("New chat: paste the full armored public key, then press Ctrl+S to create.");
  }

  function closeNewChat(): void {
    setNewChatMode(false);
    setNewChatKeyInput("");
    setNewChatError(undefined);
    setStatus("Connected");
  }

  function beginDeleteConversation(): void {
    if (!selectedConversation) {
      setStatus("No conversation selected");
      return;
    }

    setConversationPendingDeletion({
      id: selectedConversation.id,
      label: getConversationLabel(selectedConversation)
    });
    setFocus("sidebar");
    setStatus(`Delete conversation ${getConversationLabel(selectedConversation)}? Press y to confirm or Esc to cancel.`);
  }

  function cancelDeleteConversation(): void {
    setConversationPendingDeletion(undefined);
    setStatus("Connected");
  }

  function confirmDeleteConversation(): void {
    if (!conversationPendingDeletion) {
      return;
    }

    const deletedConversationIndex = conversations.findIndex(
      (conversation) => conversation.id === conversationPendingDeletion.id
    );
    store.deleteConversation(conversationPendingDeletion.id);
    const updated = store.listConversations();
    const nextSelectedIndex =
      updated.length === 0
        ? 0
        : deletedConversationIndex >= 0
        ? Math.min(deletedConversationIndex, Math.max(updated.length - 1, 0))
        : 0;
    setConversations(updated);
    setConversationPendingDeletion(undefined);
    setComposeText("");
    setMessageScrollOffset(0);
    setMessageLimit(100);
    setSelectedIndex(nextSelectedIndex);
    setStatus(`Deleted conversation ${conversationPendingDeletion.label}`);
  }

  function appendToNewChatInput(value: string): void {
    setNewChatKeyInput((current) => current + value.replace(/\r/g, ""));
    if (newChatError) {
      setNewChatError(undefined);
    }
  }

  useInput((input, key) => {
    if (key.ctrl && input.toLowerCase() === "k" && !newChatMode) {
      setShowPublicKey((current) => !current);
      return;
    }

    if (showPublicKey) {
      if (key.escape || key.return || input.toLowerCase() === "q") {
        setShowPublicKey(false);
      }
      return;
    }

    if (conversationPendingDeletion) {
      if (key.escape) {
        cancelDeleteConversation();
        return;
      }
      if (input.toLowerCase() === "y") {
        confirmDeleteConversation();
      }
      return;
    }

    if (newChatMode) {
      if (key.escape) {
        closeNewChat();
        return;
      }
      if (key.ctrl && input.toLowerCase() === "s") {
        void createConversationFromInput();
        return;
      }
      if (key.return) {
        appendToNewChatInput("\n");
        return;
      }
      if (key.backspace || key.delete) {
        setNewChatKeyInput((current) => current.slice(0, -1));
        if (newChatError) {
          setNewChatError(undefined);
        }
        return;
      }
      if (!key.ctrl && !key.meta && input) {
        appendToNewChatInput(input);
      }
      return;
    }

    if (key.tab) {
      setFocus((current) => (current === "sidebar" ? "chat" : "sidebar"));
      return;
    }

    if (focus === "sidebar") {
      if (key.downArrow) {
        setSelectedIndex((current) => Math.min(current + 1, Math.max(conversations.length - 1, 0)));
      }
      if (key.upArrow) {
        setSelectedIndex((current) => Math.max(current - 1, 0));
      }
      if (input.toLowerCase() === "n") {
        openNewChat();
      }
      if (input.toLowerCase() === "d") {
        beginDeleteConversation();
      }
      return;
    }

    if (key.return) {
      void sendMessage();
      return;
    }

    if (key.backspace || key.delete) {
      setComposeText((current) => current.slice(0, -1));
      return;
    }

    if (key.pageUp || key.upArrow) {
      const step = key.upArrow ? ARROW_SCROLL_STEP : SCROLL_STEP;
      const nextOffset = Math.min(messageScrollOffset + step, Math.max(renderedMessageLines.length - 1, 0));
      setMessageScrollOffset(nextOffset);
      if (messageWindowStart === 0) {
        const nextLimit = messageLimit + 100;
        setMessageLimit(nextLimit);
        void loadMessages(nextLimit);
      }
      return;
    }

    if (key.pageDown || key.downArrow) {
      const step = key.downArrow ? ARROW_SCROLL_STEP : SCROLL_STEP;
      setMessageScrollOffset((current) => Math.max(current - step, 0));
      return;
    }

    if (!key.ctrl && !key.meta && input) {
      setComposeText((current) => current + input);
    }
  });

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" paddingX={1}>
        <Text>
          Profile {profile.profileName} ({truncateFingerprint(profile.publicKeyFingerprint)}) | {status} | press Ctrl+K for your public key
        </Text>
      </Box>
      {showPublicKey ? (
        <Box borderStyle="round" flexDirection="column" paddingX={1} marginTop={1}>
          <Text color="cyan">My Public Key</Text>
          <Text>Share the full armored public key below so others can start a chat with you.</Text>
          <Text>Fingerprint: {profile.publicKeyFingerprint}</Text>
          <Text dimColor>File: ~/.thekeeper/keys/{profile.profileName}/public.asc</Text>
          <Text dimColor>Press Ctrl+K, q, Enter, or Esc to close.</Text>
          <Box flexDirection="column" marginTop={1}>
            {publicKeyLines.map((line, index) => (
              <Text key={`${index}-${line}`}>{line}</Text>
            ))}
          </Box>
        </Box>
      ) : newChatMode ? (
        <Box borderStyle="round" flexDirection="column" paddingX={1} marginTop={1}>
          <Text color="cyan">New Chat</Text>
          <Text>Paste the recipient's full armored public key.</Text>
          <Text dimColor>Enter inserts a newline. Press Ctrl+S to create. Esc cancels.</Text>
          {newChatError ? <Text color="red">{newChatError}</Text> : null}
          <Text dimColor>Lines captured: {newChatKeyInput ? newChatKeyInput.split("\n").length : 0}</Text>
          <Box flexDirection="column" marginTop={1}>
            {newChatPreviewLines.length > 0 ? (
              newChatPreviewLines.map((line, index) => <Text key={`${index}-${line}`}>{line || " "}</Text>)
            ) : (
              <Text dimColor>Waiting for key input...</Text>
            )}
          </Box>
        </Box>
      ) : conversationPendingDeletion ? (
        <Box borderStyle="round" flexDirection="column" paddingX={1} marginTop={1}>
          <Text color="red">Delete Conversation</Text>
          <Text>{`Delete ${conversationPendingDeletion.label} and all local messages?`}</Text>
          <Text dimColor>Press y to confirm. Esc cancels.</Text>
        </Box>
      ) : (
        <Box height={mainPaneHeight} overflow="hidden">
          <Box width="30%" borderStyle="round" flexDirection="column" paddingX={1} overflow="hidden">
            <Text color={focus === "sidebar" ? "cyan" : undefined}>
              {truncateLine("Conversations (n=new, d=delete)", sidebarContentWidth)}
            </Text>
            {conversations.length === 0 ? <Text dimColor>{truncateLine("No chats yet", sidebarContentWidth)}</Text> : null}
            {visibleConversations.map((conversation) => (
              <Text key={conversation.id} inverse={conversation.isSelected}>
                {conversation.label}
              </Text>
            ))}
          </Box>
          <Box width="70%" borderStyle="round" flexDirection="column" paddingX={1} overflow="hidden">
            <Text color={focus === "chat" ? "cyan" : undefined}>
              {truncateLine(
                selectedConversation
                  ? `${getConversationLabel(selectedConversation)} ${presence[selectedConversation.peerFingerprint] ? "●" : "○"}`
                  : "No conversation selected",
                chatContentWidth
              )}
            </Text>
            {privateKeyError ? <Text color="red">{truncateLine(privateKeyError, chatContentWidth)}</Text> : null}
            <Box flexDirection="column" height={chatBodyHeight} overflow="hidden">
              {renderedMessageLines.length === 0 ? <Text dimColor>{truncateLine("Loading or no messages", chatContentWidth)}</Text> : null}
              {visibleMessageLines.map((line) => (
                <Text key={line.key} dimColor={line.dimColor}>
                  {line.text}
                </Text>
              ))}
              {showScrollStatus ? (
                <Text dimColor>
                  {truncateLine(
                    `Showing ${messageWindowStart + 1}-${messageWindowEnd} of ${renderedMessageLines.length}. Up/Down or PageUp/PageDown to scroll.`,
                    chatContentWidth
                  )}
                </Text>
              ) : null}
            </Box>
          </Box>
        </Box>
      )}
      <Box borderStyle="round" paddingX={1}>
        <Text>{footerText}</Text>
      </Box>
    </Box>
  );
}

export async function createConversation(
  store: ConversationStore,
  recipientPublicKeyArmored: string
): Promise<Conversation> {
  const fingerprint = await fingerprintForPublicKey(recipientPublicKeyArmored);
  return store.upsertConversation(fingerprint, recipientPublicKeyArmored);
}

function normalizeArmoredKey(value: string): string {
  const normalized = value.replace(/\r/g, "").trim();
  if (!normalized) {
    return normalized;
  }

  if (normalized.includes("\n")) {
    return normalized;
  }

  const match = normalized.match(
    /-----BEGIN PGP PUBLIC KEY BLOCK-----\s*([A-Za-z0-9+/=\s]+?)\s*(=[A-Za-z0-9+/]+)\s*-----END PGP PUBLIC KEY BLOCK-----/
  );

  if (!match) {
    return normalized;
  }

  const [, body, checksum] = match;
  const compactBody = body.replace(/\s+/g, "");
  const wrappedBody = compactBody.match(/.{1,64}/g)?.join("\n") ?? compactBody;

  return [
    "-----BEGIN PGP PUBLIC KEY BLOCK-----",
    "",
    wrappedBody,
    checksum,
    "-----END PGP PUBLIC KEY BLOCK-----"
  ].join("\n");
}

interface RenderedLine {
  key: string;
  text: string;
  dimColor?: boolean;
}

interface VisibleConversationEntry {
  id: string;
  label: string;
  isSelected: boolean;
}

function formatMessageLines(messages: DecryptedMessage[], width: number): RenderedLine[] {
  const safeWidth = Math.max(width, 8);

  return messages.flatMap((message) => {
    const prefix = `[${message.direction === "outgoing" ? "You" : "Peer"}] `;
    const continuationPrefix = " ".repeat(prefix.length);
    const suffix = !message.verified ? " [unverified]" : "";
    const content = `${message.plaintext}${suffix}`;
    const wrapped = wrapPrefixedText(prefix, continuationPrefix, content, safeWidth);

    return wrapped.map((line, index) => ({
      key: `${message.id}-${index}`,
      text: line,
      dimColor: false
    }));
  });
}

function getVisibleConversationEntries(
  conversations: Conversation[],
  selectedIndex: number,
  maxRows: number,
  width: number
): VisibleConversationEntry[] {
  if (conversations.length === 0 || maxRows <= 0) {
    return [];
  }

  const visibleRows = Math.max(maxRows, 1);
  const maxStart = Math.max(conversations.length - visibleRows, 0);
  const desiredStart = Math.max(selectedIndex - visibleRows + 1, 0);
  const startIndex = Math.min(desiredStart, maxStart);

  return conversations.slice(startIndex, startIndex + visibleRows).map((conversation, index) => ({
    id: conversation.id,
    label: truncateLine(getConversationLabel(conversation), width),
    isSelected: startIndex + index === selectedIndex
  }));
}

function getConversationLabel(conversation: Conversation): string {
  return conversation.nickname || truncateFingerprint(conversation.peerFingerprint);
}

function wrapPrefixedText(prefix: string, continuationPrefix: string, text: string, width: number): string[] {
  const contentWidth = Math.max(width - prefix.length, 1);
  const wrapped = wrapText(text, contentWidth);

  return wrapped.map((line, index) => `${index === 0 ? prefix : continuationPrefix}${line}`);
}

function wrapText(value: string, width: number): string[] {
  if (width <= 0) {
    return [""];
  }

  const normalized = value.replace(/\r/g, "");
  const segments = normalized.split("\n");
  const lines: string[] = [];

  for (const segment of segments) {
    if (!segment) {
      lines.push("");
      continue;
    }

    let remaining = segment;
    while (remaining.length > width) {
      lines.push(remaining.slice(0, width));
      remaining = remaining.slice(width);
    }
    lines.push(remaining);
  }

  return lines.length > 0 ? lines : [""];
}

function truncateLine(value: string, width: number, fallback?: string): string {
  const source = value || fallback || "";
  if (width <= 0) {
    return "";
  }
  if (source.length <= width) {
    return source;
  }
  if (width <= 1) {
    return source.slice(0, width);
  }

  return `${source.slice(0, width - 1)}…`;
}

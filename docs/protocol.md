# TheKeeper Protocol v1

Transport: WebSocket JSON frames.

## Client -> Server

### `register`

```json
{
  "type": "register",
  "fingerprint": "string",
  "publicKeyArmored": "string"
}
```

### `heartbeat`

```json
{
  "type": "heartbeat"
}
```

### `presence_query`

```json
{
  "type": "presence_query",
  "requestId": "string",
  "fingerprint": "string"
}
```

### `send_message`

```json
{
  "type": "send_message",
  "requestId": "string",
  "messageId": "string",
  "recipientFingerprint": "string",
  "ciphertextArmored": "string"
}
```

### `return_message`

```json
{
  "type": "return_message",
  "messageId": "string",
  "senderFingerprint": "string"
}
```

## Server -> Client

### `register_ok`

```json
{
  "type": "register_ok",
  "fingerprint": "string",
  "serverTime": 0
}
```

### `presence_result`

```json
{
  "type": "presence_result",
  "requestId": "string",
  "fingerprint": "string",
  "online": true
}
```

### `message_delivery`

```json
{
  "type": "message_delivery",
  "requestId": "string",
  "messageId": "string",
  "accepted": true,
  "reason": ""
}
```

### `incoming_message`

```json
{
  "type": "incoming_message",
  "messageId": "string",
  "senderFingerprint": "string",
  "senderPublicKeyArmored": "string",
  "ciphertextArmored": "string",
  "receivedAt": 0
}
```

### `error`

```json
{
  "type": "error",
  "code": "string",
  "message": "string"
}
```

## Delivery Semantics

- Presence is in-memory only.
- The server stores no durable messages.
- `message_delivery.accepted=true` means the server forwarded the opaque ciphertext to an online peer.
- `message_delivery.accepted=false` with `reason="returned_to_sender"` means the recipient client rejected the forwarded message and sent it back.
- Only one active session per fingerprint is allowed; a newer session replaces the older one.
- Clients send a heartbeat every 10 seconds.
- The server expires a client after 30 seconds without a heartbeat.

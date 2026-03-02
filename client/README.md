# thekeeper-client

Terminal client for TheKeeper encrypted chat.

## Install

```bash
npm install --global thekeeper-client
```

## Run

```bash
thekeeper
```

Alias:

```bash
keeper
```

The client connects to `ws://127.0.0.1:8787/ws` by default.

## Configuration

On first run, the client creates its data under `~/.thekeeper/`.

- Config file: `~/.thekeeper/config.toml`
- Keys: `~/.thekeeper/keys/`
- Conversations: `~/.thekeeper/conversations/`

You can override the configured server URL with `THEKEEPER_SERVER_URL`.

Example config:

```toml
[server]
url = "wss://chat.example.com/ws"
```

## Development

```bash
npm install
npm test
npm run build
npm run pack:dry-run
```

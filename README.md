# TheKeeper

The Keeper allows you to send encrypted communications using a easy to use TUI client.

## Install The Client

Install the published client from npm:

```bash
npm install --global thekeeper-client
```

Run it with:

```bash
thekeeper
```

Alias:

```bash
keeper
```

## Development

Client:

```bash
cd client
npm install
npm run build
```

Server:

```bash
cd server
go test ./...
go build ./...
```

## Docker

Build and run the server container locally:

```bash
docker build -t thekeeper-server ./server
docker run --rm -p 8787:8787 -e THEKEEPER_SERVER_ADDR=0.0.0.0:8787 thekeeper-server
```

An example Compose file is available at `compose.server.example.yml` and pulls the published server image from GitHub Container Registry:

```bash
docker compose -f compose.server.example.yml up
```

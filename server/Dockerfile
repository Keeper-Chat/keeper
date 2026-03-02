FROM golang:1.22-alpine AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o /out/thekeeper-server ./cmd/thekeeper-server

FROM alpine:3.20

RUN adduser -D -H -u 10001 thekeeper

USER thekeeper
WORKDIR /app

COPY --from=builder /out/thekeeper-server /app/thekeeper-server

EXPOSE 8787

ENV THEKEEPER_SERVER_ADDR=0.0.0.0:8787

ENTRYPOINT ["/app/thekeeper-server"]

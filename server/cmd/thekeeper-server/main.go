package main

import (
	"log"
	"net/http"
	"os"

	"github.com/irrelevant/thekeeper/server/internal/ws"
)

func main() {
	server := ws.NewServer()
	stop := make(chan struct{})
	go server.RunSweeper(stop)

	addr := listenAddr()
	log.Printf("thekeeper server listening on %s", addr)
	if err := http.ListenAndServe(addr, server.Handler()); err != nil {
		close(stop)
		log.Fatal(err)
	}
}

func listenAddr() string {
	if addr := os.Getenv("THEKEEPER_SERVER_ADDR"); addr != "" {
		return addr
	}

	return "127.0.0.1:8787"
}

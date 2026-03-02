package main

import (
	"log"
	"net/http"

	"github.com/irrelevant/thekeeper/server/internal/ws"
)

func main() {
	server := ws.NewServer()
	stop := make(chan struct{})
	go server.RunSweeper(stop)

	addr := "127.0.0.1:8787"
	log.Printf("thekeeper server listening on %s", addr)
	if err := http.ListenAndServe(addr, server.Handler()); err != nil {
		close(stop)
		log.Fatal(err)
	}
}

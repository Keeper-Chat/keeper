package main

import "testing"

func TestListenAddrDefaults(t *testing.T) {
	t.Setenv("THEKEEPER_SERVER_ADDR", "")

	if got := listenAddr(); got != "127.0.0.1:8787" {
		t.Fatalf("listenAddr() = %q, want %q", got, "127.0.0.1:8787")
	}
}

func TestListenAddrUsesEnvironmentOverride(t *testing.T) {
	t.Setenv("THEKEEPER_SERVER_ADDR", "0.0.0.0:8787")

	if got := listenAddr(); got != "0.0.0.0:8787" {
		t.Fatalf("listenAddr() = %q, want %q", got, "0.0.0.0:8787")
	}
}

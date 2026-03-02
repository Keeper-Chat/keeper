package ws

import (
	"errors"
	"testing"

	"github.com/irrelevant/thekeeper/server/internal/protocol"
)

type fakeJSONConn struct {
	writeErr error
	writes   []any
	closed   bool
}

func (c *fakeJSONConn) WriteJSON(v any) error {
	if c.writeErr != nil {
		return c.writeErr
	}
	c.writes = append(c.writes, v)
	return nil
}

func (c *fakeJSONConn) Close() error {
	c.closed = true
	return nil
}

func TestValidateRegistrationAcceptsOpenPGPjsEd25519Key(t *testing.T) {
	frame := protocol.RegisterFrame{
		Type:        "register",
		Fingerprint: "482a559afa1407eef441afa2fdda72b78d35ebe3",
		PublicKeyArmored: `-----BEGIN PGP PUBLIC KEY BLOCK-----

xjMEaaUERhYJKwYBBAHaRw8BAQdAqgVrIl9Qk05Sr/6c8H9bjtLCmGjI2lcG
w7eEsGcz6WTNCXRoZWtlZXBlcsLAEwQTFgoAhQWCaaUERgMLCQcJEP3acreN
NevjRRQAAAAAABwAIHNhbHRAbm90YXRpb25zLm9wZW5wZ3Bqcy5vcmdgY13J
m08aoglDan89rIdTxyTHAZOV0+XKuS4sLUx2+wUVCggODAQWAAIBAhkBApsD
Ah4BFiEESCpVmvoUB+70Qa+i/dpyt4016+MAAJiBAP9T37jDD4QCdD2yXE4Z
Iuy7suGQ1TLTKk/y/UmCGx+mgQEA5EcI+izXKbknb+3fs1x3Rm2x0tOJ6MXc
h7oV/0H0OQXOOARppQRGEgorBgEEAZdVAQUBAQdAxgFIkOYsss9AO31vIJtq
BOdKJx4wcXTcn36+FYPCQUUDAQgHwr4EGBYKAHAFgmmlBEYJEP3acreNNevj
RRQAAAAAABwAIHNhbHRAbm90YXRpb25zLm9wZW5wZ3Bqcy5vcmeiVV5gh0T7
Thf1diWrM0EQV+b/8L4SYXbktf8g1Qp2QgKbDBYhBEgqVZr6FAfu9EGvov3a
creNNevjAABexAD/aZyCy8i19mBbKR3Gg27v9Yzhet1df/8CAdq7Qs3+R4EB
AL+m+i0Tt5qSUsd2nsBsAOlSolmS07YhdD8nzaGnkbQI
=4e93
-----END PGP PUBLIC KEY BLOCK-----`,
	}

	if err := validateRegistration(frame); err != nil {
		t.Fatalf("expected generated OpenPGP.js key to validate, got %v", err)
	}
}

func TestValidateRegistrationRejectsMismatch(t *testing.T) {
	frame := protocol.RegisterFrame{
		Type:             "register",
		Fingerprint:      "not-a-real-fingerprint",
		PublicKeyArmored: "-----BEGIN PGP PUBLIC KEY BLOCK-----\ninvalid\n-----END PGP PUBLIC KEY BLOCK-----",
	}

	if err := validateRegistration(frame); err == nil {
		t.Fatalf("expected invalid registration to fail")
	}
}

func TestRegisterClientReplacesDuplicateFingerprint(t *testing.T) {
	server := NewServer()
	firstTransport := &fakeJSONConn{}
	secondTransport := &fakeJSONConn{}
	firstClient := &clientConn{conn: firstTransport}
	secondClient := &clientConn{conn: secondTransport}

	frame := protocol.RegisterFrame{
		Type:        "register",
		Fingerprint: "482a559afa1407eef441afa2fdda72b78d35ebe3",
		PublicKeyArmored: `-----BEGIN PGP PUBLIC KEY BLOCK-----

xjMEaaUERhYJKwYBBAHaRw8BAQdAqgVrIl9Qk05Sr/6c8H9bjtLCmGjI2lcG
w7eEsGcz6WTNCXRoZWtlZXBlcsLAEwQTFgoAhQWCaaUERgMLCQcJEP3acreN
NevjRRQAAAAAABwAIHNhbHRAbm90YXRpb25zLm9wZW5wZ3Bqcy5vcmdgY13J
m08aoglDan89rIdTxyTHAZOV0+XKuS4sLUx2+wUVCggODAQWAAIBAhkBApsD
Ah4BFiEESCpVmvoUB+70Qa+i/dpyt4016+MAAJiBAP9T37jDD4QCdD2yXE4Z
Iuy7suGQ1TLTKk/y/UmCGx+mgQEA5EcI+izXKbknb+3fs1x3Rm2x0tOJ6MXc
h7oV/0H0OQXOOARppQRGEgorBgEEAZdVAQUBAQdAxgFIkOYsss9AO31vIJtq
BOdKJx4wcXTcn36+FYPCQUUDAQgHwr4EGBYKAHAFgmmlBEYJEP3acreNNevj
RRQAAAAAABwAIHNhbHRAbm90YXRpb25zLm9wZW5wZ3Bqcy5vcmeiVV5gh0T7
Thf1diWrM0EQV+b/8L4SYXbktf8g1Qp2QgKbDBYhBEgqVZr6FAfu9EGvov3a
creNNevjAABexAD/aZyCy8i19mBbKR3Gg27v9Yzhet1df/8CAdq7Qs3+R4EB
AL+m+i0Tt5qSUsd2nsBsAOlSolmS07YhdD8nzaGnkbQI
=4e93
-----END PGP PUBLIC KEY BLOCK-----`,
	}

	if errorFrame := server.registerClient(firstClient, frame); errorFrame != nil {
		t.Fatalf("expected first client to register successfully, got %+v", errorFrame)
	}
	if firstClient.fingerprint != frame.Fingerprint {
		t.Fatalf("expected first client fingerprint to be set")
	}

	errorFrame := server.registerClient(secondClient, frame)
	if errorFrame != nil {
		t.Fatalf("expected replacement client to register successfully, got %+v", errorFrame)
	}
	if secondClient.fingerprint != frame.Fingerprint {
		t.Fatalf("expected replacement client fingerprint to be set")
	}
	if !firstTransport.closed {
		t.Fatalf("expected original client connection to be closed")
	}

	session, ok := server.presence.SessionFor(frame.Fingerprint)
	if !ok {
		t.Fatalf("expected replacement client to remain online")
	}
	if session.Session != secondClient {
		t.Fatalf("expected replacement client to remain registered")
	}
}

func TestDeliverMessageReturnsAcceptedAfterSuccessfulRelay(t *testing.T) {
	server := NewServer()
	recipientTransport := &fakeJSONConn{}
	recipient := &clientConn{conn: recipientTransport, fingerprint: "recipient", publicKeyArmored: "recipient-pub"}
	server.presence.Register("recipient", "recipient-pub", recipient)

	sender := &clientConn{fingerprint: "sender", publicKeyArmored: "sender-pub"}
	result := server.deliverMessage(sender, protocol.SendMessageFrame{
		Type:                 "send_message",
		RequestID:            "req-1",
		MessageID:            "msg-1",
		RecipientFingerprint: "recipient",
		CiphertextArmored:    "ciphertext",
	})

	if !result.Accepted {
		t.Fatalf("expected delivery to succeed, got %+v", result)
	}
	if len(recipientTransport.writes) != 1 {
		t.Fatalf("expected one forwarded message, got %d", len(recipientTransport.writes))
	}

	incoming, ok := recipientTransport.writes[0].(protocol.IncomingMessageFrame)
	if !ok {
		t.Fatalf("expected forwarded frame to be an incoming message, got %T", recipientTransport.writes[0])
	}
	if incoming.SenderFingerprint != "sender" {
		t.Fatalf("expected sender fingerprint to be propagated")
	}
	if incoming.SenderPublicKeyArmored != "sender-pub" {
		t.Fatalf("expected sender public key to be propagated")
	}
}

func TestDeliverMessageReturnsUnavailableWhenRelayWriteFails(t *testing.T) {
	server := NewServer()
	recipient := &clientConn{
		conn:             &fakeJSONConn{writeErr: errors.New("write failed")},
		fingerprint:      "recipient",
		publicKeyArmored: "recipient-pub",
	}
	server.presence.Register("recipient", "recipient-pub", recipient)

	sender := &clientConn{fingerprint: "sender", publicKeyArmored: "sender-pub"}
	result := server.deliverMessage(sender, protocol.SendMessageFrame{
		Type:                 "send_message",
		RequestID:            "req-1",
		MessageID:            "msg-1",
		RecipientFingerprint: "recipient",
		CiphertextArmored:    "ciphertext",
	})

	if result.Accepted {
		t.Fatalf("expected delivery failure, got %+v", result)
	}
	if result.Reason != "recipient_unavailable" {
		t.Fatalf("expected recipient_unavailable, got %+v", result)
	}
	if server.presence.IsOnline("recipient") {
		t.Fatalf("expected failed relay recipient to be removed from presence")
	}
}

package ws

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/ProtonMail/go-crypto/openpgp"
	"github.com/gorilla/websocket"
	"github.com/irrelevant/thekeeper/server/internal/presence"
	"github.com/irrelevant/thekeeper/server/internal/protocol"
)

type Server struct {
	presence *presence.Manager
	upgrader websocket.Upgrader
}

func NewServer() *Server {
	return &Server{
		presence: presence.NewManager(30 * time.Second),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", s.handleWS)
	return mux
}

func (s *Server) RunSweeper(stop <-chan struct{}) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			for _, session := range s.presence.ExpireStale() {
				_ = session.Close()
			}
		case <-stop:
			return
		}
	}
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	client := &clientConn{conn: conn}
	defer func() {
		if client.fingerprint != "" {
			s.presence.Unregister(client.fingerprint, client)
		}
		_ = conn.Close()
	}()

	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			return
		}

		var envelope map[string]any
		if err := json.Unmarshal(data, &envelope); err != nil {
			client.write(protocol.ErrorFrame{Type: "error", Code: "bad_json", Message: "Invalid JSON"})
			return
		}

		typeName, _ := envelope["type"].(string)
		switch typeName {
		case "register":
			var frame protocol.RegisterFrame
			if err := json.Unmarshal(data, &frame); err != nil {
				client.write(protocol.ErrorFrame{Type: "error", Code: "bad_register", Message: "Invalid register frame"})
				return
			}
			if errorFrame := s.registerClient(client, frame); errorFrame != nil {
				client.write(*errorFrame)
				return
			}
			client.write(protocol.RegisterOkFrame{Type: "register_ok", Fingerprint: frame.Fingerprint, ServerTime: time.Now().UnixMilli()})
		case "heartbeat":
			if client.fingerprint == "" {
				client.write(protocol.ErrorFrame{Type: "error", Code: "not_registered", Message: "Register before heartbeat"})
				return
			}
			s.presence.Touch(client.fingerprint)
		case "presence_query":
			var frame protocol.PresenceQueryFrame
			if err := json.Unmarshal(data, &frame); err != nil {
				client.write(protocol.ErrorFrame{Type: "error", Code: "bad_presence_query", Message: "Invalid presence query"})
				continue
			}
			client.write(protocol.PresenceResultFrame{
				Type:        "presence_result",
				RequestID:   frame.RequestID,
				Fingerprint: frame.Fingerprint,
				Online:      s.presence.IsOnline(frame.Fingerprint),
			})
		case "send_message":
			var frame protocol.SendMessageFrame
			if err := json.Unmarshal(data, &frame); err != nil {
				client.write(protocol.ErrorFrame{Type: "error", Code: "bad_send_message", Message: "Invalid send frame"})
				continue
			}
			if client.fingerprint == "" {
				client.write(protocol.ErrorFrame{Type: "error", Code: "not_registered", Message: "Register before sending"})
				continue
			}
			client.write(s.deliverMessage(client, frame))
		case "return_message":
			var frame protocol.ReturnMessageFrame
			if err := json.Unmarshal(data, &frame); err != nil {
				client.write(protocol.ErrorFrame{Type: "error", Code: "bad_return_message", Message: "Invalid return frame"})
				continue
			}
			if client.fingerprint == "" {
				client.write(protocol.ErrorFrame{Type: "error", Code: "not_registered", Message: "Register before returning"})
				continue
			}
			s.returnMessage(client, frame)
		default:
			client.write(protocol.ErrorFrame{Type: "error", Code: "unknown_frame_type", Message: "Unknown frame type"})
		}
	}
}

func validateRegistration(frame protocol.RegisterFrame) error {
	entities, err := openpgp.ReadArmoredKeyRing(strings.NewReader(frame.PublicKeyArmored))
	if err != nil {
		return err
	}
	if len(entities) == 0 {
		return fmt.Errorf("missing public key")
	}
	fingerprint := entities[0].PrimaryKey.Fingerprint
	if strings.ToLower(frame.Fingerprint) != strings.ToLower(fmt.Sprintf("%x", fingerprint)) {
		return fmt.Errorf("fingerprint mismatch")
	}
	return nil
}

func (s *Server) registerClient(client *clientConn, frame protocol.RegisterFrame) *protocol.ErrorFrame {
	if err := validateRegistration(frame); err != nil {
		return &protocol.ErrorFrame{Type: "error", Code: "bad_register", Message: err.Error()}
	}

	client.fingerprint = frame.Fingerprint
	client.publicKeyArmored = frame.PublicKeyArmored

	replaced := s.presence.Register(frame.Fingerprint, frame.PublicKeyArmored, client)
	if replaced != nil {
		_ = replaced.Close()
	}
	return nil
}

func (s *Server) deliverMessage(sender *clientConn, frame protocol.SendMessageFrame) protocol.MessageDeliveryFrame {
	recipient, ok := s.presence.SessionFor(frame.RecipientFingerprint)
	if !ok {
		return protocol.MessageDeliveryFrame{
			Type:      "message_delivery",
			RequestID: frame.RequestID,
			MessageID: frame.MessageID,
			Accepted:  false,
			Reason:    "recipient_offline",
		}
	}

	relay, ok := recipient.Session.(*clientConn)
	if !ok {
		return protocol.MessageDeliveryFrame{
			Type:      "message_delivery",
			RequestID: frame.RequestID,
			MessageID: frame.MessageID,
			Accepted:  false,
			Reason:    "recipient_unavailable",
		}
	}

	if err := relay.write(protocol.IncomingMessageFrame{
		Type:                   "incoming_message",
		MessageID:              frame.MessageID,
		SenderFingerprint:      sender.fingerprint,
		SenderPublicKeyArmored: sender.publicKeyArmored,
		CiphertextArmored:      frame.CiphertextArmored,
		ReceivedAt:             time.Now().UnixMilli(),
	}); err != nil {
		s.presence.Unregister(frame.RecipientFingerprint, relay)
		return protocol.MessageDeliveryFrame{
			Type:      "message_delivery",
			RequestID: frame.RequestID,
			MessageID: frame.MessageID,
			Accepted:  false,
			Reason:    "recipient_unavailable",
		}
	}

	return protocol.MessageDeliveryFrame{
		Type:      "message_delivery",
		RequestID: frame.RequestID,
		MessageID: frame.MessageID,
		Accepted:  true,
		Reason:    "",
	}
}

func (s *Server) returnMessage(recipient *clientConn, frame protocol.ReturnMessageFrame) {
	session, ok := s.presence.SessionFor(frame.SenderFingerprint)
	if !ok {
		return
	}

	sender, ok := session.Session.(*clientConn)
	if !ok {
		return
	}

	if err := sender.write(protocol.MessageDeliveryFrame{
		Type:      "message_delivery",
		RequestID: "",
		MessageID: frame.MessageID,
		Accepted:  false,
		Reason:    "returned_to_sender",
	}); err != nil {
		s.presence.Unregister(frame.SenderFingerprint, sender)
	}
}

type clientConn struct {
	conn             jsonConn
	fingerprint      string
	publicKeyArmored string
	writeMu          sync.Mutex
}

type jsonConn interface {
	WriteJSON(v any) error
	Close() error
}

func (c *clientConn) Close() error {
	if c.conn == nil {
		return nil
	}
	return c.conn.Close()
}

func (c *clientConn) write(frame any) error {
	if c.conn == nil {
		return fmt.Errorf("connection unavailable")
	}

	c.writeMu.Lock()
	defer c.writeMu.Unlock()

	if err := c.conn.WriteJSON(frame); err != nil {
		log.Printf("write error: %v", err)
		return err
	}
	return nil
}

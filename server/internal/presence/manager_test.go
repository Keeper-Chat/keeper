package presence

import (
	"testing"
	"time"
)

type testSession struct {
	closed bool
}

func (s *testSession) Close() error {
	s.closed = true
	return nil
}

func TestRegisterReplacesDuplicateSession(t *testing.T) {
	manager := NewManager(30 * time.Second)
	oldSession := &testSession{}
	newSession := &testSession{}

	if replaced := manager.Register("abc", "pub1", oldSession); replaced != nil {
		t.Fatalf("expected first register to succeed without replacement")
	}

	replaced := manager.Register("abc", "pub1", newSession)
	if replaced != oldSession {
		t.Fatalf("expected duplicate register to replace the old session")
	}

	session, ok := manager.SessionFor("abc")
	if !ok {
		t.Fatalf("expected replacement session to remain online")
	}
	if session.Session != newSession {
		t.Fatalf("expected replacement session to remain registered")
	}
}

func TestExpireStaleSessions(t *testing.T) {
	manager := NewManager(30 * time.Second)
	current := time.Now()
	manager.now = func() time.Time { return current }
	session := &testSession{}
	if replaced := manager.Register("abc", "pub1", session); replaced != nil {
		t.Fatalf("expected register to succeed without replacement")
	}

	current = current.Add(31 * time.Second)
	expired := manager.ExpireStale()
	if len(expired) != 1 {
		t.Fatalf("expected one expired session, got %d", len(expired))
	}
	if manager.IsOnline("abc") {
		t.Fatalf("expected session to be offline after expiration")
	}
}

func TestUnregisterIgnoresDifferentSession(t *testing.T) {
	manager := NewManager(30 * time.Second)
	original := &testSession{}
	other := &testSession{}

	if replaced := manager.Register("abc", "pub1", original); replaced != nil {
		t.Fatalf("expected register to succeed without replacement")
	}

	manager.Unregister("abc", other)

	session, ok := manager.SessionFor("abc")
	if !ok {
		t.Fatalf("expected original session to remain online")
	}
	if session.Session != original {
		t.Fatalf("expected original session to remain registered")
	}
}

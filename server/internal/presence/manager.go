package presence

import (
	"sync"
	"time"
)

type Session interface {
	Close() error
}

type ClientSession struct {
	Fingerprint      string
	PublicKeyArmored string
	Session          Session
	LastHeartbeat    time.Time
}

type Manager struct {
	mu       sync.RWMutex
	sessions map[string]*ClientSession
	timeout  time.Duration
	now      func() time.Time
}

func NewManager(timeout time.Duration) *Manager {
	return &Manager{
		sessions: make(map[string]*ClientSession),
		timeout:  timeout,
		now:      time.Now,
	}
}

func (m *Manager) Register(fingerprint, publicKeyArmored string, session Session) Session {
	m.mu.Lock()
	defer m.mu.Unlock()

	existing, ok := m.sessions[fingerprint]
	if ok && existing.Session == session {
		existing.PublicKeyArmored = publicKeyArmored
		existing.LastHeartbeat = m.now()
		return nil
	}

	var replaced Session
	if ok {
		replaced = existing.Session
	}

	m.sessions[fingerprint] = &ClientSession{
		Fingerprint:      fingerprint,
		PublicKeyArmored: publicKeyArmored,
		Session:          session,
		LastHeartbeat:    m.now(),
	}

	return replaced
}

func (m *Manager) Touch(fingerprint string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	session, ok := m.sessions[fingerprint]
	if !ok {
		return
	}
	session.LastHeartbeat = m.now()
}

func (m *Manager) Unregister(fingerprint string, session Session) {
	m.mu.Lock()
	defer m.mu.Unlock()

	current, ok := m.sessions[fingerprint]
	if !ok {
		return
	}
	if current.Session != session {
		return
	}

	delete(m.sessions, fingerprint)
}

func (m *Manager) IsOnline(fingerprint string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()

	session, ok := m.sessions[fingerprint]
	if !ok {
		return false
	}
	return m.now().Sub(session.LastHeartbeat) <= m.timeout
}

func (m *Manager) SessionFor(fingerprint string) (*ClientSession, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	session, ok := m.sessions[fingerprint]
	if !ok {
		return nil, false
	}
	if m.now().Sub(session.LastHeartbeat) > m.timeout {
		return nil, false
	}
	return session, true
}

func (m *Manager) ExpireStale() []Session {
	m.mu.Lock()
	defer m.mu.Unlock()

	var expired []Session
	for fingerprint, session := range m.sessions {
		if m.now().Sub(session.LastHeartbeat) <= m.timeout {
			continue
		}
		expired = append(expired, session.Session)
		delete(m.sessions, fingerprint)
	}
	return expired
}

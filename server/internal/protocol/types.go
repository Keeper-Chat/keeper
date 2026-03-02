package protocol

type RegisterFrame struct {
	Type            string `json:"type"`
	Fingerprint     string `json:"fingerprint"`
	PublicKeyArmored string `json:"publicKeyArmored"`
}

type HeartbeatFrame struct {
	Type string `json:"type"`
}

type PresenceQueryFrame struct {
	Type        string `json:"type"`
	RequestID   string `json:"requestId"`
	Fingerprint string `json:"fingerprint"`
}

type SendMessageFrame struct {
	Type                 string `json:"type"`
	RequestID            string `json:"requestId"`
	MessageID            string `json:"messageId"`
	RecipientFingerprint string `json:"recipientFingerprint"`
	CiphertextArmored    string `json:"ciphertextArmored"`
}

type RegisterOkFrame struct {
	Type       string `json:"type"`
	Fingerprint string `json:"fingerprint"`
	ServerTime int64  `json:"serverTime"`
}

type PresenceResultFrame struct {
	Type        string `json:"type"`
	RequestID   string `json:"requestId"`
	Fingerprint string `json:"fingerprint"`
	Online      bool   `json:"online"`
}

type MessageDeliveryFrame struct {
	Type      string `json:"type"`
	RequestID string `json:"requestId"`
	MessageID string `json:"messageId"`
	Accepted  bool   `json:"accepted"`
	Reason    string `json:"reason"`
}

type IncomingMessageFrame struct {
	Type             string `json:"type"`
	MessageID        string `json:"messageId"`
	SenderFingerprint string `json:"senderFingerprint"`
	SenderPublicKeyArmored string `json:"senderPublicKeyArmored"`
	CiphertextArmored string `json:"ciphertextArmored"`
	ReceivedAt       int64  `json:"receivedAt"`
}

type ErrorFrame struct {
	Type    string `json:"type"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

package logger

// Message represents a type-safe branded log message string.
type Message string

func (m Message) String() string {
	return string(m)
}

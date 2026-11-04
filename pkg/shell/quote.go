package shell

import (
	"fmt"
	"regexp"
	"strings"
)

// shellSafe matches a word no POSIX shell reinterprets.
var shellSafe = regexp.MustCompile(`^[A-Za-z0-9_@%+=:,./-]+$`)

// Quote returns word as one POSIX shell word. A word holding an ASCII control
// byte is written byte by byte in $'...' form, so any byte sequence, valid UTF-8 or
// not, reads back unchanged; every other word is single-quoted.
func Quote(word string) string {
	if shellSafe.MatchString(word) {
		return word
	}
	if !strings.ContainsFunc(word, isASCIIControl) {
		return "'" + strings.ReplaceAll(word, "'", `'\''`) + "'"
	}
	var b strings.Builder
	b.WriteString("$'")
	for i := 0; i < len(word); i++ {
		switch c := word[i]; {
		case c == '\\' || c == '\'':
			b.WriteByte('\\')
			b.WriteByte(c)
		case c == '\n':
			b.WriteString(`\n`)
		case c == '\t':
			b.WriteString(`\t`)
		case c < 0x20 || c == 0x7f:
			fmt.Fprintf(&b, `\x%02x`, c)
		default:
			b.WriteByte(c)
		}
	}
	b.WriteByte('\'')
	return b.String()
}

func isASCIIControl(r rune) bool { return r < 0x20 || r == 0x7f }

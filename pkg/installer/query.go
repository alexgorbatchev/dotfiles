package installer

import (
	"bytes"
	"errors"
	"fmt"
	osexec "os/exec"
	"regexp"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/exec"
)

// exitCoder is the part of *os/exec.ExitError an update check reads: the status the
// command exited with.
type exitCoder interface {
	ExitCode() int
}

var _ exitCoder = (*osexec.ExitError)(nil)

// queryResult is what a read-only package-manager query printed on each stream and how
// it ended. Package managers answer "nothing to report" with a non-zero exit status
// (`pacman -Qu`, `dnf check-update`), so an update check has to read the status and both
// streams rather than treat every error from Output as a failure, or every failure as
// "up to date".
type queryResult struct {
	// command is the command line, quoted so it can be pasted into a shell, for error
	// messages.
	command string
	stdout  string
	stderr  string
	// err is what Output returned: nil for exit status 0, an exitCoder for any other
	// status, anything else when the command never ran to an exit.
	err error
}

// runQuery runs cmd, which was built from name and args, and keeps its standard output
// and standard error apart.
func runQuery(cmd exec.Cmd, name string, args ...string) queryResult {
	var stderr bytes.Buffer
	cmd.SetStderr(&stderr)
	out, err := cmd.Output()
	return queryResult{
		command: shellCommandLine(name, args...),
		stdout:  string(out),
		stderr:  stderr.String(),
		err:     err,
	}
}

// exitCode reports the status the command exited with. exited is false when it could
// not be started, including when its context was done beforehand. A process killed by
// a signal, as when its context is cancelled while it runs, reports exit status -1.
func (r queryResult) exitCode() (code int, exited bool) {
	if r.err == nil {
		return 0, true
	}
	var ec exitCoder
	if errors.As(r.err, &ec) {
		return ec.ExitCode(), true
	}
	return 0, false
}

// fail describes the query as failed because of cause, naming the command and what it
// printed: stderr, or stdout when stderr is empty (rpm reports a missing package there).
func (r queryResult) fail(cause error) error {
	printed := strings.TrimSpace(r.stderr)
	if printed == "" {
		printed = strings.TrimSpace(r.stdout)
	}
	if printed == "" {
		return r.refuse(cause)
	}
	return fmt.Errorf("running %s: %w: %s", r.command, cause, printed)
}

// refuse describes the query as failed because of cause, naming the command but not
// what it printed. It is for a query that ran and answered, when cause already quotes
// the part of the answer that decided and the rest of the output would bury it.
func (r queryResult) refuse(cause error) error {
	return fmt.Errorf("running %s: %w", r.command, cause)
}

// shellCommandLine renders name and args as a command line that can be pasted into a
// POSIX shell: an argument with whitespace, a glob or another shell metacharacter is
// single-quoted, and one with a control character, such as the newline that ends
// rpmVersionFormat, uses $'...' quoting so the message stays on one line.
func shellCommandLine(name string, args ...string) string {
	words := make([]string, 0, len(args)+1)
	for _, w := range append([]string{name}, args...) {
		words = append(words, shellQuote(w))
	}
	return strings.Join(words, " ")
}

// shellSafe matches a word no POSIX shell reinterprets.
var shellSafe = regexp.MustCompile(`^[A-Za-z0-9_@%+=:,./-]+$`)

// shellQuote returns word as one POSIX shell word. A word holding an ASCII control
// byte is written byte by byte in $'...' form, so any byte sequence, valid UTF-8 or
// not, reads back unchanged; every other word is single-quoted.
func shellQuote(word string) string {
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

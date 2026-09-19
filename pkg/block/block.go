// Package block edits the region of a configuration file that dotfiles owns,
// leaving the rest of the file exactly as it found it.
//
// Files such as ~/.ssh/config, ~/.bashrc and /etc/hosts are shared: the user writes
// in them, and so do other tools. Owning the whole file would mean overwriting that
// work, and appending to it would mean growing a duplicate every run. Instead
// dotfiles delimits one region with a pair of comment markers and confines itself to
// what lies between them, which makes an edit outside the region impossible to
// conflict with by construction.
package block

import (
	"fmt"
	"regexp"
	"strings"
)

// Style is the comment syntax a file's markers are written in. A marker written in
// the wrong syntax is not a comment, so the tool the file configures would fail to
// parse its own configuration.
type Style string

const (
	StyleHash      Style = "#"
	StyleSlash     Style = "//"
	StyleSemicolon Style = ";"
	StyleDash      Style = "--"
	// StyleDoubleQuote is vimscript, where "#" is not a comment at all. Writing the
	// default syntax into a .vimrc would leave the user with a file vim refuses.
	StyleDoubleQuote Style = "\""
)

// Position says where a block that is not yet in the file is inserted. It has no
// effect once the block exists, because a block that has been placed stays where the
// user left it.
type Position string

const (
	// Bottom is the default: appending keeps the top of a file, which is usually
	// where its most important declarations live, as the author arranged it.
	Bottom Position = "bottom"
	Top    Position = "top"
)

// Options describes the block to write.
type Options struct {
	ID       string
	Body     string
	Style    Style
	Position Position
}

// Region is where a block sits within a file. Start and End are byte offsets of the
// whole block, markers included, so that content[:Start] and content[End:] are
// everything the block does not own.
type Region struct {
	Body  string
	Start int
	End   int
}

// noticeText is appended to the start marker so that somebody opening the file and
// finding an unfamiliar region learns what put it there.
const noticeText = "(managed by dotfiles - do not edit inside block)"

// validID is what may appear in a marker. An id carrying whitespace or a newline
// could not be recognised again on the next run, and one carrying regular expression
// metacharacters would change what the search matches.
var validID = regexp.MustCompile(`^[A-Za-z0-9._-]+$`)

// markerPattern matches an opening or closing marker for one id.
//
// The comment prefix is deliberately not part of the match. A file's syntax is
// detected from its name, and that detection can change between releases; a block
// found only when the prefix still agrees would be duplicated rather than rewritten,
// leaving the user with two copies of it.
func markerPattern(arrow, id string) *regexp.Regexp {
	return regexp.MustCompile(`(?m)^.*` + regexp.QuoteMeta(arrow) + `[ \t]+dotfiles:` + regexp.QuoteMeta(id) + `(?:[ \t].*)?$`)
}

// Find locates the managed block with the given id.
//
// A file it cannot read unambiguously is an error rather than a guess, because every
// guess available here ends in writing over text the block does not own.
func Find(content, id string) (Region, bool, error) {
	if !validID.MatchString(id) {
		return Region{}, false, fmt.Errorf("block id %q may only contain letters, digits, dots, dashes and underscores", id)
	}

	opens := markerPattern(">>>", id).FindAllStringIndex(content, -1)
	closes := markerPattern("<<<", id).FindAllStringIndex(content, -1)

	switch {
	case len(opens) == 0 && len(closes) == 0:
		return Region{}, false, nil
	case len(opens) > 1:
		return Region{}, false, fmt.Errorf("block %q is opened more than once", id)
	case len(opens) == 0:
		return Region{}, false, fmt.Errorf("block %q has a closing marker with nothing opening it", id)
	case len(closes) == 0:
		return Region{}, false, fmt.Errorf("block %q is never closed", id)
	case len(closes) > 1:
		return Region{}, false, fmt.Errorf("block %q is closed more than once", id)
	case closes[0][0] < opens[0][0]:
		return Region{}, false, fmt.Errorf("block %q is closed before it is opened", id)
	}

	start := opens[0][0]
	// The end marker's line ends either at its newline or at the end of the file;
	// taking the newline with it is what lets a removal leave no empty line behind.
	end := closes[0][1]
	if end < len(content) && content[end] == '\n' {
		end++
	}

	// The body is everything between the two marker lines. The opening marker's own
	// newline is skipped, and the closing marker's line is not part of it.
	bodyStart := opens[0][1]
	if bodyStart < len(content) && content[bodyStart] == '\n' {
		bodyStart++
	}
	body := content[bodyStart:closes[0][0]]
	body = strings.TrimSuffix(body, "\n")

	return Region{Body: body, Start: start, End: end}, true, nil
}

// Apply returns content with the block's body set to what the options ask for,
// inserting the block if it is not there yet and leaving every other byte of the
// file alone.
//
// Applying a body the file already carries returns the content unchanged, which is
// what makes running generate twice a no-op rather than a recorded change.
func Apply(content string, opts Options) (string, error) {
	region, found, err := Find(content, opts.ID)
	if err != nil {
		return "", err
	}

	rendered := render(opts)

	if found {
		// Whether the existing block ended in a newline decides whether the new one
		// does, so replacing it neither joins it to the next line nor invents a
		// blank one.
		if region.End > 0 && content[region.End-1] == '\n' {
			rendered += "\n"
		}
		return content[:region.Start] + rendered + content[region.End:], nil
	}

	if content == "" {
		return rendered + "\n", nil
	}
	if opts.Position == Top {
		return rendered + "\n" + content, nil
	}
	if !strings.HasSuffix(content, "\n") {
		content += "\n"
	}
	return content + rendered + "\n", nil
}

// Remove returns content without the block, and returns it untouched when the block
// is not there. It is what runs once a tool or a declaration disappears: the region
// dotfiles owned goes away and the rest of the file survives.
func Remove(content, id string) (string, error) {
	region, found, err := Find(content, id)
	if err != nil {
		return "", err
	}
	if !found {
		return content, nil
	}
	return content[:region.Start] + content[region.End:], nil
}

// render builds the marker-delimited text for a block, without a trailing newline.
func render(opts Options) string {
	style := opts.Style
	if style == "" {
		style = StyleHash
	}
	prefix := string(style)

	var out strings.Builder
	out.WriteString(prefix + " >>> dotfiles:" + opts.ID + " " + noticeText + "\n")
	if opts.Body != "" {
		out.WriteString(strings.TrimSuffix(opts.Body, "\n") + "\n")
	}
	out.WriteString(prefix + " <<< dotfiles:" + opts.ID)
	return out.String()
}

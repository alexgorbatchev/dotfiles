package block

import (
	"strings"
	"testing"
)

// sshConfig is the shape the whole feature exists for: a file dotfiles owns one
// region of, surrounded by hosts the user and other tools wrote.
const sshConfig = `Host personal-pi
  HostName 192.168.1.50
  User pi

# >>> dotfiles:ssh-includes (managed by dotfiles - do not edit inside block)
Include /repo/tools/ssh/config
# <<< dotfiles:ssh-includes

Host corporate-bastion
  HostName bastion.corp.example.com
`

func TestFindLocatesABlock(t *testing.T) {
	region, found, err := Find(sshConfig, "ssh-includes")
	if err != nil {
		t.Fatalf("finding block: %v", err)
	}
	if !found {
		t.Fatal("expected to find the ssh-includes block")
	}
	if region.Body != "Include /repo/tools/ssh/config" {
		t.Errorf("body = %q, want the include line alone", region.Body)
	}
	if got := sshConfig[region.Start:region.End]; !strings.HasPrefix(got, "# >>>") {
		t.Errorf("region starts at %q, want the start marker line", got[:min(len(got), 20)])
	}
}

func TestFindIgnoresOtherBlocks(t *testing.T) {
	_, found, err := Find(sshConfig, "something-else")
	if err != nil {
		t.Fatalf("finding an absent block: %v", err)
	}
	if found {
		t.Error("found a block that is not in the file")
	}
}

// TestFindDoesNotMatchAnIdPrefix guards the obvious way a naive matcher breaks:
// "ssh" must not select the block called "ssh-includes", because writing one tool's
// content into another tool's block is silent corruption.
func TestFindDoesNotMatchAnIdPrefix(t *testing.T) {
	_, found, err := Find(sshConfig, "ssh")
	if err != nil {
		t.Fatalf("finding block: %v", err)
	}
	if found {
		t.Error("the id \"ssh\" matched the block \"ssh-includes\"")
	}
}

// TestFindRejectsMalformedFiles covers the states where guessing would mean
// destroying content the block engine does not own.
func TestFindRejectsMalformedFiles(t *testing.T) {
	tests := []struct {
		name    string
		content string
		want    string
	}{
		{
			name:    "start marker with no end",
			content: "before\n# >>> dotfiles:x\nbody\n",
			want:    "never closed",
		},
		{
			name:    "end marker with no start",
			content: "before\n# <<< dotfiles:x\nafter\n",
			want:    "closing marker",
		},
		{
			name:    "the same block opened twice",
			content: "# >>> dotfiles:x\na\n# <<< dotfiles:x\n# >>> dotfiles:x\nb\n# <<< dotfiles:x\n",
			want:    "more than once",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, _, err := Find(tt.content, "x")
			if err == nil {
				t.Fatal("expected an error rather than a guess")
			}
			if !strings.Contains(err.Error(), tt.want) {
				t.Errorf("error = %q, want it to mention %q", err, tt.want)
			}
		})
	}
}

func TestApplyReplacesOnlyTheBlock(t *testing.T) {
	got, err := Apply(sshConfig, Options{
		ID:    "ssh-includes",
		Body:  "Include /repo/tools/ssh/config\nInclude /repo/tools/ssh/config.macos",
		Style: StyleHash,
	})
	if err != nil {
		t.Fatalf("applying block: %v", err)
	}

	for _, keep := range []string{"Host personal-pi", "HostName 192.168.1.50", "Host corporate-bastion", "bastion.corp.example.com"} {
		if !strings.Contains(got, keep) {
			t.Errorf("applying the block dropped %q", keep)
		}
	}
	if !strings.Contains(got, "Include /repo/tools/ssh/config.macos") {
		t.Error("the new body is missing from the result")
	}
	if strings.Count(got, ">>> dotfiles:ssh-includes") != 1 {
		t.Errorf("expected exactly one start marker, got %d", strings.Count(got, ">>> dotfiles:ssh-includes"))
	}
}

// TestApplyIsIdempotent is the property the whole design rests on: running
// generate twice must leave the file byte-identical, or every run would look like a
// change and drift detection would be meaningless.
func TestApplyIsIdempotent(t *testing.T) {
	opts := Options{ID: "ssh-includes", Body: "Include /repo/tools/ssh/config", Style: StyleHash}

	once, err := Apply(sshConfig, opts)
	if err != nil {
		t.Fatalf("first apply: %v", err)
	}
	twice, err := Apply(once, opts)
	if err != nil {
		t.Fatalf("second apply: %v", err)
	}
	if once != twice {
		t.Errorf("second apply changed the file:\n--- once ---\n%s\n--- twice ---\n%s", once, twice)
	}
	if once != sshConfig {
		t.Errorf("applying the body already in the file changed it:\n%s", once)
	}
}

func TestApplyInsertsAMissingBlock(t *testing.T) {
	tests := []struct {
		name     string
		content  string
		position Position
		want     string
	}{
		{
			name:     "at the bottom of an existing file",
			content:  "Host existing\n",
			position: Bottom,
			want:     "Host existing\n# >>> dotfiles:new (managed by dotfiles - do not edit inside block)\nbody\n# <<< dotfiles:new\n",
		},
		{
			name:     "at the top of an existing file",
			content:  "Host existing\n",
			position: Top,
			want:     "# >>> dotfiles:new (managed by dotfiles - do not edit inside block)\nbody\n# <<< dotfiles:new\nHost existing\n",
		},
		{
			name:     "into an empty file",
			content:  "",
			position: Bottom,
			want:     "# >>> dotfiles:new (managed by dotfiles - do not edit inside block)\nbody\n# <<< dotfiles:new\n",
		},
		{
			name:     "into a file with no trailing newline",
			content:  "Host existing",
			position: Bottom,
			want:     "Host existing\n# >>> dotfiles:new (managed by dotfiles - do not edit inside block)\nbody\n# <<< dotfiles:new\n",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Apply(tt.content, Options{ID: "new", Body: "body", Style: StyleHash, Position: tt.position})
			if err != nil {
				t.Fatalf("applying block: %v", err)
			}
			if got != tt.want {
				t.Errorf("got:\n%q\nwant:\n%q", got, tt.want)
			}
		})
	}
}

// TestApplyLeavesOtherBlocksAlone covers a file two tools both own a region of.
func TestApplyLeavesOtherBlocksAlone(t *testing.T) {
	content := "# >>> dotfiles:a\nalpha\n# <<< dotfiles:a\nmiddle\n# >>> dotfiles:b\nbeta\n# <<< dotfiles:b\n"

	got, err := Apply(content, Options{ID: "a", Body: "ALPHA", Style: StyleHash})
	if err != nil {
		t.Fatalf("applying block: %v", err)
	}
	if !strings.Contains(got, "beta") {
		t.Error("rewriting block a disturbed block b")
	}
	if !strings.Contains(got, "middle") {
		t.Error("rewriting block a dropped the text between the blocks")
	}
	if strings.Contains(got, "alpha") {
		t.Error("the old body of block a is still there")
	}
}

func TestApplyRejectsAnUnusableID(t *testing.T) {
	for _, id := range []string{"", "has space", "has\nnewline", "slash/es"} {
		if _, err := Apply("", Options{ID: id, Body: "x", Style: StyleHash}); err == nil {
			t.Errorf("id %q was accepted, but it cannot be written into a marker safely", id)
		}
	}
}

func TestRemoveExcisesOnlyTheBlock(t *testing.T) {
	got, err := Remove(sshConfig, "ssh-includes")
	if err != nil {
		t.Fatalf("removing block: %v", err)
	}
	want := `Host personal-pi
  HostName 192.168.1.50
  User pi


Host corporate-bastion
  HostName bastion.corp.example.com
`
	if got != want {
		t.Errorf("got:\n%q\nwant:\n%q", got, want)
	}
}

func TestRemoveIsANoOpWhenTheBlockIsAbsent(t *testing.T) {
	got, err := Remove(sshConfig, "not-there")
	if err != nil {
		t.Fatalf("removing an absent block: %v", err)
	}
	if got != sshConfig {
		t.Error("removing a block that is not in the file changed it")
	}
}

// TestStyleForPicksTheCommentSyntax covers the archetypes the feature targets. A
// marker written in the wrong syntax is not a comment, so the tool it configures
// would fail to parse its own configuration file.
func TestStyleForPicksTheCommentSyntax(t *testing.T) {
	tests := []struct {
		path string
		want Style
	}{
		{"/home/user/.ssh/config", StyleHash},
		{"/home/user/.bashrc", StyleHash},
		{"/home/user/.zshrc", StyleHash},
		{"/etc/hosts", StyleHash},
		{"/home/user/.tmux.conf", StyleHash},
		{"/home/user/.config/alacritty/alacritty.toml", StyleHash},
		{"/home/user/.config/app/config.yaml", StyleHash},
		{"/home/user/.config/app/config.yml", StyleHash},
		{"/home/user/.gitconfig", StyleSemicolon},
		{"/home/user/.config/app/settings.ini", StyleSemicolon},
		{"/home/user/.config/Code/settings.jsonc", StyleSlash},
		{"/home/user/.config/app/plugin.js", StyleSlash},
		{"/home/user/.config/app/plugin.ts", StyleSlash},
		{"/home/user/.config/nvim/init.lua", StyleDash},
		{"/home/user/.config/app/schema.sql", StyleDash},
		{"/home/user/.vimrc", StyleDoubleQuote},
		{"/home/user/.config/nvim/plugin/keys.vim", StyleDoubleQuote},
		{"/home/user/.config/app/unknown.weird", StyleHash},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			if got := StyleFor(tt.path); got != tt.want {
				t.Errorf("StyleFor(%q) = %q, want %q", tt.path, got, tt.want)
			}
		})
	}
}

// TestApplyWritesMarkersInTheFileSyntax checks that the detected style actually
// reaches the markers, for a file where "#" would not be a comment at all.
func TestApplyWritesMarkersInTheFileSyntax(t *testing.T) {
	got, err := Apply("[user]\n\tname = Alex\n", Options{
		ID:    "signing",
		Body:  "[commit]\n\tgpgsign = true",
		Style: StyleFor("/home/user/.gitconfig"),
	})
	if err != nil {
		t.Fatalf("applying block: %v", err)
	}
	if !strings.Contains(got, "; >>> dotfiles:signing") {
		t.Errorf("markers are not written as INI comments:\n%s", got)
	}
}

// TestFindMatchesAcrossCommentStyles covers a file whose detected style changed
// between runs. The block still belongs to the tool, so it has to be found and
// rewritten rather than duplicated alongside the old one.
func TestFindMatchesAcrossCommentStyles(t *testing.T) {
	content := "// >>> dotfiles:x\nbody\n// <<< dotfiles:x\n"

	got, err := Apply(content, Options{ID: "x", Body: "new", Style: StyleHash})
	if err != nil {
		t.Fatalf("applying block: %v", err)
	}
	if strings.Count(got, ">>> dotfiles:x") != 1 {
		t.Errorf("block was duplicated instead of rewritten:\n%s", got)
	}
}

// TestApplyHandlesAnEmptyBody covers a tool whose block resolves to nothing on this
// platform. The markers stay so the region keeps its identity, but nothing is
// written between them.
func TestApplyHandlesAnEmptyBody(t *testing.T) {
	got, err := Apply("", Options{ID: "x", Body: "", Style: StyleHash})
	if err != nil {
		t.Fatalf("applying block: %v", err)
	}
	want := "# >>> dotfiles:x (managed by dotfiles - do not edit inside block)\n# <<< dotfiles:x\n"
	if got != want {
		t.Errorf("got:\n%q\nwant:\n%q", got, want)
	}
}

func TestCRLFHandling(t *testing.T) {
	crlfContent := "Host personal-pi\r\n  HostName 192.168.1.50\r\n\r\n# >>> dotfiles:ssh-includes (managed by dotfiles - do not edit inside block)\r\nInclude /repo/tools/ssh/config\r\n# <<< dotfiles:ssh-includes\r\n\r\nHost corporate-bastion\r\n  HostName bastion.corp.example.com\r\n"

	t.Run("Find extracts body without carriage returns", func(t *testing.T) {
		region, found, err := Find(crlfContent, "ssh-includes")
		if err != nil {
			t.Fatalf("finding block: %v", err)
		}
		if !found {
			t.Fatal("expected to find block")
		}
		if strings.Contains(region.Body, "\r") {
			t.Errorf("body contains trailing carriage return: %q", region.Body)
		}
		if region.Body != "Include /repo/tools/ssh/config" {
			t.Errorf("got body %q, want %q", region.Body, "Include /repo/tools/ssh/config")
		}
		extracted := crlfContent[region.Start:region.End]
		if !strings.HasPrefix(extracted, "# >>>") || !strings.HasSuffix(extracted, "\r\n") {
			t.Errorf("extracted region is not bounded properly: %q", extracted)
		}
	})

	t.Run("Find without notice on CRLF", func(t *testing.T) {
		raw := "# >>> dotfiles:test\r\nmy body\r\n# <<< dotfiles:test\r\n"
		region, found, err := Find(raw, "test")
		if err != nil {
			t.Fatalf("finding block without notice: %v", err)
		}
		if !found {
			t.Fatal("expected to find block")
		}
		if region.Body != "my body" {
			t.Errorf("got body %q, want %q", region.Body, "my body")
		}
	})

	t.Run("Apply is idempotent with CRLF", func(t *testing.T) {
		opts := Options{
			ID:    "ssh-includes",
			Body:  "Include /repo/tools/ssh/config",
			Style: StyleHash,
		}
		once, err := Apply(crlfContent, opts)
		if err != nil {
			t.Fatalf("first apply: %v", err)
		}
		if once != crlfContent {
			t.Errorf("applying existing CRLF block changed content:\n--- got ---\n%q\n--- want ---\n%q", once, crlfContent)
		}
		twice, err := Apply(once, opts)
		if err != nil {
			t.Fatalf("second apply: %v", err)
		}
		if twice != once {
			t.Errorf("second apply changed content:\n--- once ---\n%q\n--- twice ---\n%q", once, twice)
		}
	})

	t.Run("Apply updates block in CRLF content with new body", func(t *testing.T) {
		opts := Options{
			ID:    "ssh-includes",
			Body:  "Include /repo/tools/ssh/config\nInclude /repo/tools/ssh/config.extra",
			Style: StyleHash,
		}
		got, err := Apply(crlfContent, opts)
		if err != nil {
			t.Fatalf("applying updated block: %v", err)
		}
		want := "Host personal-pi\r\n  HostName 192.168.1.50\r\n\r\n# >>> dotfiles:ssh-includes (managed by dotfiles - do not edit inside block)\r\nInclude /repo/tools/ssh/config\r\nInclude /repo/tools/ssh/config.extra\r\n# <<< dotfiles:ssh-includes\r\n\r\nHost corporate-bastion\r\n  HostName bastion.corp.example.com\r\n"
		if got != want {
			t.Errorf("got:\n%q\nwant:\n%q", got, want)
		}
	})

	t.Run("Apply inserts block into CRLF content at bottom", func(t *testing.T) {
		initial := "Host existing\r\n"
		opts := Options{
			ID:       "new",
			Body:     "line 1\nline 2",
			Style:    StyleHash,
			Position: Bottom,
		}
		got, err := Apply(initial, opts)
		if err != nil {
			t.Fatalf("applying new block: %v", err)
		}
		want := "Host existing\r\n# >>> dotfiles:new (managed by dotfiles - do not edit inside block)\r\nline 1\r\nline 2\r\n# <<< dotfiles:new\r\n"
		if got != want {
			t.Errorf("got:\n%q\nwant:\n%q", got, want)
		}
	})

	t.Run("Apply inserts block into CRLF content at top", func(t *testing.T) {
		initial := "Host existing\r\n"
		opts := Options{
			ID:       "new",
			Body:     "line 1\r\nline 2",
			Style:    StyleHash,
			Position: Top,
		}
		got, err := Apply(initial, opts)
		if err != nil {
			t.Fatalf("applying top block: %v", err)
		}
		want := "# >>> dotfiles:new (managed by dotfiles - do not edit inside block)\r\nline 1\r\nline 2\r\n# <<< dotfiles:new\r\nHost existing\r\n"
		if got != want {
			t.Errorf("got:\n%q\nwant:\n%q", got, want)
		}
	})

	t.Run("Remove cleanly removes block from CRLF content", func(t *testing.T) {
		got, err := Remove(crlfContent, "ssh-includes")
		if err != nil {
			t.Fatalf("removing block: %v", err)
		}
		want := "Host personal-pi\r\n  HostName 192.168.1.50\r\n\r\n\r\nHost corporate-bastion\r\n  HostName bastion.corp.example.com\r\n"
		if got != want {
			t.Errorf("got:\n%q\nwant:\n%q", got, want)
		}
	})
}

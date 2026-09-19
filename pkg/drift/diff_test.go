package drift

import (
	"strings"
	"testing"
)

func TestUnifiedDiff(t *testing.T) {
	oldText := "line 1\nline 2\nline 3\n"
	newText := "line 1\nline 2 modified\nline 3\nline 4\n"

	diff := UnifiedDiff("old.txt", "new.txt", oldText, newText)
	if !strings.Contains(diff, "--- old.txt") || !strings.Contains(diff, "+++ new.txt") {
		t.Fatalf("diff missing header:\n%s", diff)
	}
	if !strings.Contains(diff, "-line 2") || !strings.Contains(diff, "+line 2 modified") {
		t.Errorf("diff missing modified line:\n%s", diff)
	}
	if !strings.Contains(diff, "+line 4") {
		t.Errorf("diff missing added line:\n%s", diff)
	}
}

func TestUnifiedDiffIdentical(t *testing.T) {
	text := "same content\n"
	diff := UnifiedDiff("a.txt", "b.txt", text, text)
	if diff != "" {
		t.Errorf("expected empty diff for identical text, got:\n%s", diff)
	}
}

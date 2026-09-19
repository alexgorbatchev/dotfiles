package drift

import (
	"strings"
	"testing"
)

// TestEvaluate pins the state machine. Every branch of it decides whether a user's
// edit survives the next generate, so each one is named after the situation it
// describes rather than after the hashes that produce it.
func TestEvaluate(t *testing.T) {
	tests := []struct {
		name     string
		versions Versions
		want     State
	}{
		{
			name:     "nothing recorded and nothing on disk is a first run",
			versions: Versions{Base: "", Current: "", Desired: "repo"},
			want:     StateNew,
		},
		{
			name:     "a file already on disk that dotfiles never wrote is unmanaged",
			versions: Versions{Base: "", Current: "users-own", Desired: "repo"},
			want:     StateUnmanaged,
		},
		{
			name:     "a file already holding what would be written is in sync",
			versions: Versions{Base: "", Current: "repo", Desired: "repo"},
			want:     StateInSync,
		},
		{
			name:     "an untouched file matching its record is in sync",
			versions: Versions{Base: "v1", Current: "v1", Desired: "v1"},
			want:     StateInSync,
		},
		{
			name:     "an untouched file whose source moved on is a clean update",
			versions: Versions{Base: "v1", Current: "v1", Desired: "v2"},
			want:     StateUpstreamUpdate,
		},
		{
			name:     "an edited file whose source stood still is local drift",
			versions: Versions{Base: "v1", Current: "edited", Desired: "v1"},
			want:     StateLocalDrift,
		},
		{
			name:     "both sides moved, differently, is a conflict",
			versions: Versions{Base: "v1", Current: "edited", Desired: "v2"},
			want:     StateConflict,
		},
		{
			name:     "both sides moved to the same place is in sync",
			versions: Versions{Base: "v1", Current: "v2", Desired: "v2"},
			want:     StateInSync,
		},
		{
			name:     "a recorded file the user deleted is missing",
			versions: Versions{Base: "v1", Current: "", Desired: "v2"},
			want:     StateMissing,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Evaluate(tt.versions); got != tt.want {
				t.Errorf("Evaluate(%+v) = %q, want %q", tt.versions, got, tt.want)
			}
		})
	}
}

// TestDecide pins how a state and the declared policy combine into one action. The
// table is the whole contract: a wrong cell here silently discards somebody's work.
func TestDecide(t *testing.T) {
	tests := []struct {
		state  State
		policy Policy
		want   Action
	}{
		// Nothing the policy says changes these: there is no competing edit.
		{StateNew, PolicyMerge, ActionWrite},
		{StateNew, PolicyKeepLocal, ActionWrite},
		{StateInSync, PolicyMerge, ActionNothing},
		{StateInSync, PolicyOverwrite, ActionNothing},
		{StateUpstreamUpdate, PolicyMerge, ActionWrite},
		{StateUpstreamUpdate, PolicyKeepLocal, ActionWrite},
		{StateMissing, PolicyKeepLocal, ActionWrite},

		// Local drift: the source stood still, so a merge has nothing to add and
		// keeping the edit is the only answer that does not throw it away.
		{StateLocalDrift, PolicyMerge, ActionKeep},
		{StateLocalDrift, PolicyKeepLocal, ActionKeep},
		{StateLocalDrift, PolicyOverwrite, ActionOverwrite},
		{StateLocalDrift, PolicyPrompt, ActionPrompt},

		// A true conflict is the only state where the policy really decides.
		{StateConflict, PolicyMerge, ActionMerge},
		{StateConflict, PolicyKeepLocal, ActionKeep},
		{StateConflict, PolicyOverwrite, ActionOverwrite},
		{StateConflict, PolicyPrompt, ActionPrompt},

		// An unmanaged file has no base to merge against, so the content is kept
		// aside rather than fed to an algorithm that cannot use it.
		{StateUnmanaged, PolicyMerge, ActionOverwrite},
		{StateUnmanaged, PolicyKeepLocal, ActionKeep},
		{StateUnmanaged, PolicyOverwrite, ActionOverwrite},
		{StateUnmanaged, PolicyPrompt, ActionPrompt},
	}

	for _, tt := range tests {
		t.Run(string(tt.state)+"/"+string(tt.policy), func(t *testing.T) {
			if got := Decide(tt.state, tt.policy); got != tt.want {
				t.Errorf("Decide(%q, %q) = %q, want %q", tt.state, tt.policy, got, tt.want)
			}
		})
	}
}

// TestDecideDefaultsToMerging checks that a declaration that states no policy
// behaves like the documented default rather than like the zero value of a string.
func TestDecideDefaultsToMerging(t *testing.T) {
	if got := Decide(StateConflict, ""); got != ActionMerge {
		t.Errorf("Decide with no policy = %q, want %q", got, ActionMerge)
	}
}

func TestMergeCombinesBothSides(t *testing.T) {
	base := "alpha\nbeta\ngamma\n"
	local := "alpha\nbeta\ngamma\ndelta\n" // the user appended a line
	desired := "ALPHA\nbeta\ngamma\n"      // the repository changed the first

	got, err := Merge(base, local, desired)
	if err != nil {
		t.Fatalf("merging: %v", err)
	}
	if got.Conflicts != 0 {
		t.Fatalf("expected a clean merge, got %d conflicts:\n%s", got.Conflicts, got.Merged)
	}
	want := "ALPHA\nbeta\ngamma\ndelta\n"
	if got.Merged != want {
		t.Errorf("merged = %q, want %q", got.Merged, want)
	}
}

// TestMergeMarksARealConflict checks both that the conflict is reported and that
// the markers are the seven-character ones every editor and mergetool recognises.
func TestMergeMarksARealConflict(t *testing.T) {
	base := "value = 1\n"
	local := "value = 2\n"
	desired := "value = 3\n"

	got, err := Merge(base, local, desired)
	if err != nil {
		t.Fatalf("merging: %v", err)
	}
	if got.Conflicts != 1 {
		t.Errorf("conflicts = %d, want 1", got.Conflicts)
	}
	for _, marker := range []string{"<<<<<<< " + LabelLocal, "=======", ">>>>>>> " + LabelDotfiles} {
		if !strings.Contains(got.Merged, marker) {
			t.Errorf("merged output is missing the marker %q:\n%s", marker, got.Merged)
		}
	}
	if strings.Contains(got.Merged, "<<<<<<<<<") {
		t.Error("merged output uses nine-character markers, which no mergetool recognises")
	}
	if !strings.Contains(got.Merged, "value = 2") || !strings.Contains(got.Merged, "value = 3") {
		t.Errorf("both sides of the conflict should be present:\n%s", got.Merged)
	}
}

// TestMergePreservesTrailingNewlines guards a detail that quietly breaks shell and
// ssh configuration files, which require their last line to be terminated.
func TestMergePreservesTrailingNewlines(t *testing.T) {
	tests := []struct {
		name                string
		base, local, wanted string
		want                string
	}{
		{
			name: "all three end with a newline",
			base: "a\n", local: "a\n", wanted: "b\n",
			want: "b\n",
		},
		{
			name: "none of them end with a newline",
			base: "a", local: "a", wanted: "b",
			want: "b",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Merge(tt.base, tt.local, tt.wanted)
			if err != nil {
				t.Fatalf("merging: %v", err)
			}
			if got.Merged != tt.want {
				t.Errorf("merged = %q, want %q", got.Merged, tt.want)
			}
		})
	}
}

// TestMergeRefusesBinaryContent states the limit plainly. A line merge of a binary
// file would produce something that is neither of its inputs, so it is reported
// rather than attempted.
func TestMergeRefusesBinaryContent(t *testing.T) {
	binary := "\x00\x01\x02\xff\xfe"

	if _, err := Merge(binary, binary+"x", binary+"y"); err == nil {
		t.Error("expected merging binary content to be refused")
	}
}

// TestMergeIsSymmetricAboutWhichSideChanged checks that a change made on only one
// side is taken verbatim, whichever side made it.
func TestMergeIsSymmetricAboutWhichSideChanged(t *testing.T) {
	base := "one\ntwo\n"

	onlyLocal, err := Merge(base, "one\ntwo\nthree\n", base)
	if err != nil {
		t.Fatalf("merging a local-only change: %v", err)
	}
	if onlyLocal.Merged != "one\ntwo\nthree\n" {
		t.Errorf("a local-only change was not preserved: %q", onlyLocal.Merged)
	}

	onlyDesired, err := Merge(base, base, "one\ntwo\nthree\n")
	if err != nil {
		t.Fatalf("merging a repository-only change: %v", err)
	}
	if onlyDesired.Merged != "one\ntwo\nthree\n" {
		t.Errorf("a repository-only change was not applied: %q", onlyDesired.Merged)
	}
}

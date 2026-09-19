// Package drift decides what a run should do with a file that has changed since
// dotfiles last wrote it.
//
// Comparing the repository against the disk answers only whether the two differ, not
// which of them moved. Three versions answer that: the base, meaning exactly what
// dotfiles last wrote and recorded; the current file on disk; and what the
// repository would write now. From those, an edit the user made is distinguishable
// from an update to the source, and only the case where both moved needs a decision
// at all.
package drift

import (
	"fmt"
	"strings"

	"github.com/epiclabs-io/diff3"
)

// State is what comparing the three versions found.
type State string

const (
	// StateNew is a file that has never been written and is not on disk.
	StateNew State = "new"
	// StateInSync is a file that already holds what would be written.
	StateInSync State = "in-sync"
	// StateUnmanaged is a file that was already on disk holding content dotfiles
	// never wrote. There is no base to measure against, so nothing can be merged.
	StateUnmanaged State = "unmanaged"
	// StateMissing is a file dotfiles wrote and recorded that is no longer there.
	StateMissing State = "missing"
	// StateUpstreamUpdate is an untouched file whose source has moved on.
	StateUpstreamUpdate State = "upstream-update"
	// StateLocalDrift is an edited file whose source has not moved.
	StateLocalDrift State = "local-drift"
	// StateConflict is a file where both the disk and the source moved, differently.
	StateConflict State = "conflict"
)

// Versions are the three content hashes a state is derived from. An empty hash means
// the version does not exist: no record for Base, no file for Current.
type Versions struct {
	Base    string
	Current string
	Desired string
}

// Evaluate reports which of the three versions moved.
func Evaluate(v Versions) State {
	// Checked first, and before the base is consulted at all: a file that already
	// holds what would be written needs nothing done to it, however it came to.
	if v.Current == v.Desired {
		return StateInSync
	}
	if v.Base == "" {
		if v.Current == "" {
			return StateNew
		}
		return StateUnmanaged
	}
	if v.Current == "" {
		return StateMissing
	}
	if v.Current == v.Base {
		return StateUpstreamUpdate
	}
	if v.Desired == v.Base {
		return StateLocalDrift
	}
	return StateConflict
}

// Policy is what an author asked for when the disk and the source disagree.
type Policy string

const (
	// PolicyMerge is the default for text: combine both sides, and mark the lines
	// where that cannot be done.
	PolicyMerge Policy = "merge"
	// PolicyKeepLocal leaves the file on disk as it is.
	PolicyKeepLocal Policy = "keep-local"
	// PolicyOverwrite replaces the file, keeping what was there as a backup.
	PolicyOverwrite Policy = "overwrite"
	// PolicyPrompt asks.
	PolicyPrompt Policy = "prompt"
)

// Action is the single thing a run does to the file.
type Action string

const (
	ActionNothing   Action = "nothing"
	ActionWrite     Action = "write"
	ActionKeep      Action = "keep"
	ActionMerge     Action = "merge"
	ActionOverwrite Action = "overwrite"
	ActionPrompt    Action = "prompt"
)

// Decide turns a state and the declared policy into the one action to take.
//
// Only a state where both sides moved lets the policy decide anything. The rest have
// exactly one answer that does not discard somebody's work, and a policy cannot ask
// for a different one.
func Decide(state State, policy Policy) Action {
	if policy == "" {
		policy = PolicyMerge
	}

	switch state {
	case StateInSync:
		return ActionNothing
	case StateNew, StateMissing, StateUpstreamUpdate:
		return ActionWrite
	case StateLocalDrift:
		// The source stood still, so a three-way merge would reproduce the file that
		// is already there. Saying "keep" states that outcome instead of computing it.
		switch policy {
		case PolicyOverwrite:
			return ActionOverwrite
		case PolicyPrompt:
			return ActionPrompt
		default:
			return ActionKeep
		}
	case StateUnmanaged:
		// Nothing recorded means there is no common ancestor, and a merge against an
		// empty one turns the whole file into a conflict. Backing the file up and
		// writing is the outcome that loses nothing and needs no algorithm.
		switch policy {
		case PolicyKeepLocal:
			return ActionKeep
		case PolicyPrompt:
			return ActionPrompt
		default:
			return ActionOverwrite
		}
	case StateConflict:
		switch policy {
		case PolicyKeepLocal:
			return ActionKeep
		case PolicyOverwrite:
			return ActionOverwrite
		case PolicyPrompt:
			return ActionPrompt
		default:
			return ActionMerge
		}
	}

	return ActionNothing
}

// Labels name the two sides of a conflict in the markers left in the file.
const (
	LabelLocal    = "local"
	LabelDotfiles = "dotfiles"
)

// MergeResult is a merged file and how many places could not be merged.
type MergeResult struct {
	Merged    string
	Conflicts int
}

// Merge combines the change made on disk with the change made in the repository,
// against the version dotfiles last wrote.
//
// Conflicts are marked with the seven-character markers git writes, rather than with
// the nine-character ones the underlying library emits, because that is what every
// editor, `git diff` and mergetool recognises. A file left with markers no tool
// understands would be a conflict the user has to resolve by hand twice.
func Merge(base, local, desired string) (MergeResult, error) {
	baseLines, err := splitLines(base)
	if err != nil {
		return MergeResult{}, fmt.Errorf("reading the recorded version: %w", err)
	}
	localLines, err := splitLines(local)
	if err != nil {
		return MergeResult{}, fmt.Errorf("reading the file on disk: %w", err)
	}
	desiredLines, err := splitLines(desired)
	if err != nil {
		return MergeResult{}, fmt.Errorf("reading what would be written: %w", err)
	}

	// The argument order is the library's: the local side, then the common ancestor,
	// then the incoming side.
	//
	// False conflicts are excluded, so a change both sides made identically is taken
	// once rather than reported as a disagreement about nothing.
	hunks := diff3.Diff3Merge(localLines, baseLines, desiredLines, true)

	var merged []string
	conflicts := 0
	for _, hunk := range hunks {
		if hunk.Conflict == nil {
			merged = append(merged, hunk.Ok...)
			continue
		}
		conflicts++
		merged = append(merged, "<<<<<<< "+LabelLocal)
		merged = append(merged, hunk.Conflict.A...)
		merged = append(merged, "=======")
		merged = append(merged, hunk.Conflict.B...)
		merged = append(merged, ">>>>>>> "+LabelDotfiles)
	}

	return MergeResult{Merged: strings.Join(merged, "\n"), Conflicts: conflicts}, nil
}

// splitLines turns a file into the lines the merge works on, and refuses content
// that is not text.
//
// Splitting on "\n" rather than scanning lines is what makes the join at the end
// reproduce the input exactly: a trailing newline becomes a trailing empty element
// and comes back as a trailing newline, and a file without one stays without one.
func splitLines(content string) ([]string, error) {
	if strings.IndexByte(content, 0) >= 0 {
		return nil, fmt.Errorf("content is binary, and a line merge would produce neither of its inputs")
	}
	return strings.Split(content, "\n"), nil
}

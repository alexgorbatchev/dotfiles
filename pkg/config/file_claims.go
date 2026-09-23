package config

import (
	"fmt"
	"path/filepath"
)

// claimKind is the declaration a fileClaim comes from, spelled as the DSL call an
// author wrote.
type claimKind string

const (
	claimSymlink  claimKind = "symlink"
	claimCopy     claimKind = "copy"
	claimTemplate claimKind = "template"
	claimBlock    claimKind = "block"
)

// fileClaim is one declaration that writes a file: a symlink, copy or template, which
// owns the whole file, or a block, which owns only the region between its markers.
type fileClaim struct {
	tool   *ToolConfig
	kind   claimKind
	target string // as declared, before resolution
	source string // what a whole-file declaration writes, as declared; empty for a block
	id     string // the block id; empty for a whole-file declaration
}

func (c fileClaim) wholeFile() bool {
	return c.kind != claimBlock
}

// String names the declaration the way the author wrote it.
func (c fileClaim) String() string {
	if c.wholeFile() {
		return fmt.Sprintf(".%s() targeting %q", c.kind, c.target)
	}
	return fmt.Sprintf(".block() %q targeting %q", c.id, c.target)
}

// owner names the tool a claim belongs to and, when it came from one, its file.
func (c fileClaim) owner() string {
	if c.tool.ConfigFilePath == "" {
		return fmt.Sprintf("tool %q", c.tool.Name)
	}
	return fmt.Sprintf("tool %q (%q)", c.tool.Name, c.tool.ConfigFilePath)
}

// fileClaims lists every file a tool writes, in the order the engine writes them.
func (tc *ToolConfig) fileClaims() []fileClaim {
	claims := make([]fileClaim, 0, len(tc.Symlinks)+len(tc.Copies)+len(tc.Templates)+len(tc.Blocks))
	for _, sym := range tc.Symlinks {
		claims = append(claims, fileClaim{tool: tc, kind: claimSymlink, target: sym.Target, source: sym.Source})
	}
	for _, cp := range tc.Copies {
		claims = append(claims, fileClaim{tool: tc, kind: claimCopy, target: cp.Target, source: cp.Source})
	}
	for _, tmpl := range tc.Templates {
		claims = append(claims, fileClaim{tool: tc, kind: claimTemplate, target: tmpl.Target, source: tmpl.Source})
	}
	for _, blk := range tc.Blocks {
		claims = append(claims, fileClaim{tool: tc, kind: claimBlock, target: blk.Target, id: blk.ID})
	}
	return claims
}

// validateFileClaims reports two declarations, of one tool or of two, that would
// write the same file. The engine carries out each declaration in turn with nothing
// to tell it another one wants the same file, so whichever is applied last wins on
// every run and says nothing:
//
//   - two blocks with one id share one marker pair, and the block ends up holding
//     the content of whichever was written last;
//   - two copies move each other aside into a new .bak file on every run;
//   - two templates replace each other's rendering, and the one that loses reports
//     the other's as a local edit, which it keeps once the other tool is removed;
//   - two symlinks point the link at whichever source was linked last;
//   - a block in a file a copy or template writes is taken for a local edit of that
//     file, and a block in a file a symlink writes is written through the link into
//     the source file in the repository.
//
// Blocks with different ids sharing a file are what blocks exist for and pass.
//
// Targets are compared as the engine resolves them (ResolveTargetPath, made absolute
// and clean), so "~/x", "$HOME/x" and "{paths.homeDir}/x" are one file. A tool this
// machine does not carry out (IsActive) claims nothing. A target whose placeholders
// cannot be filled claims nothing either: the step that writes it reports the
// placeholder, and no file can be named for it here.
func validateFileClaims(tools []*ToolConfig, projCfg *ProjectConfig) error {
	wholeFiles := make(map[string]fileClaim)
	firstBlocks := make(map[string]fileClaim)
	blocks := make(map[string]fileClaim)

	for _, tool := range tools {
		if !tool.IsActive() {
			continue
		}
		for _, claim := range tool.fileClaims() {
			resolved, err := ResolveTargetPath(claim.target, tool.Name, projCfg)
			if err != nil {
				continue
			}
			path, err := filepath.Abs(resolved)
			if err != nil {
				return fmt.Errorf("resolving %s of tool %q: %w", claim, tool.Name, err)
			}

			if earlier, taken := wholeFiles[path]; taken {
				return claimConflict(earlier, claim, path)
			}
			if claim.wholeFile() {
				if earlier, taken := firstBlocks[path]; taken {
					return claimConflict(earlier, claim, path)
				}
				wholeFiles[path] = claim
				continue
			}

			blockKey := path + "\x00" + claim.id
			if earlier, taken := blocks[blockKey]; taken {
				return claimConflict(earlier, claim, path)
			}
			blocks[blockKey] = claim
			if _, seen := firstBlocks[path]; !seen {
				firstBlocks[path] = claim
			}
		}
	}
	return nil
}

// claimConflict describes two declarations that would write one file, naming both,
// the tools and files they come from, and the file they share.
func claimConflict(earlier, later fileClaim, path string) error {
	var reason string
	switch {
	// A relative source resolves against its own tool's directory, so only within one
	// tool does an equal source name the same file.
	case earlier.tool == later.tool && earlier.wholeFile() && earlier.kind == later.kind && earlier.source == later.source:
		reason = fmt.Sprintf("the same .%s() of %q is declared twice; declare it once", later.kind, later.source)
	case !earlier.wholeFile() && !later.wholeFile():
		reason = "only one declaration can own a block, and the other's content would be lost"
	case earlier.wholeFile() && later.wholeFile():
		reason = "only one declaration can own a file, and each run would replace the other's"
	default:
		reason = "a block cannot live in a file a .symlink(), .copy() or .template() writes whole"
	}

	if earlier.tool == later.tool {
		return fmt.Errorf("%s writes %q twice, with %s and with %s: %s",
			earlier.owner(), path, earlier, later, reason)
	}
	return fmt.Errorf("%s and %s both write %q, with %s and with %s: %s",
		earlier.owner(), later.owner(), path, earlier, later, reason)
}

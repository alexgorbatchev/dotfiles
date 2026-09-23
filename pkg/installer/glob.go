package installer

import (
	"fmt"
	"path"
	"path/filepath"
	"slices"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// expandBraces expands brace alternation the way minimatch (the v1 matcher) does, so
// "*.{tar.xz,zip}" becomes "*.tar.xz" and "*.zip". Groups may nest and several groups
// multiply out left to right. A group without a comma and an unbalanced brace are kept as
// literal text, again matching minimatch. Numeric ranges such as {1..3} are not supported.
func expandBraces(pattern string) []string {
	open := strings.IndexByte(pattern, '{')
	if open < 0 {
		return []string{pattern}
	}

	depth := 0
	segmentStart := open + 1
	var alternatives []string
	for i := open; i < len(pattern); i++ {
		switch pattern[i] {
		case '{':
			depth++
		case ',':
			if depth == 1 {
				alternatives = append(alternatives, pattern[segmentStart:i])
				segmentStart = i + 1
			}
		case '}':
			depth--
			if depth != 0 {
				continue
			}
			alternatives = append(alternatives, pattern[segmentStart:i])
			prefix, rest := pattern[:open], pattern[i+1:]
			if len(alternatives) == 1 {
				// "{x}" is not an alternation; keep it literally and carry on after it.
				literal := pattern[:i+1]
				var out []string
				for _, tail := range expandBraces(rest) {
					out = append(out, literal+tail)
				}
				return out
			}
			var out []string
			for _, alternative := range alternatives {
				for _, tail := range expandBraces(alternative + rest) {
					out = append(out, prefix+tail)
				}
			}
			return out
		}
	}

	// The brace never closed at depth zero: treat the pattern as literal text.
	return []string{pattern}
}

// globMatch reports whether name matches a minimatch-style glob: path.Match syntax (`*`,
// `?`, `[...]`), `[!...]` negation and `{a,b}` brace alternation. `*` and `?` never match
// a slash, so a pattern spans exactly the directory levels it spells out, as in v1. A
// pattern without metacharacters matches only the identical name. When nothing matched
// and an alternative is malformed, the error is path.ErrBadPattern.
func globMatch(pattern, name string) (bool, error) {
	var badPattern error
	for _, alternative := range expandBraces(strings.ReplaceAll(pattern, "[!", "[^")) {
		matched, err := path.Match(alternative, name)
		if err != nil {
			badPattern = err
			continue
		}
		if matched {
			return true, nil
		}
	}
	return false, badPattern
}

// defaultBinaryPattern is the glob a bare .bin(name) resolves to: the binary at the
// archive root or exactly one directory down, as v1's normalizeBinaries defined it.
func defaultBinaryPattern(name string) string {
	return "{,*/}" + name
}

// findBinaryByPattern locates the file under destDir that .bin(binName, pattern) refers
// to and returns its path, or "" when nothing matches. Every regular file and symlink
// below destDir is matched by its slash-separated path relative to destDir; directories
// never match. When several files match, the choice follows v1: an executable whose file
// name is binName, then any executable. v1 stopped there and reported the binary missing
// when no match was executable; here a file named binName and then the first match in
// path order are still accepted, because archives built on Windows lose the executable
// bit and the promoted binary is made executable anyway (unless it links outside destDir;
// see OutsideLinkPolicy).
func findBinaryByPattern(fsys fs.FS, destDir, pattern, binName string) (string, error) {
	files, err := listFiles(fsys, destDir, "")
	if err != nil {
		return "", err
	}
	slices.Sort(files)

	best, bestRank := "", -1
	for _, rel := range files {
		matched, err := globMatch(pattern, rel)
		if err != nil {
			return "", fmt.Errorf("invalid pattern %q: %w", pattern, err)
		}
		if !matched {
			continue
		}
		full := filepath.Join(destDir, filepath.FromSlash(rel))
		if rank := binaryCandidateRank(fsys, full, path.Base(rel) == binName); rank > bestRank {
			best, bestRank = full, rank
		}
	}
	return best, nil
}

// binaryCandidateRank orders files matching a binary pattern: executable and named after
// the binary (3), executable (2), named after the binary (1), anything else (0). A symlink
// is judged by its target, so a dangling link counts as not executable.
func binaryCandidateRank(fsys fs.FS, fullPath string, exactName bool) int {
	rank := 0
	if exactName {
		rank++
	}
	if info, err := fsys.Stat(fullPath); err == nil && info.Mode()&0111 != 0 {
		rank += 2
	}
	return rank
}

// listFiles returns the slash-separated paths, relative to root, of every non-directory
// entry below root/rel. Symlinks are listed as files and not followed, as v1's walk did.
func listFiles(fsys fs.FS, root, rel string) ([]string, error) {
	dir := filepath.Join(root, filepath.FromSlash(rel))
	entries, err := fsys.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("reading %q: %w", dir, err)
	}
	var files []string
	for _, name := range entries {
		entryRel := path.Join(rel, name)
		info, err := fsys.Lstat(filepath.Join(root, filepath.FromSlash(entryRel)))
		if err != nil {
			// The entry disappeared between the listing and the lookup; it cannot be the binary.
			continue
		}
		if !info.IsDir() {
			files = append(files, entryRel)
			continue
		}
		sub, err := listFiles(fsys, root, entryRel)
		if err != nil {
			return nil, err
		}
		files = append(files, sub...)
	}
	return files, nil
}

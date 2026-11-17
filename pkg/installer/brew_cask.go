package installer

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
)

// Casks install artifacts, not formula kegs. Read their evaluated targets from
// Homebrew instead of inventing <prefix>/opt/<cask>/bin paths.
type brewCaskArtifact struct {
	App    []json.RawMessage `json:"app"`
	Binary []json.RawMessage `json:"binary"`
	Target string            `json:"target"`
}

func (b *BrewInstaller) caskBinaries(ctx context.Context, formula string, tool *config.ToolConfig) ([]string, error) {
	// Applications need no executable unless the tool explicitly declares one.
	if len(tool.Binaries) == 0 {
		return nil, nil
	}
	query := b.brewQuery(ctx, "info", "--json=v2", "--cask", "--", formula)
	if query.err != nil {
		return nil, query.fail(query.err)
	}
	var info struct {
		Casks []struct {
			Artifacts []brewCaskArtifact `json:"artifacts"`
		} `json:"casks"`
	}
	if err := json.Unmarshal([]byte(query.stdout), &info); err != nil {
		return nil, fmt.Errorf("read cask artifacts for %s: %w", formula, err)
	}
	if len(info.Casks) != 1 {
		return nil, fmt.Errorf("brew info returned no unique cask for %s", formula)
	}
	prefixQuery := b.brewQuery(ctx, "--prefix")
	if prefixQuery.err != nil {
		return nil, prefixQuery.fail(prefixQuery.err)
	}
	prefix := strings.TrimSpace(prefixQuery.stdout)
	if !filepath.IsAbs(prefix) {
		return nil, fmt.Errorf("brew --prefix returned invalid prefix %q", prefix)
	}
	expand := strings.NewReplacer("$HOMEBREW_PREFIX", prefix, "$APPDIR", "/Applications")
	var apps []string
	binaries := map[string]string{}
	for _, artifact := range info.Casks[0].Artifacts {
		if len(artifact.App) > 0 {
			target := caskArtifactTarget(artifact.App, artifact.Target, "/Applications")
			if target != "" {
				apps = append(apps, expand.Replace(target))
			}
		}
		if len(artifact.Binary) > 0 {
			target := expand.Replace(caskArtifactTarget(artifact.Binary, artifact.Target, filepath.Join(prefix, "bin")))
			if target != "" && b.caskExecutable(ctx, target) {
				binaries[filepath.Base(target)] = target
			}
		}
	}
	var resolved []string
	for _, name := range tool.BinaryNames() {
		if target := binaries[name]; target != "" {
			resolved = append(resolved, target)
			continue
		}
		var matches []string
		for _, app := range apps {
			found, err := b.findCaskAppBinaries(ctx, app, name)
			if err != nil {
				return nil, fmt.Errorf("resolve cask %s binary %s: %w", formula, name, err)
			}
			matches = append(matches, found...)
		}
		slices.Sort(matches)
		matches = slices.Compact(matches)
		if len(matches) != 1 {
			return nil, fmt.Errorf("cask %s binary %q has %d executable matches in its installed artifacts", formula, name, len(matches))
		}
		resolved = append(resolved, matches[0])
	}
	return resolved, nil
}

// Homebrew reports evaluated targets alongside the stanza; the stanza's target
// option also supplies the name for artifacts without an evaluated target.
func caskArtifactTarget(args []json.RawMessage, target, dir string) string {
	if target == "" && len(args) > 1 {
		var options struct {
			Target string `json:"target"`
		}
		if json.Unmarshal(args[1], &options) == nil {
			target = options.Target
		}
	}
	if target == "" && len(args) > 0 {
		var source string
		if json.Unmarshal(args[0], &source) == nil && source != "" {
			target = filepath.Base(source)
		}
	}
	if target == "" {
		return ""
	}
	if filepath.IsAbs(target) || strings.HasPrefix(target, "$") {
		return target
	}
	return filepath.Join(dir, target)
}

func (b *BrewInstaller) caskExecutable(ctx context.Context, path string) bool {
	info, err := b.fsys.Stat(path)
	return err == nil && info.Mode().IsRegular() && info.Mode().Perm()&0o111 != 0 && IsRealBinaryPath(ctx, b.fsys, path)
}

// Search only Homebrew's app artifact. Do not follow directory symlinks into
// another installation or accept a leaf symlink that escapes the bundle.
func (b *BrewInstaller) findCaskAppBinaries(ctx context.Context, app, name string) ([]string, error) {
	root, err := resolveLinks(b.fsys, app)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var matches []string
	var walk func(string) error
	walk = func(dir string) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		entries, err := b.fsys.ReadDir(dir)
		if err != nil {
			return err
		}
		for _, entry := range entries {
			path := filepath.Join(dir, entry)
			info, err := b.fsys.Lstat(path)
			if err != nil {
				return err
			}
			if info.IsDir() {
				if err := walk(path); err != nil {
					return err
				}
			} else if entry == name && b.caskExecutable(ctx, path) {
				target, err := resolveLinks(b.fsys, path)
				if err != nil {
					return err
				}
				if isWithin(root, target) {
					matches = append(matches, path)
				}
			}
		}
		return nil
	}
	if err := walk(app); err != nil {
		return nil, err
	}
	return matches, nil
}

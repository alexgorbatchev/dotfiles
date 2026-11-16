package config

import (
	"fmt"
	"path/filepath"
	"strings"
)

// ValidateDevToolsDir keeps development storage separate from directories owned
// by release installation, generated shims and cache pruning. It may be inside
// generatedDir; the default is a sibling of those independently managed trees.
func (p *ProjectConfig) ValidateDevToolsDir() error {
	dev := p.Paths.DevToolsDir
	if dev == "" {
		return nil
	}
	managed := []struct{ name, path string }{
		{"paths.binariesDir", p.Paths.BinariesDir},
		{"paths.targetDir", p.Paths.TargetDir},
		{"paths.shellScriptsDir", p.Paths.ShellScriptsDir},
	}
	if p.Paths.GeneratedDir != "" {
		for _, name := range []string{"node_modules", "cache", "usage"} {
			managed = append(managed, struct{ name, path string }{"paths.generatedDir/" + name, filepath.Join(p.Paths.GeneratedDir, name)})
		}
	}
	for _, dir := range managed {
		// targetDir owns individual shims, not its entire descendant tree. Existing
		// configurations may put shims in the project root alongside generatedDir.
		if dir.path != "" && (containsDirectory(dev, dir.path) || dir.name != "paths.targetDir" && containsDirectory(dir.path, dev)) {
			return fmt.Errorf("paths.devToolsDir %q overlaps managed directory %s %q; choose a separate directory such as {paths.generatedDir}/dev-tools", dev, dir.name, dir.path)
		}
	}
	return nil
}

func containsDirectory(parent, child string) bool {
	rel, err := filepath.Rel(parent, child)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

package vm

import (
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

// writePathsConfig writes a configuration whose only content is the given paths block
// and returns the directory holding it.
func writePathsConfig(t *testing.T, pathsBlock string) string {
	t.Helper()
	dir := t.TempDir()
	content := "export default { paths: " + pathsBlock + " };"
	if err := os.WriteFile(filepath.Join(dir, "dotfiles.config.ts"), []byte(content), 0o644); err != nil {
		t.Fatalf("writing configuration: %v", err)
	}
	return dir
}

// loadPathsConfig loads the configuration written in dir the way the CLI does.
func loadPathsConfig(t *testing.T, dir string) (*config.ProjectConfig, error) {
	t.Helper()
	log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})
	projCfg, _, err := LoadTypeScriptConfig(log, fs.NewOSFS(), filepath.Join(dir, "dotfiles.config.ts"))
	return projCfg, err
}

// A relative path setting names a directory of the dotfiles repository, so it has to
// mean the same directory no matter which directory the command was run from.
func TestLoadTypeScriptConfigAnchorsRelativePathsToTheConfigFile(t *testing.T) {
	dir := writePathsConfig(t, `{ generatedDir: "./out-relative", targetDir: "bin-relative" }`)
	t.Chdir(t.TempDir())

	projCfg, err := loadPathsConfig(t, dir)
	if err != nil {
		t.Fatalf("loading configuration: %v", err)
	}

	if want := filepath.Join(dir, "out-relative"); projCfg.Paths.GeneratedDir != want {
		t.Errorf("GeneratedDir = %q, want %q", projCfg.Paths.GeneratedDir, want)
	}
	if want := filepath.Join(dir, "bin-relative"); projCfg.Paths.TargetDir != want {
		t.Errorf("TargetDir = %q, want %q", projCfg.Paths.TargetDir, want)
	}
}

// Every {paths.*} reference the documentation shows has to be substituted, in whatever
// order the settings depend on each other, and a ~ has to be expanded afterwards.
func TestLoadTypeScriptConfigSubstitutesEveryPathsPlaceholder(t *testing.T) {
	home := t.TempDir()
	dir := writePathsConfig(t, `{
		homeDir: "`+filepath.ToSlash(home)+`",
		dotfilesDir: "~/dots",
		generatedDir: "{paths.dotfilesDir}/expanded",
		binariesDir: "{paths.generatedDir}/binaries",
		targetDir: "{paths.homeDir}/bin",
		toolConfigsDir: ["{paths.dotfilesDir}/tools", "{configFileDir}/extra-tools"],
	}`)
	t.Chdir(t.TempDir())

	projCfg, err := loadPathsConfig(t, dir)
	if err != nil {
		t.Fatalf("loading configuration: %v", err)
	}

	dotfilesDir := filepath.Join(home, "dots")
	generatedDir := filepath.Join(dotfilesDir, "expanded")
	checks := map[string]struct{ got, want string }{
		"DotfilesDir":     {projCfg.Paths.DotfilesDir, dotfilesDir},
		"GeneratedDir":    {projCfg.Paths.GeneratedDir, generatedDir},
		"BinariesDir":     {projCfg.Paths.BinariesDir, filepath.Join(generatedDir, "binaries")},
		"TargetDir":       {projCfg.Paths.TargetDir, filepath.Join(home, "bin")},
		"ShellScriptsDir": {projCfg.Paths.ShellScriptsDir, filepath.Join(generatedDir, "shell-scripts")},
	}
	for name, check := range checks {
		if check.got != check.want {
			t.Errorf("%s = %q, want %q", name, check.got, check.want)
		}
	}

	dirs := projCfg.Paths.GetToolConfigsDirs()
	want := []string{filepath.Join(dotfilesDir, "tools"), filepath.Join(dir, "extra-tools")}
	if len(dirs) != len(want) || dirs[0] != want[0] || dirs[1] != want[1] {
		t.Errorf("GetToolConfigsDirs() = %v, want %v", dirs, want)
	}
}

// A placeholder nothing can fill has to abort the load: substituting it with itself
// creates a directory whose name contains braces, which is how both of these defects
// went unnoticed.
func TestLoadTypeScriptConfigRejectsUnknownPathsPlaceholder(t *testing.T) {
	dir := writePathsConfig(t, `{ generatedDir: "{paths.dotfleDir}/out" }`)

	_, err := loadPathsConfig(t, dir)
	if err == nil {
		t.Fatal("expected the load to fail on an unknown placeholder")
	}
	if !strings.Contains(err.Error(), "{paths.dotfleDir}") || !strings.Contains(err.Error(), "generatedDir") {
		t.Errorf("error = %v, want it to name paths.generatedDir and the unknown placeholder", err)
	}
}

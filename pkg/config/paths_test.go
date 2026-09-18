package config

import (
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// resolvedPaths resolves paths against configFileDir and fails the test if the
// configuration is rejected.
func resolvedPaths(t *testing.T, configFileDir string, paths PathsConfig) PathsConfig {
	t.Helper()
	cfg := &ProjectConfig{Paths: paths}
	if err := cfg.ResolvePlaceholders(configFileDir); err != nil {
		t.Fatalf("ResolvePlaceholders(%q) = %v, want no error", configFileDir, err)
	}
	return cfg.Paths
}

// Every setting of the paths block has a default; a missing one would resolve to the
// empty string and put a generated file at the filesystem root.
func TestPathDefaultsCoverEveryPathsKey(t *testing.T) {
	for _, key := range pathsKeys {
		if _, ok := pathDefaults[key]; !ok {
			t.Errorf("paths.%s has no entry in pathDefaults", key)
		}
	}
	for key := range pathDefaults {
		if !slices.Contains(pathsKeys, key) {
			t.Errorf("pathDefaults names %q, which is not a setting the validator accepts", key)
		}
	}
}

func TestResolvePlaceholdersNilConfig(t *testing.T) {
	var cfg *ProjectConfig
	if err := cfg.ResolvePlaceholders(""); err != nil {
		t.Fatalf("ResolvePlaceholders on a nil config = %v, want no error", err)
	}
}

// A configuration that sets nothing keeps everything the CLI writes beside the file
// that declares it, which is what makes the documented defaults independent of the
// directory the command was run from.
func TestResolvePlaceholdersAppliesDefaultsBesideTheConfigFile(t *testing.T) {
	configFileDir := t.TempDir()
	home := t.TempDir()

	paths := resolvedPaths(t, configFileDir, PathsConfig{HomeDir: home})

	generatedDir := filepath.Join(configFileDir, ".generated")
	checks := map[string]struct{ got, want string }{
		"HomeDir":         {paths.HomeDir, home},
		"DotfilesDir":     {paths.DotfilesDir, configFileDir},
		"GeneratedDir":    {paths.GeneratedDir, generatedDir},
		"TargetDir":       {paths.TargetDir, filepath.Join(generatedDir, "bin")},
		"BinariesDir":     {paths.BinariesDir, filepath.Join(generatedDir, "binaries")},
		"ShellScriptsDir": {paths.ShellScriptsDir, filepath.Join(generatedDir, "shell-scripts")},
	}
	for name, check := range checks {
		if check.got != check.want {
			t.Errorf("%s = %q, want %q", name, check.got, check.want)
		}
	}

	want := []string{filepath.Join(configFileDir, "tools")}
	if dirs := paths.GetToolConfigsDirs(); !slices.Equal(dirs, want) {
		t.Errorf("GetToolConfigsDirs() = %v, want %v", dirs, want)
	}
}

// Moving paths.dotfilesDir has to move everything that hangs off it, including the
// defaults, which is only true because the defaults are templates resolved like any
// other value.
func TestResolvePlaceholdersDefaultsFollowDotfilesDir(t *testing.T) {
	configFileDir := t.TempDir()
	home := t.TempDir()

	paths := resolvedPaths(t, configFileDir, PathsConfig{HomeDir: home, DotfilesDir: "~/dots"})

	generatedDir := filepath.Join(home, "dots", ".generated")
	if paths.GeneratedDir != generatedDir {
		t.Errorf("GeneratedDir = %q, want %q", paths.GeneratedDir, generatedDir)
	}
	if want := filepath.Join(generatedDir, "binaries"); paths.BinariesDir != want {
		t.Errorf("BinariesDir = %q, want %q", paths.BinariesDir, want)
	}
}

func TestResolvePlaceholdersAnchorsRelativeValues(t *testing.T) {
	configFileDir := t.TempDir()
	home := t.TempDir()

	paths := resolvedPaths(t, configFileDir, PathsConfig{
		HomeDir:        home,
		DotfilesDir:    "./sub",
		GeneratedDir:   "out",
		ToolConfigsDir: []interface{}{"tools", "../shared-tools"},
	})

	if want := filepath.Join(configFileDir, "sub"); paths.DotfilesDir != want {
		t.Errorf("DotfilesDir = %q, want %q", paths.DotfilesDir, want)
	}
	if want := filepath.Join(configFileDir, "out"); paths.GeneratedDir != want {
		t.Errorf("GeneratedDir = %q, want %q", paths.GeneratedDir, want)
	}
	want := []string{filepath.Join(configFileDir, "tools"), filepath.Join(filepath.Dir(configFileDir), "shared-tools")}
	if dirs := paths.GetToolConfigsDirs(); !slices.Equal(dirs, want) {
		t.Errorf("GetToolConfigsDirs() = %v, want %v", dirs, want)
	}
}

// A setting may be written in terms of any other one, in whatever order, and a "~"
// introduced by such a reference is expanded afterwards.
func TestResolvePlaceholdersSubstitutesInDependencyOrder(t *testing.T) {
	configFileDir := t.TempDir()
	home := t.TempDir()

	paths := resolvedPaths(t, configFileDir, PathsConfig{
		HomeDir:         home,
		DotfilesDir:     "~/dots",
		BinariesDir:     "{paths.generatedDir}/bin",
		GeneratedDir:    "{paths.dotfilesDir}/out",
		TargetDir:       "{paths.binariesDir}/current",
		ShellScriptsDir: "{HOME}/scripts",
		ToolConfigsDir:  "{configFileDir}/tools",
	})

	generatedDir := filepath.Join(home, "dots", "out")
	binariesDir := filepath.Join(generatedDir, "bin")
	checks := map[string]struct{ got, want string }{
		"DotfilesDir":     {paths.DotfilesDir, filepath.Join(home, "dots")},
		"GeneratedDir":    {paths.GeneratedDir, generatedDir},
		"BinariesDir":     {paths.BinariesDir, binariesDir},
		"TargetDir":       {paths.TargetDir, filepath.Join(binariesDir, "current")},
		"ShellScriptsDir": {paths.ShellScriptsDir, filepath.Join(home, "scripts")},
	}
	for name, check := range checks {
		if check.got != check.want {
			t.Errorf("%s = %q, want %q", name, check.got, check.want)
		}
	}
	if want := filepath.Join(configFileDir, "tools"); paths.GetPrimaryToolConfigsDir() != want {
		t.Errorf("GetPrimaryToolConfigsDir() = %q, want %q", paths.GetPrimaryToolConfigsDir(), want)
	}
}

// paths.homeDir is what "~" means everywhere else, so a configuration that sets it
// decides where the rest of the tree lands.
func TestResolvePlaceholdersHomeDirDrivesTildeExpansion(t *testing.T) {
	configFileDir := t.TempDir()
	home := t.TempDir()

	paths := resolvedPaths(t, configFileDir, PathsConfig{
		HomeDir:     home,
		DotfilesDir: "~",
		TargetDir:   "~/bin",
	})

	if paths.DotfilesDir != home {
		t.Errorf("DotfilesDir = %q, want %q", paths.DotfilesDir, home)
	}
	if want := filepath.Join(home, "bin"); paths.TargetDir != want {
		t.Errorf("TargetDir = %q, want %q", paths.TargetDir, want)
	}
}

// Resolving a configuration that is already resolved has to be a no-op: the CLI
// resolves once in the loader and again after the bootstrap overrides.
func TestResolvePlaceholdersIsIdempotent(t *testing.T) {
	configFileDir := t.TempDir()
	home := t.TempDir()

	declared := PathsConfig{
		HomeDir:        home,
		DotfilesDir:    "~/dots",
		GeneratedDir:   "{paths.dotfilesDir}/out",
		ToolConfigsDir: []string{"tools", "{configFileDir}/extra"},
	}

	once := resolvedPaths(t, configFileDir, declared)
	twice := resolvedPaths(t, configFileDir, once)

	if once.HomeDir != twice.HomeDir || once.DotfilesDir != twice.DotfilesDir ||
		once.GeneratedDir != twice.GeneratedDir || once.TargetDir != twice.TargetDir ||
		once.BinariesDir != twice.BinariesDir || once.ShellScriptsDir != twice.ShellScriptsDir {
		t.Errorf("resolving twice changed the paths:\nfirst  %+v\nsecond %+v", once, twice)
	}
	if !slices.Equal(once.GetToolConfigsDirs(), twice.GetToolConfigsDirs()) {
		t.Errorf("resolving twice changed the tool config dirs: %v then %v", once.GetToolConfigsDirs(), twice.GetToolConfigsDirs())
	}
}

// A "${...}" token is an expansion the generated shell script performs, so the loader
// leaves it alone instead of rejecting it as an unknown placeholder.
func TestResolvePlaceholdersLeavesShellExpansionsAlone(t *testing.T) {
	configFileDir := t.TempDir()
	home := t.TempDir()

	paths := resolvedPaths(t, configFileDir, PathsConfig{HomeDir: home, TargetDir: "${XDG_BIN_HOME}/bin"})

	if want := filepath.Join(configFileDir, "${XDG_BIN_HOME}", "bin"); paths.TargetDir != want {
		t.Errorf("TargetDir = %q, want %q", paths.TargetDir, want)
	}
}

func TestResolvePlaceholdersRejectsBadValues(t *testing.T) {
	home := t.TempDir()

	tests := []struct {
		name      string
		paths     PathsConfig
		wantParts []string
	}{
		{
			name:      "unknown placeholder",
			paths:     PathsConfig{HomeDir: home, GeneratedDir: "{paths.dotfleDir}/out"},
			wantParts: []string{"paths.generatedDir", "{paths.dotfleDir}"},
		},
		{
			name:      "placeholder that is not a paths setting",
			paths:     PathsConfig{HomeDir: home, TargetDir: "{tool.name}/bin"},
			wantParts: []string{"paths.targetDir", "{tool.name}"},
		},
		{
			name:      "unknown placeholder in one of several tool config dirs",
			paths:     PathsConfig{HomeDir: home, ToolConfigsDir: []string{"tools", "{paths.nope}/tools"}},
			wantParts: []string{"paths.toolConfigsDir", "{paths.nope}"},
		},
		{
			name:      "reference cycle",
			paths:     PathsConfig{HomeDir: home, GeneratedDir: "{paths.binariesDir}/out", BinariesDir: "{paths.generatedDir}/bin"},
			wantParts: []string{"reference cycle"},
		},
		{
			name:      "unsupported home-relative path",
			paths:     PathsConfig{HomeDir: home, TargetDir: "~someone/bin"},
			wantParts: []string{"paths.targetDir", "~someone/bin"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := &ProjectConfig{Paths: tt.paths}
			err := cfg.ResolvePlaceholders(t.TempDir())
			if err == nil {
				t.Fatalf("ResolvePlaceholders() = nil, want an error")
			}
			for _, part := range tt.wantParts {
				if !strings.Contains(err.Error(), part) {
					t.Errorf("error %q does not mention %q", err, part)
				}
			}
		})
	}
}

// With no home directory to expand against, a "~" path has to be reported rather than
// turned into a path relative to the configuration file.
func TestResolvePlaceholdersReportsTildeWithoutHomeDir(t *testing.T) {
	if _, err := anchorPath(pathTargetDir, "~/bin", t.TempDir(), ""); err == nil {
		t.Fatal("anchorPath with no home directory = nil, want an error")
	} else if !strings.Contains(err.Error(), "paths.homeDir") {
		t.Errorf("error %q does not point at paths.homeDir", err)
	}
}

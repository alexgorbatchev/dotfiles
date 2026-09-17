package scaffold

import (
	"os"
	"path/filepath"
	"slices"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func actionsByName(t *testing.T, results []Result) map[string]Action {
	t.Helper()
	byName := make(map[string]Action, len(results))
	for _, res := range results {
		byName[filepath.Base(res.Path)] = res.Action
	}
	return byName
}

// TargetOS is a parameter rather than being read from runtime.GOOS so that the
// platform-specific templates can be asserted from any host platform.
func TestRunSelectsTemplatesForTargetOS(t *testing.T) {
	tests := []struct {
		targetOS string
		want     []string
	}{
		{targetOS: "darwin", want: []string{"brew.tool.ts", "dotfiles.tool.ts"}},
		{targetOS: "linux", want: []string{"dotfiles.tool.ts"}},
		{targetOS: "windows", want: []string{"dotfiles.tool.ts"}},
	}

	for _, tt := range tests {
		t.Run(tt.targetOS, func(t *testing.T) {
			dir := filepath.Join(t.TempDir(), "tools")

			results, err := Run(fs.NewOSFS(), Options{Dir: dir, TargetOS: tt.targetOS})
			if err != nil {
				t.Fatalf("Run failed: %v", err)
			}

			var got []string
			for _, res := range results {
				if res.Action != ActionCreated {
					t.Errorf("expected %s to be created, got %q", res.Path, res.Action)
				}
				got = append(got, filepath.Base(res.Path))
			}
			slices.Sort(got)
			if !slices.Equal(got, tt.want) {
				t.Errorf("provisioned %v, want %v", got, tt.want)
			}
		})
	}
}

func TestRunCreatesMissingDirectory(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "nested", "tools")
	osFS := fs.NewOSFS()

	if _, err := Run(osFS, Options{Dir: dir, TargetOS: "linux"}); err != nil {
		t.Fatalf("Run failed: %v", err)
	}

	if exists, _ := osFS.Exists(filepath.Join(dir, "dotfiles.tool.ts")); !exists {
		t.Error("expected the starter tool to be written into the created directory")
	}
}

func TestRunLeavesExistingFilesAloneWithoutForce(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "tools")
	osFS := fs.NewOSFS()
	if err := osFS.MkdirAll(dir, 0755); err != nil {
		t.Fatalf("creating dir: %v", err)
	}

	existing := []byte("// hand written, do not clobber\n")
	path := filepath.Join(dir, "dotfiles.tool.ts")
	if err := osFS.WriteFile(path, existing, 0644); err != nil {
		t.Fatalf("seeding existing file: %v", err)
	}

	results, err := Run(osFS, Options{Dir: dir, TargetOS: "linux"})
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}
	if got := actionsByName(t, results)["dotfiles.tool.ts"]; got != ActionSkipped {
		t.Errorf("expected the existing file to be skipped, got %q", got)
	}

	content, err := osFS.ReadFile(path)
	if err != nil {
		t.Fatalf("reading back: %v", err)
	}
	if string(content) != string(existing) {
		t.Errorf("existing file was modified: %q", string(content))
	}
}

func TestRunReplacesExistingFilesWithForce(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "tools")
	osFS := fs.NewOSFS()
	if err := osFS.MkdirAll(dir, 0755); err != nil {
		t.Fatalf("creating dir: %v", err)
	}

	path := filepath.Join(dir, "dotfiles.tool.ts")
	if err := osFS.WriteFile(path, []byte("// stale\n"), 0644); err != nil {
		t.Fatalf("seeding existing file: %v", err)
	}

	results, err := Run(osFS, Options{Dir: dir, TargetOS: "linux", Force: true})
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}
	if got := actionsByName(t, results)["dotfiles.tool.ts"]; got != ActionOverwrote {
		t.Errorf("expected the existing file to be overwritten, got %q", got)
	}

	content, err := osFS.ReadFile(path)
	if err != nil {
		t.Fatalf("reading back: %v", err)
	}
	if string(content) != dotfilesToolContent {
		t.Errorf("expected the template content after --force, got %q", string(content))
	}
}

func TestRunRequiresADirectory(t *testing.T) {
	if _, err := Run(fs.NewOSFS(), Options{TargetOS: "linux"}); err == nil {
		t.Error("expected an error when no tool configs directory is given")
	}
}

func TestRunReportsWriteFailure(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("skipping unwritable directory test as root user")
	}

	parent := filepath.Join(t.TempDir(), "readonly")
	if err := os.MkdirAll(parent, 0555); err != nil {
		t.Fatalf("creating read-only parent: %v", err)
	}
	t.Cleanup(func() { _ = os.Chmod(parent, 0755) })

	if _, err := Run(fs.NewOSFS(), Options{Dir: filepath.Join(parent, "tools"), TargetOS: "linux"}); err == nil {
		t.Error("expected an error when the starter tool cannot be written")
	}
}

// An untouched copy of an older template is reported as outdated rather than skipped,
// so an existing repository can be told that it needs updating without anything being
// overwritten behind the user's back.
func TestRunReportsAnUntouchedOutdatedTemplate(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "tools")
	osFS := fs.NewOSFS()
	if err := osFS.MkdirAll(dir, 0755); err != nil {
		t.Fatalf("creating dir: %v", err)
	}
	path := filepath.Join(dir, "brew.tool.ts")
	if err := osFS.WriteFile(path, []byte(legacyBrewToolContent), 0644); err != nil {
		t.Fatalf("seeding legacy file: %v", err)
	}

	results, err := Run(osFS, Options{Dir: dir, TargetOS: "darwin"})
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}
	if got := actionsByName(t, results)["brew.tool.ts"]; got != ActionOutdated {
		t.Errorf("expected the legacy file to be reported outdated, got %q", got)
	}

	content, err := osFS.ReadFile(path)
	if err != nil {
		t.Fatalf("reading back: %v", err)
	}
	if string(content) != legacyBrewToolContent {
		t.Error("expected the outdated file to be left untouched without --force")
	}
}

func TestRunUpgradesAnUntouchedOutdatedTemplateWithoutABackup(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "tools")
	osFS := fs.NewOSFS()
	if err := osFS.MkdirAll(dir, 0755); err != nil {
		t.Fatalf("creating dir: %v", err)
	}
	path := filepath.Join(dir, "brew.tool.ts")
	if err := osFS.WriteFile(path, []byte(legacyBrewToolContent), 0644); err != nil {
		t.Fatalf("seeding legacy file: %v", err)
	}

	results, err := Run(osFS, Options{Dir: dir, TargetOS: "darwin", Force: true})
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}
	for _, res := range results {
		if filepath.Base(res.Path) != "brew.tool.ts" {
			continue
		}
		if res.Action != ActionOverwrote {
			t.Errorf("expected the legacy file to be overwritten, got %q", res.Action)
		}
		if res.BackupPath != "" {
			t.Errorf("expected no backup of a file this project generated, got %q", res.BackupPath)
		}
	}
}

// A file the user edited is preserved beside itself, so --force cannot silently
// destroy work.
func TestRunBacksUpEditedFilesBeforeOverwriting(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "tools")
	osFS := fs.NewOSFS()
	if err := osFS.MkdirAll(dir, 0755); err != nil {
		t.Fatalf("creating dir: %v", err)
	}
	path := filepath.Join(dir, "brew.tool.ts")
	edited := []byte("// hand written, must survive --force\n")
	if err := osFS.WriteFile(path, edited, 0644); err != nil {
		t.Fatalf("seeding edited file: %v", err)
	}

	results, err := Run(osFS, Options{Dir: dir, TargetOS: "darwin", Force: true})
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}

	var backupPath string
	for _, res := range results {
		if filepath.Base(res.Path) == "brew.tool.ts" {
			backupPath = res.BackupPath
		}
	}
	if backupPath == "" {
		t.Fatal("expected an edited file to be backed up before being replaced")
	}

	backup, err := osFS.ReadFile(backupPath)
	if err != nil {
		t.Fatalf("reading backup: %v", err)
	}
	if string(backup) != string(edited) {
		t.Errorf("backup = %q, want %q", string(backup), string(edited))
	}
}

// Running twice must be a no-op: the second run sees content identical to the template
// and reports it as skipped rather than as an edit or an outdated version.
func TestRunIsIdempotent(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "tools")
	osFS := fs.NewOSFS()

	if _, err := Run(osFS, Options{Dir: dir, TargetOS: "darwin"}); err != nil {
		t.Fatalf("first Run failed: %v", err)
	}
	results, err := Run(osFS, Options{Dir: dir, TargetOS: "darwin"})
	if err != nil {
		t.Fatalf("second Run failed: %v", err)
	}

	for name, action := range actionsByName(t, results) {
		if action != ActionSkipped {
			t.Errorf("%s = %q on a second run, want %q", name, action, ActionSkipped)
		}
	}
}

func TestRunReportsAnUnreadableExistingFile(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "tools")
	osFS := fs.NewOSFS()
	// A directory where a tool configuration is expected exists but cannot be read.
	if err := osFS.MkdirAll(filepath.Join(dir, "dotfiles.tool.ts"), 0755); err != nil {
		t.Fatalf("creating blocking directory: %v", err)
	}

	if _, err := Run(osFS, Options{Dir: dir, TargetOS: "linux"}); err == nil {
		t.Error("expected an error when an existing tool configuration cannot be read")
	}
}

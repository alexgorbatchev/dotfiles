package orchestrator

import (
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
)

func TestGetBinaryNames(t *testing.T) {
	t.Parallel()
	// A bare string is not a shape .bin() records, so it names no binary; the map is
	// what a loaded configuration holds and the typed forms are what Go code builds.
	binaries := []interface{}{
		"simple-bin",
		config.BinaryConfig{Name: "struct-bin", Pattern: "pat"},
		&config.BinaryConfig{Name: "pointer-bin", Pattern: "pat"},
		map[string]interface{}{"name": "map-bin"},
	}

	names := getBinaryNames(binaries)
	if len(names) != 3 {
		t.Fatalf("expected 3 names, got %d", len(names))
	}

	expected := []string{"struct-bin", "pointer-bin", "map-bin"}
	for i, name := range names {
		if name != expected[i] {
			t.Errorf("expected %q, got %q", expected[i], name)
		}
	}
}

func TestGetPatternForBinaryCoverage(t *testing.T) {
	ptrBin := &config.BinaryConfig{Name: "ptr-bin", Pattern: "ptr-pat"}
	valBin := config.BinaryConfig{Name: "val-bin", Pattern: "val-pat"}
	mapBin := map[string]interface{}{"name": "map-bin", "pattern": "map-pat"}

	binaries := []interface{}{ptrBin, valBin, mapBin}

	if pat := getPatternForBinary(binaries, "ptr-bin"); pat != "ptr-pat" {
		t.Errorf("expected ptr-pat, got %q", pat)
	}
	if pat := getPatternForBinary(binaries, "val-bin"); pat != "val-pat" {
		t.Errorf("expected val-pat, got %q", pat)
	}
	if pat := getPatternForBinary(binaries, "map-bin"); pat != "map-pat" {
		t.Errorf("expected map-pat, got %q", pat)
	}
	if pat := getPatternForBinary(binaries, "unknown"); pat != "" {
		t.Errorf("expected empty string for unknown, got %q", pat)
	}
}

func TestFindSystemBinaryCoverage(t *testing.T) {
	memFS := newMemFS()
	orch := newTestOrchestrator(t, memFS, "")

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:      "/home/user",
			TargetDir:    "~/.bin",
			GeneratedDir: "/home/user/.generated",
		},
	}

	// 1. Candidate in target dir is skipped
	_ = memFS.MkdirAll("/home/user/.bin", 0755)
	_ = memFS.WriteFile("/home/user/.bin/mybin", []byte("bin"), 0755)

	// 2. Candidate in .generated/bin is skipped
	_ = memFS.MkdirAll("/home/user/.generated/bin", 0755)
	_ = memFS.WriteFile("/home/user/.generated/bin/mybin", []byte("bin"), 0755)

	// 3. Fallback candidate in /opt/homebrew/bin is found
	_ = memFS.MkdirAll("/opt/homebrew/bin", 0755)
	_ = memFS.WriteFile("/opt/homebrew/bin/mybin", []byte("bin"), 0755)

	t.Setenv("PATH", "~/.bin:/home/user/.generated/bin")
	found, err := orch.findSystemBinary("mybin", projCfg)
	if err != nil {
		t.Fatalf("findSystemBinary: %v", err)
	}
	if found != "/opt/homebrew/bin/mybin" {
		t.Errorf("findSystemBinary = %q, want /opt/homebrew/bin/mybin", found)
	}

	// 4. Candidate in user PATH
	_ = memFS.MkdirAll("/home/user/custom-bin", 0755)
	_ = memFS.WriteFile("/home/user/custom-bin/otherbin", []byte("bin"), 0755)
	t.Setenv("PATH", "~/custom-bin")
	found, err = orch.findSystemBinary("otherbin", projCfg)
	if err != nil {
		t.Fatalf("findSystemBinary: %v", err)
	}
	if found != "/home/user/custom-bin/otherbin" {
		t.Errorf("findSystemBinary = %q, want /home/user/custom-bin/otherbin", found)
	}
}

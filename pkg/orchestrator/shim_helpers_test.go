package orchestrator

import (
	"bytes"
	"context"
	"path/filepath"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

// bootstrapTestBinName is deliberately unique: MemFS.Exists falls back to the
// host filesystem, so a common name such as "htop" could be satisfied by a real
// PATH entry on the machine running the tests and make the outcome host-dependent.
const bootstrapTestBinName = "dotfiles-bootstrap-shim-bin-7c3e"

// newShimTargetOrchestrator builds an orchestrator whose log can be read back and whose
// filesystem holds a real-looking same-named binary in a standard system location, the
// one findSystemBinary falls back to whatever PATH the test process has.
func newShimTargetOrchestrator(t *testing.T, binName string) (*Orchestrator, *fs.MemFS, *bytes.Buffer, *config.ProjectConfig) {
	t.Helper()
	ctx := context.Background()
	memFS := newMemFS()
	var logBuf bytes.Buffer
	log := logger.New(logger.Config{Level: logger.LogLevelVerbose, Writer: &logBuf})

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed to open sqlite DB: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })

	if err := memFS.MkdirAll("/usr/bin", 0755); err != nil {
		t.Fatalf("creating /usr/bin: %v", err)
	}
	if err := memFS.WriteFile(filepath.Join("/usr/bin", binName), []byte("system-binary"), 0755); err != nil {
		t.Fatalf("writing system binary: %v", err)
	}

	orch := NewOrchestrator(log, memFS, exec.NewMockRunner(), registry.NewRegistry(sqlDB), installer.NewRegistry())
	orch.SetSymlinkFS(memFS)
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:      "/home/user",
			TargetDir:    "/home/user/bin",
			BinariesDir:  "/home/user/binaries",
			GeneratedDir: "/home/user/.generated",
		},
	}
	return orch, memFS, &logBuf, projCfg
}

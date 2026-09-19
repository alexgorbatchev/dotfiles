package orchestrator

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// symlinkRefusingFS is a filesystem that cannot create symbolic links, which is
// what a Windows account without the privilege, and some mounted volumes, look
// like.
type symlinkRefusingFS struct {
	fs.FS
}

func (s *symlinkRefusingFS) Symlink(oldname, newname string) error {
	return errors.New("symlinks are not permitted on this filesystem")
}

// SyncTypeScriptTypes links the project's node_modules at the generated authoring
// package. Where a symlink cannot be created the package has to be copied in
// instead, or the project's tool files would not typecheck at all.
func TestSyncTypeScriptTypesCopiesWhenSymlinksAreUnavailable(t *testing.T) {
	ctx := context.Background()
	memFS := fs.NewMemFS()
	orch := newTestOrchestrator(t, &symlinkRefusingFS{FS: memFS}, "")

	root := "/home/user/dotfiles"
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:      "/home/user",
			DotfilesDir:  root,
			GeneratedDir: filepath.Join(root, ".generated"),
		},
	}

	if err := orch.SyncTypeScriptTypes(ctx, nil, projCfg); err != nil {
		t.Fatalf("SyncTypeScriptTypes returned error: %v", err)
	}

	projPkgDir := filepath.Join(root, "node_modules", "@alexgorbatchev", "dotfiles")

	// Nothing was linked, so the package must be present as real files.
	if fi, err := memFS.Lstat(projPkgDir); err == nil && fi.Mode()&os.ModeSymlink != 0 {
		t.Fatal("a symlink was created by a filesystem that refuses them")
	}
	entries, err := memFS.ReadDir(projPkgDir)
	if err != nil {
		t.Fatalf("the package was neither linked nor copied into %s: %v", projPkgDir, err)
	}
	if len(entries) == 0 {
		t.Errorf("%s is empty: the embedded package was not copied in", projPkgDir)
	}
}

package main

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/devtools"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/orchestrator"
)

func TestToolDevPartialGenerationRestoresRouting(t *testing.T) {
	for _, action := range []string{"first use", "replacement use", "off"} {
		t.Run(action, func(t *testing.T) {
			definition := `install("github-release", {repo: "owner/example"}).bin("example")`
			p := newE2EProject(t, tsTools{"example": definition})
			binary := devTestBinary(t, p.Root, "local-build", "#!/bin/sh\necho development\n")
			store := devtools.New(fs.NewOSFS(), filepath.Join(p.GeneratedDir, "dev-tools"))
			if action != "first use" {
				if out, err := p.run("tool", "dev", "use", "example", "--bin", "example="+binary); err != nil {
					t.Fatalf("initial registration: %v\n%s", err, out.Combined)
				}
			}
			previous, err := store.Lookup("example")
			if err != nil {
				t.Fatal(err)
			}
			shim := filepath.Join(p.TargetDir, "example")
			before, err := os.ReadFile(shim)
			if err != nil && !errors.Is(err, os.ErrNotExist) {
				t.Fatal(err)
			}
			p.writeConfig(t, tsTools{"example": definition + `.copy("missing.conf", "~/example.conf")`}, "", "")
			services, err := BootstrapServices(context.Background(), p.ConfigPath)
			if err != nil {
				t.Fatal(err)
			}
			defer services.Close()
			beforeState, err := services.Registry.GetFileState(context.Background(), shim)
			if err != nil {
				t.Fatal(err)
			}
			args := []string{"tool", "dev", "use", "example", "--bin", "example=" + binary}
			if action == "off" {
				args = []string{"tool", "dev", "off", "example"}
			}
			out, err := p.run(args...)
			if err == nil || !strings.Contains(err.Error(), "source path does not exist") {
				t.Fatalf("expected copy failure after shim write: %v\n%s", err, out.Combined)
			}
			after, err := os.ReadFile(shim)
			if action == "first use" {
				if !errors.Is(err, os.ErrNotExist) {
					t.Fatalf("failed first registration retained new shim: %v", err)
				}
			} else if err != nil || !bytes.Equal(before, after) {
				t.Fatalf("failed transition changed routing: %v\nbefore: %s\nafter: %s", err, before, after)
			}
			active, err := store.Lookup("example")
			if err != nil || !reflect.DeepEqual(active, previous) {
				t.Fatalf("selection changed after failure: %#v, %v", active, err)
			}
			afterState, err := services.Registry.GetFileState(context.Background(), shim)
			if err != nil {
				t.Fatal(err)
			}
			if afterState != nil && beforeState != nil {
				afterState.LastModified = beforeState.LastModified
			}
			if !reflect.DeepEqual(afterState, beforeState) {
				t.Fatalf("routing ownership or drift baseline changed: before=%+v, after=%+v", beforeState, afterState)
			}
		})
	}
}

type routingWriteFailure struct {
	fs.FS
	path string
}

func (f routingWriteFailure) WriteFile(path string, data []byte, mode os.FileMode) error {
	if path == f.path {
		return errors.New("injected shell write failure")
	}
	return f.FS.WriteFile(path, data, mode)
}

func TestToolDevShellFailureRestoresCLIAndSharedRouting(t *testing.T) {
	p := newE2EProject(t, tsTools{"dotfiles": `install("github-release", {repo: "owner/dotfiles"}).bin("dotfiles")`})
	binary := devTestBinary(t, p.Root, "local-build", "#!/bin/sh\nexit 0\n")
	if out, err := p.run("tool", "dev", "use", "dotfiles", "--bin", "dotfiles="+binary); err != nil {
		t.Fatalf("initial registration: %v\n%s", err, out.Combined)
	}
	ctx := context.Background()
	services, err := BootstrapServices(ctx, p.ConfigPath)
	if err != nil {
		t.Fatal(err)
	}
	defer services.Close()
	store := devtools.New(services.FS, services.ProjectConfig.Paths.DevToolsDir)
	previous, err := store.Lookup("dotfiles")
	if err != nil {
		t.Fatal(err)
	}
	tool := services.ToolConfigs[0]
	before, err := snapshotDevRouting(ctx, services, tool, previous)
	if err != nil {
		t.Fatal(err)
	}
	services.FS = routingWriteFailure{FS: services.FS, path: filepath.Join(services.ProjectConfig.Paths.ShellScriptsDir, "main.bash")}
	services.Orchestrator = orchestrator.NewOrchestrator(GetLogger("test", nil), services.FS, services.Runner, services.Registry, services.Installers)
	err = changeDevTool(ctx, services, tool, func(ctx context.Context, store *devtools.Store) error {
		_, err := store.Use(ctx, tool.Name, devtools.UseOptions{Binaries: map[string]string{"dotfiles": binary}})
		return err
	})
	if err == nil || !strings.Contains(err.Error(), "injected shell write failure") {
		t.Fatalf("expected partial shell generation failure: %v", err)
	}
	for _, file := range before {
		after, err := readDevRoutingFile(services.FS, file.path)
		if err != nil || !bytes.Equal(after.data, file.data) || after.absent != file.absent {
			t.Fatalf("failed shell refresh changed %s: %v", file.path, err)
		}
	}
	active, err := store.Lookup(tool.Name)
	if err != nil || !reflect.DeepEqual(active, previous) {
		t.Fatalf("failed shell generation changed selection: %#v, %v", active, err)
	}
}

func TestDevRoutingSnapshotRestoresFilesLinksAndAbsence(t *testing.T) {
	mem := fs.NewMemFS()
	dir := filepath.Join(t.TempDir(), "shims")
	if err := mem.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	regular, link, absent := filepath.Join(dir, "regular"), filepath.Join(dir, "link"), filepath.Join(dir, "absent")
	if err := mem.WriteFile(regular, []byte("original"), 0710); err != nil {
		t.Fatal(err)
	}
	if err := mem.Symlink("regular", link); err != nil {
		t.Fatal(err)
	}
	services := &Services{FS: mem, ProjectConfig: &config.ProjectConfig{Paths: config.PathsConfig{TargetDir: dir}}}
	tool := &config.ToolConfig{Name: "suite", Binaries: []interface{}{config.BinaryConfig{Name: "regular"}, config.BinaryConfig{Name: "absent"}}}
	previous := &devtools.Record{Binaries: map[string]string{"link": "old"}}
	files, err := snapshotDevRouting(context.Background(), services, tool, previous)
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{regular, link, absent} {
		if err := mem.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			t.Fatal(err)
		}
		if err := mem.WriteFile(path, []byte("changed"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := restoreDevRouting(context.Background(), services, files); err != nil {
		t.Fatal(err)
	}
	if data, err := mem.ReadFile(regular); err != nil || string(data) != "original" {
		t.Fatalf("regular file not restored: %q, %v", data, err)
	}
	if info, err := mem.Stat(regular); err != nil || info.Mode().Perm() != 0710 {
		t.Fatalf("file mode not restored: %v, %v", info, err)
	}
	if target, err := mem.Readlink(link); err != nil || target != "regular" {
		t.Fatalf("symlink not restored: %s, %v", target, err)
	}
	if _, err := mem.Lstat(absent); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("new shim survived rollback: %v", err)
	}
}

func TestToolDevCancellationStillRollsBackSelection(t *testing.T) {
	p := newE2EProject(t, tsTools{"example": `install("github-release", {repo: "owner/example"}).bin("example")`})
	binary := devTestBinary(t, p.Root, "local-build", "#!/bin/sh\nexit 0\n")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	services, err := BootstrapServices(ctx, p.ConfigPath)
	if err != nil {
		t.Fatal(err)
	}
	defer services.Close()
	tool := services.ToolConfigs[0]
	err = changeDevTool(ctx, services, tool, func(ctx context.Context, store *devtools.Store) error {
		_, err := store.Use(ctx, tool.Name, devtools.UseOptions{Binaries: map[string]string{"example": binary}})
		cancel()
		return err
	})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled generation succeeded: %v", err)
	}
	store := devtools.New(services.FS, services.ProjectConfig.Paths.DevToolsDir)
	if active, err := store.Lookup(tool.Name); err != nil || active != nil {
		t.Fatalf("cancellation prevented selection rollback: %#v, %v", active, err)
	}
}

func TestDevRoutingReadAndRestoreFailures(t *testing.T) {
	mem := fs.NewMemFS()
	dir := filepath.Join(t.TempDir(), "shims")
	if err := mem.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	if _, err := readDevRoutingFile(mem, dir); err == nil {
		t.Fatal("directory accepted as routing file")
	}
	services := &Services{FS: mem, ProjectConfig: &config.ProjectConfig{Paths: config.PathsConfig{TargetDir: dir}}}
	for _, name := range []string{"..", "../outside", `foo\bar`} {
		tool := &config.ToolConfig{Binaries: []interface{}{config.BinaryConfig{Name: name}}}
		if _, err := snapshotDevRouting(context.Background(), services, tool, nil); err == nil {
			t.Fatalf("unsafe shim name %q accepted", name)
		}
	}
	file := filepath.Join(dir, "file")
	if err := mem.WriteFile(file, []byte("changed"), 0600); err != nil {
		t.Fatal(err)
	}
	services.FS = routingWriteFailure{FS: mem, path: file}
	err := restoreDevRouting(context.Background(), services, []devRoutingFile{{path: file, data: []byte("original"), mode: 0700}})
	if err == nil || !strings.Contains(err.Error(), "restoring development routing") {
		t.Fatalf("restore write failure hidden: %v", err)
	}
	if err := mem.MkdirAll(file, 0700); err != nil {
		t.Fatal(err)
	}
	if err := mem.WriteFile(filepath.Join(file, "child"), nil, 0600); err != nil {
		t.Fatal(err)
	}
	err = restoreDevRouting(context.Background(), services, []devRoutingFile{{path: file, absent: true}})
	if err == nil || !strings.Contains(err.Error(), "removing failed development routing") {
		t.Fatalf("rollback recursively removed an unrelated directory: %v", err)
	}
}

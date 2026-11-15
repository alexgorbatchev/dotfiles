package orchestrator

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"io"
	"os"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/alexgorbatchev/dotfiles/pkg/vm"
)

const appBundlePath = "/Applications/Recorded App.app"
const appBundlePlist = "verified plist bytes"

func appBundleFixture(t *testing.T) (*Orchestrator, *fs.MemFS, *exec.MockRunner, *bytes.Buffer) {
	t.Helper()
	orch, mem := declFixture(t)
	runner := exec.NewMockRunner()
	runner.RegisterFunc("plutil", func(c *exec.MockCmd) error {
		data, err := io.ReadAll(c.Stdin())
		if err != nil {
			return err
		}
		if string(data) != appBundlePlist {
			t.Errorf("plutil read %q", data)
		}
		c.SetOutput([]byte("example.recorded\n"))
		return nil
	})
	orch.runner = runner
	orch.SetTarget(vm.Target{OS: "darwin", Arch: "arm64"})
	var logs bytes.Buffer
	orch.logger = logger.New(logger.Config{Writer: &logs})
	if err := orch.instRegistry.Register(installer.NewDmgInstaller(runner, mem, nil, nil)); err != nil {
		t.Fatal(err)
	}
	appBundleSeed(t, orch, mem, "app", appBundlePath)
	return orch, mem, runner, &logs
}

func appBundleSeed(t *testing.T, orch *Orchestrator, mem *fs.MemFS, name, path string) {
	t.Helper()
	writeDecl(t, mem, path+"/Contents/Info.plist", appBundlePlist)
	writeDecl(t, mem, path+"/Contents/MacOS/app", "binary")
	writeDecl(t, mem, "/Applications/Unrecorded.app/Contents/Info.plist", "unrelated")
	rec := &registry.ToolInstallationRecord{ToolName: name, Version: "1", InstallPath: "/home/user/.generated/binaries/" + name,
		InstallMethod: ptrTo("dmg"), AppBundlePath: &path, AppBundleIdentifier: ptrTo("example.recorded"), AppBundleInfoPlistHash: ptrTo(fs.HashContent([]byte(appBundlePlist)))}
	if err := orch.reg.WithTx(context.Background(), func(tx *sql.Tx) error {
		if err := orch.reg.RecordToolInstallation(context.Background(), tx, rec); err != nil {
			return err
		}
		return orch.getTrackedFS(context.Background(), tx, name, "shim").WriteFile("/home/user/bin/"+name, []byte("shim"), 0755)
	}); err != nil {
		t.Fatal(err)
	}
}

func TestAppBundleRemovalRoutes(t *testing.T) {
	for _, route := range []string{"orphan", "uninstall", "inactive"} {
		t.Run(route, func(t *testing.T) {
			orch, mem, runner, logs := appBundleFixture(t)
			siblings := []string{"/Applications/.dotfiles-new-Recorded App.app", "/Applications/.dotfiles-old-Recorded App.app"}
			for _, p := range siblings {
				writeDecl(t, mem, p+"/partial", "leftover")
			}
			ctx := context.Background()
			tool := &config.ToolConfig{Name: "app", InstallationMethod: "manual"}
			var err error
			switch route {
			case "orphan":
				err = orch.CleanupOrphanedTools(ctx, nil, declProjectConfig())
			case "inactive":
				tool.InstallationMethod = "dmg"
				tool.Disabled = true
				err = orch.CleanupOrphanedTools(ctx, []*config.ToolConfig{tool}, declProjectConfig())
			default:
				err = orch.UninstallTool(ctx, tool, declProjectConfig())
			}
			if err != nil {
				t.Fatal(err)
			}
			for _, p := range append(siblings, appBundlePath) {
				assertGone(t, mem, p)
				assertRemovalRecorded(t, orch, "app", p)
				ops, err := orch.reg.GetFileOperations(ctx, registry.FileOperationFilter{ToolName: "app", FilePath: p})
				if err != nil || len(ops) != 1 {
					t.Fatalf("removal records %s: %+v, %v", p, ops, err)
				}
			}
			assertGone(t, mem, "/home/user/bin/app")
			assertForgotten(t, orch, "app")
			if _, err := mem.Lstat("/Applications/Unrecorded.app"); err != nil {
				t.Fatal("unrecorded app removed")
			}
			if !strings.Contains(logs.String(), "rm "+appBundlePath) {
				t.Fatalf("missing removal log: %s", logs.String())
			}
			for _, cmd := range runner.History {
				if cmd.Name != "plutil" {
					t.Fatalf("unexpected native command %s", cmd.Name)
				}
			}
			ops, _ := orch.reg.GetFileOperations(ctx, registry.FileOperationFilter{ToolName: "app", FilePath: appBundlePath + "/Contents/Info.plist"})
			if len(ops) != 0 {
				t.Fatal("recorded app descendants")
			}
		})
	}
}

func TestAppBundleRemovalPreservesUnverifiedCopies(t *testing.T) {
	for _, kind := range []string{"legacy", "identifier", "hash", "symlink", "regular file", "unsafe path", "parent link", "linux", "dry run"} {
		t.Run(kind, func(t *testing.T) {
			orch, mem, runner, logs := appBundleFixture(t)
			ctx := context.Background()
			want := ""
			switch kind {
			case "legacy":
				if _, err := appBundleExec(orch, "UPDATE tool_installations SET app_bundle_identifier=NULL"); err != nil {
					t.Fatal(err)
				}
				want = "no identity was recorded"
			case "identifier":
				runner.Register("plutil", []byte("replacement.id"), nil)
				want = "bundle identifier is now"
			case "hash":
				if _, err := appBundleExec(orch, "UPDATE tool_installations SET app_bundle_info_plist_hash='different'"); err != nil {
					t.Fatal(err)
				}
				want = "Info.plist changed"
			case "symlink":
				_ = mem.RemoveAll(appBundlePath)
				_ = mem.Symlink("/Applications/Unrecorded.app", appBundlePath)
				want = "no longer a real app bundle"
			case "regular file":
				_ = mem.RemoveAll(appBundlePath)
				_ = mem.WriteFile(appBundlePath, []byte("replacement"), 0644)
				want = "no longer a real app bundle"
			case "unsafe path":
				if _, err := appBundleExec(orch, "UPDATE tool_installations SET app_bundle_path='/Applications/../Recorded App.app'"); err != nil {
					t.Fatal(err)
				}
				want = "not an app bundle directly"
			case "parent link":
				_ = mem.Rename("/Applications", "/Outside")
				_ = mem.Symlink("/Outside", "/Applications")
				want = "/Applications is not a real directory"
			case "linux":
				orch.SetTarget(vm.Target{OS: "linux", Arch: "amd64"})
				want = "target is not macOS"
			case "dry run":
				ctx = config.WithDryRun(ctx, true)
			}
			if err := orch.CleanupOrphanedTools(ctx, nil, declProjectConfig()); err != nil {
				t.Fatal(err)
			}
			checkPath := appBundlePath
			if kind == "parent link" {
				checkPath = "/Outside/Recorded App.app"
			}
			if _, err := mem.Lstat(checkPath); err != nil {
				t.Fatalf("unverified path removed: %v", err)
			}
			if want != "" && !strings.Contains(logs.String(), want) {
				t.Fatalf("missing reason %q: %s", want, logs.String())
			}
			assertGone(t, mem, "/home/user/bin/app")
			if kind != "identifier" && kind != "hash" && len(runner.History) != 0 {
				t.Fatalf("unverified copy ran native commands: %v", runner.History)
			}
		})
	}
}

type appBundleFailFS struct {
	fs.FS
	path    string
	partial bool
}

func (f *appBundleFailFS) RemoveAll(path string) error {
	if path == f.path {
		if f.partial {
			_ = f.FS.Remove(path + "/Contents/Info.plist")
		}
		return os.ErrPermission
	}
	return f.FS.RemoveAll(path)
}

func TestAppBundleRemovalFailureRetriesAndContinues(t *testing.T) {
	for _, stage := range []string{"app", "sibling", "record", "partial"} {
		t.Run(stage, func(t *testing.T) {
			orch, mem, _, _ := appBundleFixture(t)
			ctx := context.Background()
			appBundleSeed(t, orch, mem, "other", "/Applications/Other.app")
			fault := &appBundleFailFS{FS: mem, path: appBundlePath, partial: stage == "partial"}
			if stage == "sibling" {
				fault.path = "/Applications/.dotfiles-old-Recorded App.app"
				writeDecl(t, mem, fault.path+"/partial", "old")
			}
			if stage == "record" {
				if _, err := appBundleExec(orch, "CREATE TRIGGER fail_bundle_rm BEFORE INSERT ON file_operations WHEN NEW.operation_type='rm' AND NEW.file_path='/Applications/Recorded App.app' BEGIN SELECT RAISE(FAIL,'injected record failure'); END"); err != nil {
					t.Fatal(err)
				}
			} else {
				orch.fs = fault
			}
			if err := orch.CleanupOrphanedTools(ctx, nil, declProjectConfig()); err == nil || !strings.Contains(err.Error(), `tool "app"`) {
				t.Fatalf("expected app failure: %v", err)
			}
			rec, err := orch.reg.GetToolInstallation(ctx, "app")
			if err != nil || rec == nil {
				t.Fatal("failed removal forgot receipt")
			}
			assertGone(t, mem, "/Applications/Other.app")
			assertForgotten(t, orch, "other")
			if stage == "record" {
				if readDecl(t, mem, appBundlePath+"/Contents/Info.plist") != appBundlePlist {
					t.Fatal("rejected INSERT deleted app")
				}
			}
			if stage == "partial" {
				if err := orch.CleanupOrphanedTools(ctx, nil, declProjectConfig()); err == nil || !strings.Contains(err.Error(), "Info.plist") {
					t.Fatalf("partial deletion guessed ownership: %v", err)
				}
				writeDecl(t, mem, appBundlePath+"/Contents/Info.plist", appBundlePlist)
			}
			if stage == "record" {
				if _, err := appBundleExec(orch, "DROP TRIGGER fail_bundle_rm"); err != nil {
					t.Fatal(err)
				}
			} else {
				fault.path = ""
			}
			if err := orch.CleanupOrphanedTools(ctx, nil, declProjectConfig()); err != nil {
				t.Fatal(err)
			}
			assertGone(t, mem, appBundlePath)
			assertForgotten(t, orch, "app")
		})
	}
}

func TestAppBundleRemovalReconcilesMissingRoot(t *testing.T) {
	orch, mem, _, _ := appBundleFixture(t)
	if err := mem.RemoveAll(appBundlePath); err != nil {
		t.Fatal(err)
	}
	if err := orch.CleanupOrphanedTools(context.Background(), nil, declProjectConfig()); err != nil {
		t.Fatal(err)
	}
	assertNoRecordedRemoval(t, orch, "app", appBundlePath)
	assertForgotten(t, orch, "app")
}

func TestAppBundleRemovalInspectionFailure(t *testing.T) {
	orch, mem, _, _ := appBundleFixture(t)
	if err := mem.Remove(appBundlePath + "/Contents/Info.plist"); err != nil {
		t.Fatal(err)
	}
	err := orch.CleanupOrphanedTools(context.Background(), nil, declProjectConfig())
	if !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("lost inspection error: %v", err)
	}
	if rec, _ := orch.reg.GetToolInstallation(context.Background(), "app"); rec == nil {
		t.Fatal("lost unreadable receipt")
	}
}

func appBundleExec(orch *Orchestrator, query string) (sql.Result, error) {
	var result sql.Result
	err := orch.reg.WithTx(context.Background(), func(tx *sql.Tx) error { var err error; result, err = tx.Exec(query); return err })
	return result, err
}

func assertNoRecordedRemoval(t *testing.T, orch *Orchestrator, tool, path string) {
	t.Helper()
	ops, err := orch.reg.GetFileOperations(context.Background(), registry.FileOperationFilter{ToolName: tool, FilePath: path, OperationType: "rm"})
	if err != nil || len(ops) != 0 {
		t.Fatalf("unexpected removal history: %+v, %v", ops, err)
	}
}

func TestAppBundleRemovalCommitFailure(t *testing.T) {
	for _, kind := range []string{"main", "sibling", "replacement"} {
		t.Run(kind, func(t *testing.T) {
			orch, mem, runner, _ := appBundleFixture(t)
			database, err := db.NewConnection(context.Background(), ":memory:")
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { _ = database.Close() })
			database.SetMaxOpenConns(1)
			for _, query := range []string{
				"PRAGMA foreign_keys=ON",
				"CREATE TABLE commit_parent(id INTEGER PRIMARY KEY)",
				"CREATE TABLE commit_failure(id INTEGER REFERENCES commit_parent(id) DEFERRABLE INITIALLY DEFERRED)",
			} {
				if _, err := database.Exec(query); err != nil {
					t.Fatal(err)
				}
			}
			orch.reg = registry.NewRegistry(database)
			appBundleSeed(t, orch, mem, "app", appBundlePath)
			path := appBundlePath
			if kind == "sibling" {
				path = "/Applications/.dotfiles-old-Recorded App.app"
				writeDecl(t, mem, path+"/leftover", "old")
			}
			if _, err := database.Exec("CREATE TRIGGER fail_bundle_commit AFTER INSERT ON file_operations WHEN NEW.operation_type='rm' AND NEW.file_path='" + path + "' BEGIN INSERT INTO commit_failure VALUES(1); END"); err != nil {
				t.Fatal(err)
			}
			err = orch.CleanupOrphanedTools(context.Background(), nil, declProjectConfig())
			if err == nil || !strings.Contains(err.Error(), "FOREIGN KEY") {
				t.Fatalf("expected commit failure: %v", err)
			}
			assertGone(t, mem, path)
			rec, err := orch.reg.GetToolInstallation(context.Background(), "app")
			if err != nil || rec == nil || rec.AppBundlePendingRemoval == nil || *rec.AppBundlePendingRemoval != path {
				t.Fatalf("lost pending deletion: %+v, %v", rec, err)
			}
			assertNoRecordedRemoval(t, orch, "app", path)
			if _, err := database.Exec("DROP TRIGGER fail_bundle_commit"); err != nil {
				t.Fatal(err)
			}
			if kind == "replacement" {
				writeDecl(t, mem, appBundlePath+"/Contents/Info.plist", "replacement")
				runner.Register("plutil", []byte("unrelated.replacement"), nil)
				if err := orch.CleanupOrphanedTools(context.Background(), nil, declProjectConfig()); err == nil || !strings.Contains(err.Error(), "pending removal") {
					t.Fatalf("replacement did not preserve pending receipt: %v", err)
				}
				if readDecl(t, mem, appBundlePath+"/Contents/Info.plist") != "replacement" {
					t.Fatal("deleted replacement")
				}
				if err := mem.RemoveAll(appBundlePath); err != nil {
					t.Fatal(err)
				}
			}
			if err := orch.CleanupOrphanedTools(context.Background(), nil, declProjectConfig()); err != nil {
				t.Fatal(err)
			}
			assertRemovalRecorded(t, orch, "app", path)
			ops, err := orch.reg.GetFileOperations(context.Background(), registry.FileOperationFilter{ToolName: "app", FilePath: path, OperationType: "rm"})
			if err != nil || len(ops) != 1 {
				t.Fatalf("duplicate rm history: %+v, %v", ops, err)
			}
			assertForgotten(t, orch, "app")
		})
	}
}

func TestAppBundleRemovalRejectsMaliciousPendingPath(t *testing.T) {
	orch, mem, runner, _ := appBundleFixture(t)
	writeDecl(t, mem, "/outside/owned", "untouched")
	if _, err := appBundleExec(orch, "UPDATE tool_installations SET app_bundle_pending_removal='/outside'"); err != nil {
		t.Fatal(err)
	}
	err := orch.CleanupOrphanedTools(context.Background(), nil, declProjectConfig())
	if err == nil || !strings.Contains(err.Error(), "invalid pending app bundle removal") {
		t.Fatalf("unsafe pending path accepted: %v", err)
	}
	if readDecl(t, mem, "/outside/owned") != "untouched" {
		t.Fatal("outside content changed")
	}
	if len(runner.History) != 0 {
		t.Fatal("queried a bundle before rejecting unsafe pending path")
	}
	if rec, _ := orch.reg.GetToolInstallation(context.Background(), "app"); rec == nil {
		t.Fatal("lost receipt")
	}
}

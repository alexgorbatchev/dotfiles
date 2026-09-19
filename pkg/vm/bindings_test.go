package vm

import (
	"bytes"
	"os"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/dop251/goja"
)

func TestBindingsDirect(t *testing.T) {
	vm := goja.New()
	err := RegisterBindings(vm, Target{})
	if err != nil {
		t.Fatalf("RegisterBindings failed: %v", err)
	}

	// Call all bindings
	testScript := `
		var osName = getOS();
		var archName = getArch();
		var envVal = getenv("PATH");
		var mac = isMac();
		var linux = isLinux();
		var win = isWindows();
		var libc = detectLibc();
	`
	_, err = vm.RunString(testScript)
	if err != nil {
		t.Fatalf("executing bindings failed: %v", err)
	}

	// RegisterContextBindings with nil log and nil fsys
	err = RegisterContextBindings(vm, nil, nil, "")
	if err != nil {
		t.Fatalf("RegisterContextBindings with nil failed: %v", err)
	}

	// Logging tolerates a VM wired without a logger: a message nobody collects is not
	// a failure of the tool that wrote it.
	testScriptCtx := `
		logInfo("t", "msg");
		logWarn("t", "msg");
		logError("t", "msg");
		logDebug("t", "msg");
	`
	_, err = vm.RunString(testScriptCtx)
	if err != nil {
		t.Fatalf("executing context bindings with nil failed: %v", err)
	}

	// No file system operation does: an operation that cannot happen must say so
	// rather than report success or a made-up answer, which is how hook failures used
	// to disappear. That includes the reads, whose made-up answers -- false, "" and an
	// empty list -- are exactly what a caller inspecting a real empty tree would see.
	for _, operation := range []string{
		`fsExists("/p");`,
		`fsReadDir("/p");`,
		`fsReadFile("/p");`,
		`fsWriteFile("/p", "c");`,
		`fsMkdir("/p");`,
		`fsRm("/p");`,
		`fsRename("/p", "/q");`,
		`fsSymlink("/p", "/q");`,
		`fsChmod("/p", 493);`,
		`fsCopyFile("/p", "/q");`,
		`fsRmdir("/p");`,
		`fsReadlink("/p");`,
		`fsStat("/p");`,
		`fsLstat("/p");`,
	} {
		if _, err := vm.RunString(operation); err == nil {
			t.Errorf("%s silently succeeded without a file system", operation)
		}
	}
}

// getHostname and getHomeDir answer for the machine and for the project. An empty
// configured home falls back to the invoking user's, which is what defineConfig sees
// while it is still deciding where the project's home should be.
func TestHomeDirAndHostnameBindings(t *testing.T) {
	configuredHome := t.TempDir()

	for _, tt := range []struct {
		name       string
		configured string
		want       string
	}{
		{name: "the configured home wins", configured: configuredHome, want: configuredHome},
		{name: "an unset home falls back to the user's", configured: "", want: userHomeDir(t)},
	} {
		t.Run(tt.name, func(t *testing.T) {
			vm := goja.New()
			if err := RegisterBindings(vm, Target{}); err != nil {
				t.Fatalf("RegisterBindings failed: %v", err)
			}
			if err := RegisterContextBindings(vm, nil, nil, tt.configured); err != nil {
				t.Fatalf("RegisterContextBindings failed: %v", err)
			}

			got, err := vm.RunString(`getHomeDir()`)
			if err != nil {
				t.Fatalf("getHomeDir failed: %v", err)
			}
			if got.String() != tt.want {
				t.Errorf("getHomeDir() = %q, want %q", got.String(), tt.want)
			}

			name, err := vm.RunString(`getHostname()`)
			if err != nil {
				t.Fatalf("getHostname failed: %v", err)
			}
			if name.String() != hostname() {
				t.Errorf("getHostname() = %q, want %q", name.String(), hostname())
			}
		})
	}
}

func userHomeDir(t *testing.T) string {
	t.Helper()
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatalf("reading the user's home directory: %v", err)
	}
	return home
}

func TestRegisterContextBindingsWithLogger(t *testing.T) {
	var logBuf bytes.Buffer
	log := logger.New(logger.Config{
		Name:   "test-logger-direct",
		Level:  logger.LogLevelVerbose,
		Writer: &logBuf,
	})

	vm := goja.New()
	err := RegisterContextBindings(vm, log, nil, "")
	if err != nil {
		t.Fatalf("RegisterContextBindings failed: %v", err)
	}

	script := `
		logInfo("toolA", "info msg");
		logWarn("toolA", "warn msg");
		logError("toolA", "error msg");
		logDebug("toolA", "debug msg");
	`
	_, err = vm.RunString(script)
	if err != nil {
		t.Fatalf("executing direct log bindings failed: %v", err)
	}

	out := logBuf.String()
	if !strings.Contains(out, "info msg") || !strings.Contains(out, "warn msg") || !strings.Contains(out, "error msg") || !strings.Contains(out, "debug msg") {
		t.Errorf("expected log output to contain all direct log messages, got %q", out)
	}
}

func TestContextBindingsFileSystemOperations(t *testing.T) {
	memFS := fs.NewMemFS()
	vm := goja.New()
	if err := RegisterContextBindings(vm, nil, memFS, ""); err != nil {
		t.Fatalf("RegisterContextBindings failed: %v", err)
	}

	script := `
		fsWriteFile("/src.txt", "content");
		fsCopyFile("/src.txt", "/dst.txt");
		fsRename("/dst.txt", "/renamed.txt");
		fsSymlink("/src.txt", "/link.txt");
		fsMkdir("/dir");
		fsRmdir("/dir");
	`
	if _, err := vm.RunString(script); err != nil {
		t.Fatalf("executing FS bindings failed: %v", err)
	}

	if exists, _ := memFS.Exists("/renamed.txt"); !exists {
		t.Errorf("expected /renamed.txt to exist")
	}

	if _, err := vm.RunString(`fsRmdir("/src.txt")`); err == nil {
		t.Errorf("expected fsRmdir on a file to fail")
	}
}

func TestBitmaskValueErrors(t *testing.T) {
	vm := goja.New()
	if _, err := bitmaskValue(nil, "test", 10); err == nil {
		t.Errorf("expected error for nil bitmaskValue")
	}
	if _, err := bitmaskValue(vm.ToValue(-1), "test", 10); err == nil {
		t.Errorf("expected error for negative bitmaskValue")
	}
	if _, err := bitmaskValue(vm.ToValue(100), "test", 10); err == nil {
		t.Errorf("expected error for exceeding max bitmaskValue")
	}
}

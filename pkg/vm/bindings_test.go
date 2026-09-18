package vm

import (
	"bytes"
	"os"
	"strings"
	"testing"

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

	// Reads tolerate a VM wired without a logger or file system: they answer "nothing
	// is there", which is what a caller inspecting an absent tree should see.
	testScriptCtx := `
		logInfo("t", "msg");
		logWarn("t", "msg");
		logError("t", "msg");
		logDebug("t", "msg");

		var e = fsExists("/p");
		var rd = fsReadDir("/p");
		var rf = fsReadFile("/p");
	`
	_, err = vm.RunString(testScriptCtx)
	if err != nil {
		t.Fatalf("executing context bindings with nil failed: %v", err)
	}

	// Writes do not, and neither does inspecting a path: an operation that cannot
	// happen must say so rather than report success or a made-up answer, which is how
	// hook failures used to disappear.
	for _, operation := range []string{
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

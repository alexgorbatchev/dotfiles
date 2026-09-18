package vm

import (
	"bytes"
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

	// Writes do not. A mutation that cannot happen must say so rather than report
	// success, which is how hook failures used to disappear.
	for _, mutation := range []string{
		`fsWriteFile("/p", "c");`,
		`fsMkdir("/p");`,
		`fsRm("/p");`,
		`fsRename("/p", "/q");`,
		`fsSymlink("/p", "/q");`,
	} {
		if _, err := vm.RunString(mutation); err == nil {
			t.Errorf("%s silently succeeded without a file system", mutation)
		}
	}
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

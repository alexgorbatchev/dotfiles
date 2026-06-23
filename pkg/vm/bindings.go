package vm

import (
	"os"
	"runtime"

	"github.com/alexgorbatchev/dotfiles/pkg/arch"
	"github.com/grafana/sobek"
)

// RegisterBindings registers native Go utility functions and helper constants inside the Sobek runtime.
func RegisterBindings(vm *sobek.Runtime) error {
	bindings := map[string]any{
		"getOS":      arch.GetOS,
		"getArch":    arch.GetArch,
		"getenv":     os.Getenv,
		"fileExists": arch.FileExists,
		"isMac":      func() bool { return arch.GetOS() == arch.OSDarwin },
		"isLinux":    func() bool { return arch.GetOS() == arch.OSLinux },
		"isWindows":  func() bool { return runtime.GOOS == "windows" },
		"detectLibc": func() string { return arch.DetectLibc(arch.FileExists) },
	}

	for name, fn := range bindings {
		if err := vm.Set(name, fn); err != nil {
			return err
		}
	}

	return nil
}

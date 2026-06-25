package vm

import (
	"os"
	"runtime"

	"github.com/alexgorbatchev/dotfiles/pkg/arch"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
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

// RegisterContextBindings registers logging and filesystem bindings associated with the active execution environment.
func RegisterContextBindings(vm *sobek.Runtime, log *logger.Logger, fsys fs.FS) error {
	_ = vm.Set("logInfo", func(toolName, msg string) {
		if log != nil {
			log.WithName(toolName).Info(logger.Message(msg))
		}
	})
	_ = vm.Set("logWarn", func(toolName, msg string) {
		if log != nil {
			log.WithName(toolName).Warn(logger.Message(msg))
		}
	})
	_ = vm.Set("logError", func(toolName, msg string) {
		if log != nil {
			log.WithName(toolName).Error(logger.Message(msg))
		}
	})
	_ = vm.Set("logDebug", func(toolName, msg string) {
		if log != nil {
			log.WithName(toolName).Debug(logger.Message(msg))
		}
	})

	_ = vm.Set("fsExists", func(path string) bool {
		if fsys != nil {
			exists, _ := fsys.Exists(path)
			return exists
		}
		return false
	})
	_ = vm.Set("fsReadDir", func(path string) []string {
		if fsys != nil {
			entries, _ := fsys.ReadDir(path)
			return entries
		}
		return nil
	})
	_ = vm.Set("fsReadFile", func(path string) string {
		if fsys != nil {
			data, _ := fsys.ReadFile(path)
			return string(data)
		}
		return ""
	})

	return nil
}

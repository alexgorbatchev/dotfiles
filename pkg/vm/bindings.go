package vm

import (
	"fmt"
	"os"

	"github.com/alexgorbatchev/dotfiles/pkg/arch"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/dop251/goja"
)

// Target selects the OS and architecture that platform-dependent configuration is
// evaluated against. Empty fields fall back to the host, so the zero Target means
// "this machine". It backs the --platform and --arch flags.
type Target struct {
	OS   string
	Arch string
}

// os returns the OS this target evaluates against.
func (t Target) os() string {
	if t.OS != "" {
		return t.OS
	}
	return arch.GetOS()
}

// arch returns the architecture this target evaluates against.
func (t Target) arch() string {
	if t.Arch != "" {
		return t.Arch
	}
	return arch.GetArch()
}

// matchesTarget reports whether a .platform() or .arch() block applies to this target.
// A nil architectures means the block did not constrain the architecture.
//
// Unknown values are rejected rather than treated as "no constraint", because a
// misspelled member such as Architecture.Arm65 evaluates to undefined in JavaScript.
// Silently ignoring it would widen the block to every architecture and quietly apply
// the wrong configuration, which is far harder to diagnose than an error at load time.
func (t Target) matchesTarget(platforms goja.Value, architectures goja.Value) (bool, error) {
	platformValue, err := bitmaskValue(platforms, "platform", config.PlatformAll)
	if err != nil {
		return false, err
	}
	if !config.MatchesPlatform(platformValue, t.os()) {
		return false, nil
	}

	if architectures == nil || goja.IsUndefined(architectures) || goja.IsNull(architectures) {
		return true, nil
	}
	architectureValue, err := bitmaskValue(architectures, "architecture", config.ArchAll)
	if err != nil {
		return false, err
	}
	return config.MatchesArch(architectureValue, t.arch()), nil
}

func bitmaskValue(value goja.Value, kind string, max int) (int, error) {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return 0, fmt.Errorf("unknown %s value: expected one of the %s constants, got undefined (check for a misspelled member)", kind, kind)
	}
	number := value.ToInteger()
	if number < 0 || number > int64(max) {
		return 0, fmt.Errorf("unknown %s value %v: expected one of the %s constants", kind, value, kind)
	}
	return int(number), nil
}

// RegisterBindings registers native Go utility functions and helper constants inside the
// Goja runtime, resolving platform-dependent values against target.
func RegisterBindings(vm *goja.Runtime, target Target) error {
	_ = vm.Set("globalThis", vm.GlobalObject())
	bindings := map[string]any{
		"getOS":         target.os,
		"getArch":       target.arch,
		"matchesTarget": target.matchesTarget,
		"getenv":        os.Getenv,
		"fileExists":    arch.FileExists,
		"isMac":         func() bool { return target.os() == arch.OSDarwin },
		"isLinux":       func() bool { return target.os() == arch.OSLinux },
		"isWindows":     func() bool { return target.os() == "windows" },
		"detectLibc":    func() string { return arch.DetectLibc(arch.FileExists) },
	}

	for name, fn := range bindings {
		if err := vm.Set(name, fn); err != nil {
			return err
		}
	}

	return nil
}

// RegisterContextBindings registers logging and filesystem bindings associated with the active execution environment.
func RegisterContextBindings(vm *goja.Runtime, log *logger.Logger, fsys fs.FS) error {
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
	_ = vm.Set("fsWriteFile", func(path string, content string) {
		if fsys != nil {
			_ = fsys.WriteFile(path, []byte(content), 0644)
		}
	})
	_ = vm.Set("fsMkdir", func(path string) {
		if fsys != nil {
			_ = fsys.MkdirAll(path, 0755)
		}
	})
	_ = vm.Set("fsRm", func(path string) {
		if fsys != nil {
			_ = fsys.RemoveAll(path)
		}
	})

	return nil
}

package vm

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/arch"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/utils"
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
		"getHostname":   hostname,
	}

	for name, fn := range bindings {
		if err := vm.Set(name, fn); err != nil {
			return err
		}
	}

	return nil
}

// hostname reports the machine name a configuration can filter on. A machine that
// cannot name itself reports an empty string rather than failing the load: the name is
// one input among many, and a configuration that never mentions it must still evaluate.
func hostname() string {
	name, err := os.Hostname()
	if err != nil {
		return ""
	}
	return name
}

// RegisterContextBindings registers logging and filesystem bindings associated with the
// active execution environment.
//
// homeDir is the home directory the project is configured with, which a tool
// configuration may deliberately point somewhere other than the invoking user's own --
// a sandboxed home in a test project, for instance. Paths written with "~" resolve
// against it, so they land where the configuration says rather than where the process
// happens to be running. An empty homeDir leaves such paths untouched.
func RegisterContextBindings(vm *goja.Runtime, log *logger.Logger, fsys fs.FS, homeDir string) error {
	// The project configuration is what defines the home directory, so while that
	// configuration is itself being evaluated there is nothing to report but the
	// invoking user's own home -- which is the value a configuration typically derives
	// its `paths.homeDir` from in the first place.
	_ = vm.Set("getHomeDir", func() string {
		if homeDir != "" {
			return homeDir
		}
		userHome, err := os.UserHomeDir()
		if err != nil {
			return ""
		}
		return userHome
	})

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
	// The mutating operations report failure to the caller. A hook that cannot create
	// the directory it is about to write into has not succeeded, and discarding that
	// error leaves the tool half-configured with nothing said about it.
	_ = vm.Set("fsWriteFile", func(path string, content string) {
		throwOnFSError(vm, "writeFile", path, writeFileOrMissingFS(fsys, path, content))
	})
	_ = vm.Set("fsMkdir", func(path string) {
		throwOnFSError(vm, "mkdir", path, mkdirOrMissingFS(fsys, path))
	})
	_ = vm.Set("fsRm", func(path string) {
		throwOnFSError(vm, "rm", path, removeOrMissingFS(fsys, path))
	})
	_ = vm.Set("fsRename", func(from string, to string) {
		throwOnFSError(vm, "rename", from, renameOrMissingFS(fsys, from, to))
	})
	_ = vm.Set("fsSymlink", func(target string, linkPath string) {
		throwOnFSError(vm, "symlink", linkPath, symlinkOrMissingFS(fsys, target, linkPath))
	})

	// Resolving a glob belongs in Go, where the file system is. A pattern is required
	// to identify exactly one path: matching nothing, or matching several, means the
	// configuration is ambiguous about which file it meant, and guessing would install
	// something arbitrary.
	_ = vm.Set("resolveGlob", func(pattern, baseDir string) string {
		search := utils.ExpandHomePath(homeDir, pattern)
		if !filepath.IsAbs(search) && baseDir != "" {
			search = filepath.Join(baseDir, search)
		}
		matches, err := filepath.Glob(search)
		if err != nil {
			panic(vm.ToValue(fmt.Sprintf("invalid pattern %q: %v", pattern, err)))
		}
		switch len(matches) {
		case 0:
			panic(vm.ToValue(fmt.Sprintf("No matches found for pattern: %s", pattern)))
		case 1:
			return matches[0]
		default:
			sort.Strings(matches)
			panic(vm.ToValue(fmt.Sprintf(
				"Pattern %q matched %d paths (expected exactly 1): %s",
				pattern, len(matches), strings.Join(matches, ", "),
			)))
		}
	})

	// The pattern arrives already split into source and flags because a JavaScript
	// RegExp cannot be handed to Go intact, and the matching itself belongs in Go.
	_ = vm.Set("replaceInFile", func(
		toolName, path, patternSource, patternFlags string,
		literal bool,
		replacement goja.Value,
		mode, errorMessage string,
	) bool {
		pattern, err := compileReplacePattern(patternSource, patternFlags, literal)
		if err != nil {
			panic(vm.ToValue(err.Error()))
		}
		changed, err := runReplaceInFile(vm, fsys, log, toolName, replaceRequest{
			Path:         utils.ExpandHomePath(homeDir, path),
			Pattern:      pattern,
			PatternLabel: patternSource,
			Replacement:  replacement,
			Mode:         replaceMode(mode),
			ErrorMessage: errorMessage,
		})
		if err != nil {
			panic(vm.ToValue(err.Error()))
		}
		return changed
	})

	return nil
}

// errNoFileSystem reports a VM configured without a file system, which is a wiring
// mistake rather than something a tool author can act on.
var errNoFileSystem = fmt.Errorf("no file system is available to this VM")

func writeFileOrMissingFS(fsys fs.FS, path, content string) error {
	if fsys == nil {
		return errNoFileSystem
	}
	return fsys.WriteFile(path, []byte(content), 0644)
}

func mkdirOrMissingFS(fsys fs.FS, path string) error {
	if fsys == nil {
		return errNoFileSystem
	}
	return fsys.MkdirAll(path, 0755)
}

func removeOrMissingFS(fsys fs.FS, path string) error {
	if fsys == nil {
		return errNoFileSystem
	}
	return fsys.RemoveAll(path)
}

func renameOrMissingFS(fsys fs.FS, from, to string) error {
	if fsys == nil {
		return errNoFileSystem
	}
	return fsys.Rename(from, to)
}

func symlinkOrMissingFS(fsys fs.FS, target, linkPath string) error {
	if fsys == nil {
		return errNoFileSystem
	}
	return fsys.Symlink(target, linkPath)
}

// throwOnFSError surfaces a failed file system call as a JavaScript exception, so an
// await inside a hook rejects and the installation reports which operation failed.
func throwOnFSError(vm *goja.Runtime, op, path string, err error) {
	if err == nil {
		return
	}
	panic(vm.ToValue(fmt.Sprintf("file system %s failed for %q: %v", op, path, err)))
}

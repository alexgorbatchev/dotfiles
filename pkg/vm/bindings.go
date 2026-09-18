package vm

import (
	"fmt"
	"maps"
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

// Target selects the OS, architecture and C library that platform-dependent
// configuration is evaluated against. Empty fields fall back to the host, so the zero
// Target means "this machine". It backs the --platform, --arch and --libc flags.
type Target struct {
	OS   string
	Arch string
	Libc string
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

// libc returns the C library this target evaluates against. Detection inspects the
// running machine's dynamic loaders, which say nothing about a target the caller named,
// so an override replaces detection rather than being reconciled with it.
//
// Which C library a target uses is a question only Linux answers, so the platform this
// target resolves to decides it before the flag does: a macOS or Windows target reports
// LibcUnknown however the host is built and whatever --libc named. v1 resolved it the
// same way (packages/cli/src/runtime/createBaseRuntimeContext.ts:59-68).
func (t Target) libc() string {
	if t.os() != arch.OSLinux {
		return arch.LibcUnknown
	}
	if t.Libc != "" {
		return t.Libc
	}
	return arch.DetectLibc(arch.FileExists)
}

// Resolve returns this target with every field named explicitly: what was left empty is
// filled in from the host, and the C library follows the resolved platform. A resolved
// target is what the command layer builds once from --platform/--arch/--libc and hands
// to configuration loading, to the installers and to the lifecycle hooks, so that one
// target governs the whole run.
func (t Target) Resolve() Target {
	return Target{OS: t.os(), Arch: t.arch(), Libc: t.libc()}
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

// libcConstants is the Libc enum of the authoring DSL: the member names dsl-types.ts
// declares, bound to the values pkg/arch detection reports. loader-api.ts installs it as
// the Libc global, so the value an author compares against and the value the runtime
// puts in systemInfo.libc are the same constant and cannot drift apart.
var libcConstants = map[string]string{
	"Unknown": arch.LibcUnknown,
	"Gnu":     arch.LibcGnu,
	"Musl":    arch.LibcMusl,
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
		"detectLibc":    target.libc,
		"libcConstants": func() map[string]string { return maps.Clone(libcConstants) },
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

	// exists answers whether a path is there, so an absent path is its answer rather
	// than a failure. It still reports a lookup it could not make at all -- an
	// unreadable parent directory, a VM with no file system -- because answering
	// "not there" would be a guess.
	_ = vm.Set("fsExists", func(path string) bool {
		exists, err := existsOrMissingFS(fsys, path)
		throwOnFSError(vm, "exists", path, err)
		return exists
	})
	// The reads report a path that is not there, the same as every other operation.
	// Resolving a missing file to "" and a missing directory to [] handed the caller a
	// made-up answer indistinguishable from an empty file and an empty directory, so a
	// configuration that read the wrong path carried on and produced the wrong result.
	_ = vm.Set("fsReadDir", func(path string) []string {
		entries, err := readDirOrMissingFS(fsys, path)
		throwOnFSError(vm, "readdir", path, err)
		return entries
	})
	_ = vm.Set("fsReadFile", func(path string) string {
		data, err := readFileOrMissingFS(fsys, path)
		throwOnFSError(vm, "readFile", path, err)
		return string(data)
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
	_ = vm.Set("fsChmod", func(path string, mode int) {
		throwOnFSError(vm, "chmod", path, chmodOrMissingFS(fsys, path, os.FileMode(mode)))
	})
	_ = vm.Set("fsCopyFile", func(source string, destination string) {
		throwOnFSError(vm, "copyFile", source, copyFileOrMissingFS(fsys, source, destination))
	})
	// rmdir removes a directory and refuses anything else, which is what separates it
	// from rm: rm takes the whole tree with it, rmdir only retires a directory the
	// caller believes is already empty.
	_ = vm.Set("fsRmdir", func(path string) {
		throwOnFSError(vm, "rmdir", path, rmdirOrMissingFS(fsys, path))
	})
	_ = vm.Set("fsReadlink", func(path string) string {
		if fsys == nil {
			throwOnFSError(vm, "readlink", path, errNoFileSystem)
		}
		target, err := fsys.Readlink(path)
		throwOnFSError(vm, "readlink", path, err)
		return target
	})

	// stat follows a symbolic link to what it points at; lstat describes the link
	// itself. Both report a missing path as an error rather than as a zeroed record,
	// which a hook would read as "an empty file that is there".
	_ = vm.Set("fsStat", func(path string) goja.Value {
		return fileStats(vm, fsys, "stat", path, statOrMissingFS)
	})
	_ = vm.Set("fsLstat", func(path string) goja.Value {
		return fileStats(vm, fsys, "lstat", path, lstatOrMissingFS)
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

func existsOrMissingFS(fsys fs.FS, path string) (bool, error) {
	if fsys == nil {
		return false, errNoFileSystem
	}
	return fsys.Exists(path)
}

func readDirOrMissingFS(fsys fs.FS, path string) ([]string, error) {
	if fsys == nil {
		return nil, errNoFileSystem
	}
	return fsys.ReadDir(path)
}

func readFileOrMissingFS(fsys fs.FS, path string) ([]byte, error) {
	if fsys == nil {
		return nil, errNoFileSystem
	}
	return fsys.ReadFile(path)
}

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

func chmodOrMissingFS(fsys fs.FS, path string, mode os.FileMode) error {
	if fsys == nil {
		return errNoFileSystem
	}
	return fsys.Chmod(path, mode)
}

func copyFileOrMissingFS(fsys fs.FS, source, destination string) error {
	if fsys == nil {
		return errNoFileSystem
	}
	return fsys.CopyFile(source, destination)
}

// rmdirOrMissingFS retires an empty directory. The type is checked first because
// fs.Remove would happily delete a file, and a call named rmdir that removes a file is
// doing something the author did not ask for.
func rmdirOrMissingFS(fsys fs.FS, path string) error {
	if fsys == nil {
		return errNoFileSystem
	}
	info, err := fsys.Lstat(path)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return fmt.Errorf("%q is not a directory", path)
	}
	return fsys.Remove(path)
}

func statOrMissingFS(fsys fs.FS, path string) (os.FileInfo, error) {
	if fsys == nil {
		return nil, errNoFileSystem
	}
	return fsys.Stat(path)
}

func lstatOrMissingFS(fsys fs.FS, path string) (os.FileInfo, error) {
	if fsys == nil {
		return nil, errNoFileSystem
	}
	return fsys.Lstat(path)
}

// fileStats describes a path for a hook.
//
// mode carries the permission bits alone. Go encodes the file type in the high bits of
// os.FileMode with values of its own, which are not the POSIX st_mode constants a
// configuration author would compare against, so the type is reported through the
// three booleans instead and mode stays the number chmod takes.
func fileStats(
	vm *goja.Runtime,
	fsys fs.FS,
	op string,
	path string,
	describe func(fs.FS, string) (os.FileInfo, error),
) goja.Value {
	info, err := describe(fsys, path)
	throwOnFSError(vm, op, path, err)

	stats := vm.NewObject()
	_ = stats.Set("isFile", info.Mode().IsRegular())
	_ = stats.Set("isDirectory", info.IsDir())
	_ = stats.Set("isSymbolicLink", info.Mode()&os.ModeSymlink != 0)
	_ = stats.Set("mode", int(info.Mode().Perm()))
	_ = stats.Set("size", info.Size())
	return stats
}

// throwOnFSError surfaces a failed file system call as a JavaScript exception, so an
// await inside a hook rejects and the installation reports which operation failed.
func throwOnFSError(vm *goja.Runtime, op, path string, err error) {
	if err == nil {
		return
	}
	panic(vm.ToValue(fmt.Sprintf("file system %s failed for %q: %v", op, path, err)))
}

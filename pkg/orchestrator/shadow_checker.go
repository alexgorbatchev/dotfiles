package orchestrator

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/alexgorbatchev/dotfiles/pkg/shim"
	"github.com/alexgorbatchev/dotfiles/pkg/utils"
)

// ShadowWarning represents a detected conflict where a dotfiles artifact
// (binary shim, alias, or function) shadows an external command or shell builtin.
type ShadowWarning struct {
	ToolName string
	Message  string
}

// ShadowChecker performs shadow checking for tool binaries, aliases, and functions
// against external system commands on PATH and shell builtins for zsh, bash, and powershell.
type ShadowChecker struct {
	fs         fs.FS
	customPath *string
	reg        *registry.Registry
}

// NewShadowChecker creates a new ShadowChecker instance.
func NewShadowChecker(fsys fs.FS, reg *registry.Registry) *ShadowChecker {
	return &ShadowChecker{
		fs:  fsys,
		reg: reg,
	}
}

// SetPath allows injecting a custom PATH string (primarily for unit tests).
func (sc *ShadowChecker) SetPath(path string) {
	sc.customPath = &path
}

var zshBuiltins = map[string]struct{}{
	".":             {},
	":":             {},
	"[":             {},
	"alias":         {},
	"autoload":      {},
	"bg":            {},
	"bindkey":       {},
	"break":         {},
	"builtin":       {},
	"bye":           {},
	"cap":           {},
	"cd":            {},
	"chdir":         {},
	"clone":         {},
	"command":       {},
	"comparguments": {},
	"compcall":      {},
	"compctl":       {},
	"compdescribe":  {},
	"compfiles":     {},
	"compgroups":    {},
	"compquote":     {},
	"comptags":      {},
	"comptry":       {},
	"compvalues":    {},
	"continue":      {},
	"declare":       {},
	"dirs":          {},
	"disable":       {},
	"disown":        {},
	"echo":          {},
	"echotc":        {},
	"echoti":        {},
	"emulate":       {},
	"enable":        {},
	"eval":          {},
	"exec":          {},
	"exit":          {},
	"export":        {},
	"false":         {},
	"fc":            {},
	"fg":            {},
	"float":         {},
	"functions":     {},
	"getcap":        {},
	"getln":         {},
	"getopts":       {},
	"hash":          {},
	"history":       {},
	"integer":       {},
	"jobs":          {},
	"kill":          {},
	"let":           {},
	"limit":         {},
	"local":         {},
	"log":           {},
	"logout":        {},
	"noglob":        {},
	"popd":          {},
	"print":         {},
	"printf":        {},
	"pushd":         {},
	"pushln":        {},
	"pwd":           {},
	"r":             {},
	"read":          {},
	"readonly":      {},
	"rehash":        {},
	"return":        {},
	"sched":         {},
	"set":           {},
	"setcap":        {},
	"setopt":        {},
	"shift":         {},
	"source":        {},
	"stat":          {},
	"suspend":       {},
	"test":          {},
	"times":         {},
	"trap":          {},
	"true":          {},
	"type":          {},
	"typeset":       {},
	"ulimit":        {},
	"umask":         {},
	"unalias":       {},
	"unfunction":    {},
	"unhash":        {},
	"unlimit":       {},
	"unset":         {},
	"unsetopt":      {},
	"vared":         {},
	"wait":          {},
	"whence":        {},
	"where":         {},
	"which":         {},
	"zcompile":      {},
	"zformat":       {},
	"zftp":          {},
	"zle":           {},
	"zmodload":      {},
	"zparseopts":    {},
	"zpty":          {},
	"zregexparse":   {},
	"zsocket":       {},
	"zstyle":        {},
}

var bashBuiltins = map[string]struct{}{
	".":         {},
	":":         {},
	"[":         {},
	"alias":     {},
	"bg":        {},
	"bind":      {},
	"break":     {},
	"builtin":   {},
	"caller":    {},
	"cd":        {},
	"command":   {},
	"compgen":   {},
	"complete":  {},
	"compopt":   {},
	"continue":  {},
	"declare":   {},
	"dirs":      {},
	"disown":    {},
	"echo":      {},
	"enable":    {},
	"eval":      {},
	"exec":      {},
	"exit":      {},
	"export":    {},
	"false":     {},
	"fc":        {},
	"fg":        {},
	"getopts":   {},
	"hash":      {},
	"help":      {},
	"history":   {},
	"jobs":      {},
	"kill":      {},
	"let":       {},
	"local":     {},
	"logout":    {},
	"mapfile":   {},
	"popd":      {},
	"printf":    {},
	"pushd":     {},
	"pwd":       {},
	"read":      {},
	"readarray": {},
	"readonly":  {},
	"return":    {},
	"set":       {},
	"shift":     {},
	"shopt":     {},
	"source":    {},
	"suspend":   {},
	"test":      {},
	"times":     {},
	"trap":      {},
	"true":      {},
	"type":      {},
	"typeset":   {},
	"ulimit":    {},
	"umask":     {},
	"unalias":   {},
	"unset":     {},
	"wait":      {},
}

var powershellBuiltins = map[string]struct{}{
	"?":            {},
	"%":            {},
	"begin":        {},
	"break":        {},
	"catch":        {},
	"cd":           {},
	"chdir":        {},
	"class":        {},
	"clc":          {},
	"clear":        {},
	"clhy":         {},
	"cli":          {},
	"clp":          {},
	"cls":          {},
	"clv":          {},
	"cnsn":         {},
	"compare":      {},
	"continue":     {},
	"copy":         {},
	"cp":           {},
	"cpi":          {},
	"cpp":          {},
	"cvpa":         {},
	"data":         {},
	"dbp":          {},
	"del":          {},
	"diff":         {},
	"dir":          {},
	"dnsn":         {},
	"do":           {},
	"dynamicparam": {},
	"ebp":          {},
	"echo":         {},
	"else":         {},
	"elseif":       {},
	"end":          {},
	"enum":         {},
	"epal":         {},
	"epcsv":        {},
	"epsn":         {},
	"erase":        {},
	"etsn":         {},
	"exit":         {},
	"exsn":         {},
	"fc":           {},
	"fhx":          {},
	"filter":       {},
	"finally":      {},
	"fl":           {},
	"for":          {},
	"foreach":      {},
	"from":         {},
	"ft":           {},
	"function":     {},
	"fw":           {},
	"gal":          {},
	"gbp":          {},
	"gc":           {},
	"gcb":          {},
	"gci":          {},
	"gcm":          {},
	"gcs":          {},
	"gdr":          {},
	"gerr":         {},
	"ghy":          {},
	"gi":           {},
	"gin":          {},
	"gjb":          {},
	"gl":           {},
	"gm":           {},
	"gmo":          {},
	"gp":           {},
	"gps":          {},
	"gpv":          {},
	"group":        {},
	"gsn":          {},
	"gsv":          {},
	"gtz":          {},
	"gu":           {},
	"gv":           {},
	"gwmi":         {},
	"h":            {},
	"hidden":       {},
	"history":      {},
	"icm":          {},
	"iex":          {},
	"if":           {},
	"ihy":          {},
	"ii":           {},
	"in":           {},
	"inlinescript": {},
	"interface":    {},
	"ipal":         {},
	"ipcsv":        {},
	"ipmo":         {},
	"ipsn":         {},
	"irm":          {},
	"ise":          {},
	"iwmi":         {},
	"iwr":          {},
	"kill":         {},
	"lp":           {},
	"ls":           {},
	"man":          {},
	"md":           {},
	"measure":      {},
	"mi":           {},
	"mkdir":        {},
	"module":       {},
	"mount":        {},
	"move":         {},
	"mp":           {},
	"mv":           {},
	"nal":          {},
	"ndr":          {},
	"ni":           {},
	"nmo":          {},
	"nsn":          {},
	"nv":           {},
	"ogv":          {},
	"oh":           {},
	"parallel":     {},
	"param":        {},
	"popd":         {},
	"process":      {},
	"ps":           {},
	"pushd":        {},
	"pwd":          {},
	"r":            {},
	"rbp":          {},
	"rcjb":         {},
	"rcsn":         {},
	"rd":           {},
	"rdr":          {},
	"ren":          {},
	"return":       {},
	"ri":           {},
	"rjb":          {},
	"rm":           {},
	"rmdir":        {},
	"rmo":          {},
	"rni":          {},
	"rnp":          {},
	"rp":           {},
	"rsn":          {},
	"rv":           {},
	"rvpa":         {},
	"rwmi":         {},
	"sajb":         {},
	"sal":          {},
	"saps":         {},
	"sasv":         {},
	"sbp":          {},
	"sc":           {},
	"scb":          {},
	"select":       {},
	"sequence":     {},
	"set":          {},
	"shcm":         {},
	"si":           {},
	"sl":           {},
	"sleep":        {},
	"sls":          {},
	"sort":         {},
	"sp":           {},
	"spcsv":        {},
	"spps":         {},
	"spsv":         {},
	"start":        {},
	"static":       {},
	"sv":           {},
	"switch":       {},
	"swmi":         {},
	"tee":          {},
	"throw":        {},
	"trcm":         {},
	"trap":         {},
	"try":          {},
	"type":         {},
	"until":        {},
	"using":        {},
	"var":          {},
	"where":        {},
	"while":        {},
	"wjb":          {},
	"workflow":     {},
	"write":        {},
}

func isShellBuiltin(sh, name string) bool {
	switch sh {
	case "zsh":
		_, ok := zshBuiltins[name]
		return ok
	case "bash":
		_, ok := bashBuiltins[name]
		return ok
	case "powershell":
		_, ok := powershellBuiltins[strings.ToLower(name)]
		return ok
	default:
		return false
	}
}

// findExternalCommand checks for an executable with cmdName across PATH directories
// (and standard fallback locations), ignoring any directory inside .generated/ or targetDir.
func (sc *ShadowChecker) findExternalCommand(cmdName string, projCfg *config.ProjectConfig) (string, bool) {
	shimGen := shim.NewGenerator(sc.fs)

	var targetDirClean string
	var generatedDirClean string
	if projCfg != nil {
		if projCfg.Paths.TargetDir != "" {
			td := projCfg.Paths.TargetDir
			if strings.HasPrefix(td, "~") {
				td = utils.ExpandHomePath(projCfg.Paths.HomeDir, td)
			}
			if abs, err := sc.fs.Abs(td); err == nil {
				targetDirClean = abs
			} else {
				targetDirClean = td
			}
		}
		if projCfg.Paths.GeneratedDir != "" {
			gd := projCfg.Paths.GeneratedDir
			if strings.HasPrefix(gd, "~") {
				gd = utils.ExpandHomePath(projCfg.Paths.HomeDir, gd)
			}
			if abs, err := sc.fs.Abs(gd); err == nil {
				generatedDirClean = abs
			} else {
				generatedDirClean = gd
			}
		}
	}

	isIgnoredDir := func(dir string) bool {
		if dir == "" {
			return true
		}
		cleanDir := dir
		if strings.HasPrefix(cleanDir, "~") && projCfg != nil {
			cleanDir = utils.ExpandHomePath(projCfg.Paths.HomeDir, cleanDir)
		}
		if abs, err := sc.fs.Abs(cleanDir); err == nil {
			cleanDir = abs
		}
		if targetDirClean != "" && (cleanDir == targetDirClean || isWithin(targetDirClean, cleanDir)) {
			return true
		}
		if generatedDirClean != "" && (cleanDir == generatedDirClean || isWithin(generatedDirClean, cleanDir)) {
			return true
		}
		if strings.Contains(cleanDir, "/.generated/") || strings.HasSuffix(cleanDir, "/.generated") || strings.HasSuffix(cleanDir, "/.generated/bin") {
			return true
		}
		return false
	}

	checkCandidate := func(cand string) bool {
		exists, err := sc.fs.Exists(cand)
		if err != nil || !exists {
			return false
		}
		candDir := filepath.Dir(cand)
		if isIgnoredDir(candDir) {
			return false
		}
		if isShim, err := shimGen.IsGeneratedShim(cand); err == nil && isShim {
			return false
		}
		return true
	}

	var pathEnv string
	if sc.customPath != nil {
		pathEnv = *sc.customPath
	} else {
		pathEnv = os.Getenv("PATH")
	}

	searchedDirs := make(map[string]bool)

	if pathEnv != "" {
		dirs := filepath.SplitList(pathEnv)
		for _, dir := range dirs {
			if isIgnoredDir(dir) {
				continue
			}
			cleanDir := dir
			if strings.HasPrefix(cleanDir, "~") && projCfg != nil {
				cleanDir = utils.ExpandHomePath(projCfg.Paths.HomeDir, cleanDir)
			}
			if abs, err := sc.fs.Abs(cleanDir); err == nil {
				cleanDir = abs
			}
			searchedDirs[cleanDir] = true

			cand := filepath.Join(cleanDir, cmdName)
			if checkCandidate(cand) {
				return cand, true
			}
		}
	}

	// Standard fallback directories if not already searched in PATH
	fallbackDirs := []string{
		"/usr/bin",
		"/usr/local/bin",
		"/bin",
		"/opt/homebrew/bin",
	}
	for _, dir := range fallbackDirs {
		if isIgnoredDir(dir) {
			continue
		}
		cleanDir := dir
		if abs, err := sc.fs.Abs(cleanDir); err == nil {
			cleanDir = abs
		}
		if searchedDirs[cleanDir] {
			continue
		}
		cand := filepath.Join(cleanDir, cmdName)
		if checkCandidate(cand) {
			return cand, true
		}
	}

	return "", false
}

func (sc *ShadowChecker) isSameBinary(pathA, pathB string) bool {
	if pathA == "" || pathB == "" {
		return false
	}
	cleanA := filepath.Clean(pathA)
	cleanB := filepath.Clean(pathB)
	if cleanA == cleanB {
		return true
	}
	if absA, errA := sc.fs.Abs(cleanA); errA == nil {
		if absB, errB := sc.fs.Abs(cleanB); errB == nil && absA == absB {
			return true
		}
	}
	realA := evalSymlinks(sc.fs, cleanA)
	realB := evalSymlinks(sc.fs, cleanB)
	if realA == realB {
		return true
	}
	if fiA, errA := sc.fs.Stat(cleanA); errA == nil {
		if fiB, errB := sc.fs.Stat(cleanB); errB == nil {
			if os.SameFile(fiA, fiB) {
				return true
			}
		}
	}
	return false
}

func evalSymlinks(fsys fs.FS, path string) string {
	curr := filepath.Clean(path)
	for i := 0; i < 32; i++ {
		target, err := fsys.Readlink(curr)
		if err != nil {
			break
		}
		if !fsys.IsAbs(target) {
			target = filepath.Join(filepath.Dir(curr), target)
		}
		curr = filepath.Clean(target)
	}
	return curr
}

func parseShimMetadata(fsys fs.FS, shimPath string) (toolName string, binaryPath string, ok bool) {
	bytes, err := fsys.ReadFile(shimPath)
	if err != nil {
		return "", "", false
	}
	content := string(bytes)
	if !strings.Contains(content, "# Generated by Dotfiles Management Tool") {
		return "", "", false
	}
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "TOOL_NAME=\"") && strings.HasSuffix(line, "\"") {
			toolName = strings.TrimSuffix(strings.TrimPrefix(line, "TOOL_NAME=\""), "\"")
		} else if strings.HasPrefix(line, "TOOL_EXECUTABLE=\"") && strings.HasSuffix(line, "\"") {
			binaryPath = strings.TrimSuffix(strings.TrimPrefix(line, "TOOL_EXECUTABLE=\""), "\"")
		}
	}
	if toolName != "" && binaryPath != "" {
		return toolName, binaryPath, true
	}
	return "", "", false
}

func isHomebrewBin(path string) bool {
	clean := filepath.Clean(path)
	cleanDir := filepath.Dir(clean)
	homebrewPrefixes := []string{
		"/opt/homebrew/bin",
		"/opt/homebrew/sbin",
		"/usr/local/bin",
		"/usr/local/sbin",
		"/home/linuxbrew/.linuxbrew/bin",
		"/home/linuxbrew/.linuxbrew/sbin",
	}
	if prefix := os.Getenv("HOMEBREW_PREFIX"); prefix != "" {
		homebrewPrefixes = append(homebrewPrefixes, filepath.Join(prefix, "bin"), filepath.Join(prefix, "sbin"))
	}
	for _, p := range homebrewPrefixes {
		if cleanDir == p {
			return true
		}
	}
	if strings.HasPrefix(clean, "/opt/homebrew/opt/") || strings.HasPrefix(clean, "/usr/local/opt/") || strings.HasPrefix(clean, "/home/linuxbrew/.linuxbrew/opt/") {
		return true
	}
	if strings.HasPrefix(clean, "/opt/homebrew/Caskroom/") || strings.HasPrefix(clean, "/usr/local/Caskroom/") {
		return true
	}
	return false
}

func toolHasShellPath(tool *config.ToolConfig, extPath string, projCfg *config.ProjectConfig) bool {
	if tool == nil || tool.ShellConfigs == nil {
		return false
	}
	cleanExtDir := filepath.Dir(filepath.Clean(extPath))
	homeDir := ""
	if projCfg != nil {
		homeDir = projCfg.Paths.HomeDir
	}
	shells := []string{"zsh", "bash", "powershell"}
	for _, sh := range shells {
		stc := getShellTypeConfig(tool, sh)
		if stc == nil {
			continue
		}
		for _, raw := range stc.Paths {
			p, ok := raw.(string)
			if !ok {
				continue
			}
			expanded := p
			if strings.HasPrefix(expanded, "$HOME") && homeDir != "" {
				expanded = strings.Replace(expanded, "$HOME", homeDir, 1)
			} else if strings.HasPrefix(expanded, "~") && homeDir != "" {
				expanded = utils.ExpandHomePath(homeDir, expanded)
			}
			if filepath.Clean(expanded) == cleanExtDir {
				return true
			}
		}
	}
	return false
}

func (sc *ShadowChecker) resolveBinaryTarget(ctx context.Context, tool *config.ToolConfig, binName string, projCfg *config.ProjectConfig, extPath string) string {
	if tool.InstallationMethod == "manual" {
		// A binaryPath that cannot be resolved fails generate and install on its own;
		// here it only means there is no declared target to compare against.
		if manualPath, err := installer.ResolveBinaryPath(sc.fs, tool, projCfg); err == nil && manualPath != "" {
			return manualPath
		}
	}

	// 1. Check registry recorded installation paths
	if sc.reg != nil {
		if instRecord, err := sc.reg.GetToolInstallation(ctx, tool.Name); err == nil && instRecord != nil && instRecord.BinaryPaths != "" {
			var paths []string
			if err := json.Unmarshal([]byte(instRecord.BinaryPaths), &paths); err == nil {
				for _, p := range paths {
					if filepath.Base(p) == binName || p == binName {
						if sc.isSameBinary(p, extPath) {
							return extPath
						}
						if installer.IsRealBinaryPath(ctx, sc.fs, p) {
							return p
						}
					}
				}
			}
		}
	}

	// 2. Check current entrypoint in binariesDir
	if projCfg != nil && projCfg.Paths.BinariesDir != "" {
		currPath := filepath.Join(projCfg.Paths.BinariesDir, tool.Name, "current", binName)
		if exists, _ := sc.fs.Exists(currPath); exists {
			if sc.isSameBinary(currPath, extPath) {
				return extPath
			}
		}
	}

	// 3. Check existing generated shim at targetDir
	if projCfg != nil && projCfg.Paths.TargetDir != "" {
		shimPath := filepath.Join(projCfg.Paths.TargetDir, binName)
		if exists, _ := sc.fs.Exists(shimPath); exists {
			if shimToolName, shimExec, ok := parseShimMetadata(sc.fs, shimPath); ok {
				if shimToolName == tool.Name && shimExec != "" {
					if tool.InstallationMethod == "manual" || isExternallyManaged(tool.InstallationMethod) || toolHasShellPath(tool, shimExec, projCfg) {
						if sc.isSameBinary(shimExec, extPath) {
							return extPath
						}
					}
				}
			}
		}
	}

	// 4. Externally managed package manager targets
	if isExternallyManaged(tool.InstallationMethod) {
		if tool.InstallationMethod == "brew" && isHomebrewBin(extPath) {
			return extPath
		}
		if toolHasShellPath(tool, extPath, projCfg) {
			return extPath
		}
	}

	return ""
}

// CheckTool performs shadow checks on a single active tool configuration.
func (sc *ShadowChecker) CheckTool(ctx context.Context, tool *config.ToolConfig, projCfg *config.ProjectConfig) []ShadowWarning {
	if !tool.IsActive() {
		return nil
	}

	var warnings []ShadowWarning

	// 1. Check binaries declared for this tool that will have a PATH shim generated
	binNames := shimBinaries(tool)
	sort.Strings(binNames)
	for _, binName := range binNames {
		if extPath, found := sc.findExternalCommand(binName, projCfg); found {
			// Check intentional delegation exemption
			resolvedTarget := sc.resolveBinaryTarget(ctx, tool, binName, projCfg, extPath)
			if resolvedTarget != "" && sc.isSameBinary(resolvedTarget, extPath) {
				continue
			}
			if tool.InstallationMethod == "manual" {
				manualPath := getStringParam(tool.InstallParams, "binaryPath", "")
				if manualPath != "" && (sc.isSameBinary(manualPath, extPath) || manualPath == binName) {
					continue
				}
			}
			warnings = append(warnings, ShadowWarning{
				ToolName: tool.Name,
				Message:  fmt.Sprintf("Binary '%s' shadows '%s'", binName, extPath),
			})
		}
	}

	// 2. Check shell aliases and functions for zsh, bash, and powershell
	shells := []string{"zsh", "bash", "powershell"}
	for _, sh := range shells {
		stc := getShellTypeConfig(tool, sh)
		if stc == nil {
			continue
		}

		// Aliases
		if len(stc.Aliases) > 0 {
			aliasNames := make([]string, 0, len(stc.Aliases))
			for name := range stc.Aliases {
				aliasNames = append(aliasNames, name)
			}
			sort.Strings(aliasNames)

			for _, aliasName := range aliasNames {
				if isShellBuiltin(sh, aliasName) {
					warnings = append(warnings, ShadowWarning{
						ToolName: tool.Name,
						Message:  fmt.Sprintf("[%s] Alias %q shadows %s builtin %q", sh, aliasName, sh, aliasName),
					})
				} else if extPath, found := sc.findExternalCommand(aliasName, projCfg); found {
					warnings = append(warnings, ShadowWarning{
						ToolName: tool.Name,
						Message:  fmt.Sprintf("[%s] Alias %q shadows %s", sh, aliasName, extPath),
					})
				}
			}
		}

		// Functions
		if len(stc.Functions) > 0 {
			funcNames := make([]string, 0, len(stc.Functions))
			for name := range stc.Functions {
				funcNames = append(funcNames, name)
			}
			sort.Strings(funcNames)

			for _, funcName := range funcNames {
				if isShellBuiltin(sh, funcName) {
					warnings = append(warnings, ShadowWarning{
						ToolName: tool.Name,
						Message:  fmt.Sprintf("[%s] Function %q shadows %s builtin %q", sh, funcName, sh, funcName),
					})
				} else if extPath, found := sc.findExternalCommand(funcName, projCfg); found {
					warnings = append(warnings, ShadowWarning{
						ToolName: tool.Name,
						Message:  fmt.Sprintf("[%s] Function %q shadows %s", sh, funcName, extPath),
					})
				}
			}
		}
	}

	return warnings
}

// CheckTools performs shadow checks across all provided tool configurations.
func (sc *ShadowChecker) CheckTools(ctx context.Context, tools []*config.ToolConfig, projCfg *config.ProjectConfig) []ShadowWarning {
	var allWarnings []ShadowWarning
	for _, tool := range tools {
		if ctx.Err() != nil {
			break
		}
		warns := sc.CheckTool(ctx, tool, projCfg)
		allWarnings = append(allWarnings, warns...)
	}
	return allWarnings
}

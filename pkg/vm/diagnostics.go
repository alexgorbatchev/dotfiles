package vm

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/dop251/goja"
	"github.com/go-sourcemap/sourcemap"
)

// SourceLocation represents a mapped location in a source file.
type SourceLocation struct {
	File     string
	Line     int
	Column   int
	Function string
}

func (l SourceLocation) String() string {
	if l.File == "" {
		return ""
	}
	if l.Line <= 0 {
		return l.File
	}
	if l.Column <= 0 {
		return fmt.Sprintf("%s:%d", l.File, l.Line)
	}
	return fmt.Sprintf("%s:%d:%d", l.File, l.Line, l.Column)
}

// DiagnosticError represents a user-friendly error from VM evaluation,
// including the source file, line:column pointer, code frame, and actionable hints.
type DiagnosticError struct {
	OriginalErr error
	Message     string
	Location    SourceLocation
	Frame       string
	Hint        string
	Callee      string // e.g. "block"
	ToolPath    string // path to tool file if applicable
	ConfigPath  string // path to config file if applicable
}

func (e *DiagnosticError) Unwrap() error {
	return e.OriginalErr
}

func (e *DiagnosticError) Error() string {
	var sb strings.Builder

	// Primary context header
	switch {
	case e.ToolPath != "":
		displayPath := filepath.ToSlash(e.ToolPath)
		if e.Callee != "" {
			sb.WriteString(fmt.Sprintf("executing tool file %q at .%s():\n", displayPath, e.Callee))
		} else {
			sb.WriteString(fmt.Sprintf("executing tool file %q:\n", displayPath))
		}
	case e.ConfigPath != "":
		displayPath := filepath.ToSlash(e.ConfigPath)
		sb.WriteString(fmt.Sprintf("executing script in %q:\n", displayPath))
	default:
		if e.Location.File == "" || e.Location.Line <= 0 {
			cleanMsg := e.Message
			if cleanMsg == "" && e.OriginalErr != nil {
				cleanMsg = cleanErrorMessage(e.OriginalErr.Error())
			}
			return cleanMsg
		}
		sb.WriteString("executing script:\n")
	}

	// Location and message line
	cleanMsg := e.Message
	if cleanMsg == "" && e.OriginalErr != nil {
		cleanMsg = cleanErrorMessage(e.OriginalErr.Error())
	}

	if e.Location.File != "" && e.Location.Line > 0 {
		locStr := e.Location.String()
		sb.WriteString(fmt.Sprintf("  %s: %s", locStr, cleanMsg))
	} else {
		sb.WriteString(fmt.Sprintf("  %s", cleanMsg))
	}

	// Source code frame with pointer
	if e.Frame != "" {
		sb.WriteString("\n")
		sb.WriteString(e.Frame)
	}

	// Actionable hint
	if e.Hint != "" {
		sb.WriteString("\n\n  Hint: ")
		sb.WriteString(e.Hint)
	}

	return sb.String()
}

// FormatSourceFrame renders a multi-line source code frame with line numbers,
// a '>' marker for the target line, and a '^' pointer pointing to the column.
func FormatSourceFrame(content string, line, col int, highlightLen int) string {
	if content == "" || line < 1 {
		return ""
	}

	lines := strings.Split(content, "\n")
	if line > len(lines) {
		return ""
	}

	startLine := line - 2
	if startLine < 1 {
		startLine = 1
	}
	endLine := line + 2
	if endLine > len(lines) {
		endLine = len(lines)
	}

	padWidth := len(strconv.Itoa(endLine))
	if padWidth < 2 {
		padWidth = 2
	}

	var sb strings.Builder
	for i := startLine; i <= endLine; i++ {
		rawLine := lines[i-1]
		if i == line {
			sb.WriteString(fmt.Sprintf(" > %*d | %s\n", padWidth, i, rawLine))

			// Format pointer line
			indent := computePointerIndent(rawLine, col)
			ptrLen := highlightLen
			if ptrLen < 1 {
				ptrLen = 1
			}
			pointer := strings.Repeat("^", ptrLen)
			sb.WriteString(fmt.Sprintf("   %*s | %s%s", padWidth, "", indent, pointer))
			if i < endLine {
				sb.WriteString("\n")
			}
		} else {
			sb.WriteString(fmt.Sprintf("   %*d | %s", padWidth, i, rawLine))
			if i < endLine {
				sb.WriteString("\n")
			}
		}
	}

	return sb.String()
}

// computePointerIndent calculates the spacing for the pointer line to align with col,
// preserving tabs from rawLine so column alignment matches tab-stop expansion.
func computePointerIndent(rawLine string, col int) string {
	if col <= 1 {
		return ""
	}

	chars := []rune(rawLine)
	targetCol := col - 1
	if targetCol > len(chars) {
		targetCol = len(chars)
	}

	var sb strings.Builder
	for i := range targetCol {
		if chars[i] == '\t' {
			sb.WriteRune('\t')
		} else {
			sb.WriteRune(' ')
		}
	}
	return sb.String()
}

var (
	memberNotFoundRegex = regexp.MustCompile(`Object has no member '([^']+)'`)
	notAFunctionRegex   = regexp.MustCompile(`([^\s]+) is not a function`)
	cannotReadPropRegex = regexp.MustCompile(`Cannot read property '([^']+)' of (undefined|null)`)
	valueNotObjectRegex = regexp.MustCompile(`Value is not an object: (undefined|null)`)
	gojaEvalPosRegex    = regexp.MustCompile(`(?:<eval>|bundle\.js):(\d+):(\d+)`)
	genericPosRegex     = regexp.MustCompile(`:(\d+):(\d+)`)
)

var knownInstallMethods = []string{
	"bin", "symlink", "ensureDir", "block", "template", "hook",
	"shell", "zsh", "bash", "powershell", "dependsOn", "updateCheck",
	"platform", "disabled", "sudo", "hostname",
}

var knownShellMethods = []string{
	"alias", "aliases", "env", "path", "completions",
	"function", "functions", "source", "sourceFile", "eval",
}

var knownContextProps = []string{
	"systemInfo", "paths", "configFileDir", "currentToolName",
	"currentToolPath", "fs", "os", "arch",
}

var commonMethodTypos = map[string]string{
	"binaries":        ".bin()",
	"binary":          ".bin()",
	"symlinks":        ".symlink()",
	"directories":     ".ensureDir()",
	"ensureDirectory": ".ensureDir()",
	"directory":       ".ensureDir()",
	"mkdir":           ".ensureDir()",
	"templates":       ".template()",
	"blocks":          ".block()",
	"aliass":          ".alias() or .aliases()",
	"dependOn":        ".dependsOn()",
	"dependencies":    ".dependsOn()",
	"dependency":      ".dependsOn()",
	"update":          ".updateCheck()",
	"arch":            ".platform()",
	"sourceFiles":     ".sourceFile()",
	"sourcefile":      ".sourceFile()",
}

// DiagnosticHint returns an actionable suggestion for common configuration errors.
func DiagnosticHint(msg, member, file string) string {
	isConfigFile := strings.Contains(file, "dotfiles.config.")

	// 1. Check for "Object has no member 'xyz'"
	if member == "" {
		if m := memberNotFoundRegex.FindStringSubmatch(msg); len(m) >= 2 {
			member = m[1]
		}
	}

	if member != "" {
		// Check known typos first
		if suggestion, ok := commonMethodTypos[member]; ok {
			return fmt.Sprintf("Did you mean %s?", suggestion)
		}

		// Check if it's a known install method called in the wrong place
		if containsString(knownInstallMethods, member) {
			if isConfigFile {
				return fmt.Sprintf(".%s() is a tool builder method for .tool.ts files, not valid in dotfiles.config.ts.", member)
			}
			return fmt.Sprintf(".%s() is a method on the install(...) builder (e.g. install(\"method\", ...).%s(...)). It is not available on shell configurators, tool context (ctx), or project configuration.", member, member)
		}

		// Check if it's a known shell configurator method called on install builder
		if containsString(knownShellMethods, member) {
			return fmt.Sprintf(".%s() is a shell configurator method. Call it inside .zsh(shell => shell.%s(...)), .bash(...), or .shell(...), rather than directly on install(...).", member, member)
		}

		// Check if it's a context property
		if containsString(knownContextProps, member) {
			return fmt.Sprintf("%q is a property on tool context (ctx.%s), not a method on install(...) or shell.", member, member)
		}

		// Check Levenshtein distance against known methods
		if best := closestMatch(member, append(knownInstallMethods, knownShellMethods...)); best != "" {
			return fmt.Sprintf("Did you mean .%s()?", best)
		}
	}

	// 2. Check for "xyz is not a function"
	if m := notAFunctionRegex.FindStringSubmatch(msg); len(m) >= 2 {
		fnName := m[1]
		switch {
		case fnName == "install":
			return "\"install\" was accessed as a property instead of called as a function. Use install(\"<method>\", { ... }) to start configuring a tool."
		case strings.Contains(fnName, "paths"):
			return "\"paths\" is an object with path properties (e.g. ctx.paths.homeDir), not a callable function."
		case strings.Contains(fnName, "systemInfo"):
			return "\"systemInfo\" is an object with system properties (e.g. ctx.systemInfo.os), not a callable function."
		default:
			return fmt.Sprintf("%q is not a function. Check that preceding properties or imports return a callable function.", fnName)
		}
	}

	// 3. Check for cannot read property of undefined
	if m := cannotReadPropRegex.FindStringSubmatch(msg); len(m) >= 3 {
		propName := m[1]
		nullType := m[2]
		return fmt.Sprintf("Cannot access property %q on %s value. Check that preceding method calls or variables return a valid object.", propName, nullType)
	}

	// 4. Value is not an object: undefined
	if m := valueNotObjectRegex.FindStringSubmatch(msg); len(m) >= 2 {
		return fmt.Sprintf("Expected an object but got %s. Ensure all chained calls return a valid object.", m[1])
	}

	return ""
}

func containsString(slice []string, s string) bool {
	for _, v := range slice {
		if v == s {
			return true
		}
	}
	return false
}

func closestMatch(target string, candidates []string) string {
	bestCandidate := ""
	minDist := 3 // max allowed edit distance
	for _, candidate := range candidates {
		d := levenshteinDistance(strings.ToLower(target), strings.ToLower(candidate))
		if d < minDist {
			minDist = d
			bestCandidate = candidate
		}
	}
	return bestCandidate
}

func levenshteinDistance(s1, s2 string) int {
	r1, r2 := []rune(s1), []rune(s2)
	l1, l2 := len(r1), len(r2)
	if l1 == 0 {
		return l2
	}
	if l2 == 0 {
		return l1
	}

	prev := make([]int, l2+1)
	curr := make([]int, l2+1)
	for j := range l2 + 1 {
		prev[j] = j
	}

	for i := 1; i <= l1; i++ {
		curr[0] = i
		for j := 1; j <= l2; j++ {
			cost := 1
			if r1[i-1] == r2[j-1] {
				cost = 0
			}
			curr[j] = min(curr[j-1]+1, min(prev[j]+1, prev[j-1]+cost))
		}
		copy(prev, curr)
	}

	return curr[l2]
}

// cleanErrorMessage removes internal <eval>:... references and trailing stacks from Goja errors.
func cleanErrorMessage(raw string) string {
	cleaned := raw
	// Strip trailing "at <eval>:..." or "at /path:..."
	if idx := strings.Index(cleaned, " at <eval>:"); idx != -1 {
		cleaned = cleaned[:idx]
	} else if idx := strings.Index(cleaned, " at "); idx != -1 && strings.Contains(cleaned[idx:], ":") {
		cleaned = cleaned[:idx]
	}

	// Strip trailing newlines or stack traces
	if idx := strings.Index(cleaned, "\n"); idx != -1 {
		cleaned = cleaned[:idx]
	}

	return strings.TrimSpace(cleaned)
}

// ResolveSourceLocation maps a Goja runtime error and source map to the original source location.
func ResolveSourceLocation(sourceMap []byte, err error, baseDir string) SourceLocation {
	if len(sourceMap) == 0 || err == nil {
		return SourceLocation{}
	}

	consumer, parseErr := sourcemap.Parse("", sourceMap)
	if parseErr != nil {
		return SourceLocation{}
	}

	// First attempt: inspect Goja exception stack frames
	var exception *goja.Exception
	if errors.As(err, &exception) {
		frames := exception.Stack()
		var fallbackLocation SourceLocation
		for _, frame := range frames {
			pos := frame.Position()
			if pos.Line <= 0 {
				continue
			}
			srcFile, fnName, srcLine, srcCol, ok := consumer.Source(pos.Line, pos.Column)
			if !ok || srcLine <= 0 {
				continue
			}

			normalizedFile := normalizeSourcePath(srcFile, baseDir)
			loc := SourceLocation{
				File:     normalizedFile,
				Line:     srcLine,
				Column:   srcCol,
				Function: fnName,
			}

			if isUserSourceFile(normalizedFile) {
				return loc
			}
			if fallbackLocation.File == "" {
				fallbackLocation = loc
			}
		}
		if fallbackLocation.File != "" {
			return fallbackLocation
		}
	}

	// Second attempt: parse position regex from error text
	matches := gojaEvalPosRegex.FindStringSubmatch(err.Error())
	if len(matches) < 3 {
		matches = genericPosRegex.FindStringSubmatch(err.Error())
	}
	if len(matches) >= 3 {
		genLine, err1 := strconv.Atoi(matches[1])
		genCol, err2 := strconv.Atoi(matches[2])
		if err1 == nil && err2 == nil {
			srcFile, fnName, srcLine, srcCol, ok := consumer.Source(genLine, genCol)
			if ok && srcLine > 0 {
				return SourceLocation{
					File:     normalizeSourcePath(srcFile, baseDir),
					Line:     srcLine,
					Column:   srcCol,
					Function: fnName,
				}
			}
		}
	}

	return SourceLocation{}
}

func normalizeSourcePath(srcFile, baseDir string) string {
	if strings.HasPrefix(srcFile, "loader-api:") || srcFile == "loader-api.ts" {
		return srcFile
	}
	if !filepath.IsAbs(srcFile) && baseDir != "" {
		srcFile = filepath.Join(baseDir, srcFile)
	}
	return filepath.Clean(filepath.ToSlash(srcFile))
}

func isUserSourceFile(path string) bool {
	if strings.HasPrefix(path, "loader-api:") || path == "loader-api.ts" {
		return false
	}
	if strings.Contains(path, ".dotfiles-loader-entry-") || strings.HasSuffix(path, "entry.ts") {
		return false
	}
	return strings.HasSuffix(path, ".tool.ts") ||
		strings.HasSuffix(path, ".tool.js") ||
		strings.Contains(path, "dotfiles.config.") ||
		strings.HasSuffix(path, ".ts") ||
		strings.HasSuffix(path, ".js")
}

// readSourceFileContent reads file content via fsys if available, falling back to os.ReadFile.
func readSourceFileContent(fsys fs.FS, filePath string) (string, error) {
	if fsys != nil {
		if data, err := fsys.ReadFile(filePath); err == nil {
			return string(data), nil
		}
	}
	data, err := os.ReadFile(filePath)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// FormatVMFailure constructs a rich DiagnosticError from a VM execution failure.
func FormatVMFailure(vm *goja.Runtime, bundledJS string, sourceMap []byte, fsys fs.FS, baseDir, defaultFile string, err error) *DiagnosticError {
	if err == nil {
		return nil
	}

	cleanMsg := cleanErrorMessage(err.Error())
	callee := failingCallee(bundledJS, err)

	member := callee
	if member == "" {
		if m := memberNotFoundRegex.FindStringSubmatch(cleanMsg); len(m) >= 2 {
			member = m[1]
		}
	}
	if callee == "" && member != "" {
		callee = member
	}

	// Resolve source location via sourcemap
	loc := ResolveSourceLocation(sourceMap, err, baseDir)
	if loc.File == "" {
		toolPath := ""
		if vm != nil {
			toolPath = stringGlobal(vm, "currentToolPath")
		}
		if toolPath == "" {
			toolPath = defaultFile
		}
		if toolPath != "" {
			loc.File = toolPath
		}
	}

	// Read source content and generate source frame
	frame := ""
	if loc.File != "" && loc.Line > 0 && !strings.HasPrefix(loc.File, "loader-api:") {
		if content, readErr := readSourceFileContent(fsys, loc.File); readErr == nil {
			col := loc.Column
			highlightLen := 1
			lines := strings.Split(content, "\n")
			if loc.Line <= len(lines) {
				rawLine := lines[loc.Line-1]
				if member != "" {
					highlightLen = len(member)
					if idx := strings.Index(rawLine, "."+member); idx != -1 {
						col = idx + 2 // 1-based column of first char after '.'
					} else if idx := strings.Index(rawLine, member); idx != -1 {
						col = idx + 1 // 1-based column of first char of member
					}
				}
			}
			frame = FormatSourceFrame(content, loc.Line, col, highlightLen)
		}
	}

	targetFile := loc.File
	if targetFile == "" {
		targetFile = defaultFile
	}
	hint := DiagnosticHint(cleanMsg, member, targetFile)

	toolPath := ""
	configPath := ""
	if strings.Contains(targetFile, ".tool.") {
		toolPath = targetFile
	} else if strings.Contains(targetFile, "dotfiles.config.") {
		configPath = targetFile
	} else if strings.Contains(defaultFile, ".tool.") {
		toolPath = defaultFile
	} else if defaultFile != "" {
		configPath = defaultFile
	}

	return &DiagnosticError{
		OriginalErr: err,
		Message:     cleanMsg,
		Location:    loc,
		Frame:       frame,
		Hint:        hint,
		Callee:      callee,
		ToolPath:    toolPath,
		ConfigPath:  configPath,
	}
}

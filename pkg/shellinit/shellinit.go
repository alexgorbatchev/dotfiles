package shellinit

import (
	"errors"
	"fmt"
	"os"
	"regexp"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

const (
	// HeaderMarker is the header block marker for dotfiles initialization.
	HeaderMarker = "# Generated via dotfiles generator - do not modify"
)

// ErrProfileNotFound reports that the profile named in InjectOptions does not exist.
// Inject never creates a profile: the file belongs to the user, so a missing one is
// left for them to create, as v1's onlyIfExists profile update did.
var ErrProfileNotFound = errors.New("shell profile does not exist")

// Injector manages updating shell profile files to inject startup scripts.
type Injector struct {
	fs fs.FS
}

// NewInjector creates a new Injector instance with the given filesystem.
func NewInjector(f fs.FS) *Injector {
	return &Injector{fs: f}
}

// InjectOptions holds options for injecting a startup script into profiles.
type InjectOptions struct {
	ProfilePath string
	Shell       string // e.g., "zsh", "bash", "profile"
	ScriptPath  string
}

// Inject adds or updates the dotfiles initialization block in an existing profile,
// preserving the file's permissions (a read-only profile is unlocked for the write
// and locked again). A profile that does not exist is reported with
// ErrProfileNotFound and left untouched.
// Returns (wasUpdated, error).
func (inj *Injector) Inject(opts InjectOptions) (bool, error) {
	if opts.ProfilePath == "" {
		return false, fmt.Errorf("profile path must not be empty")
	}
	if opts.ScriptPath == "" {
		return false, fmt.Errorf("script path must not be empty")
	}

	exists, err := inj.fs.Exists(opts.ProfilePath)
	if err != nil {
		return false, fmt.Errorf("checking profile path: %w", err)
	}
	if !exists {
		return false, fmt.Errorf("%w: %s", ErrProfileNotFound, opts.ProfilePath)
	}

	bytes, err := inj.fs.ReadFile(opts.ProfilePath)
	if err != nil {
		return false, fmt.Errorf("reading profile path: %w", err)
	}
	content := string(bytes)
	perm := inj.currentPerm(opts.ProfilePath)

	var sourceLine string
	if opts.Shell == "powershell" {
		sourceLine = fmt.Sprintf(". %q", opts.ScriptPath)
	} else {
		sourceLine = fmt.Sprintf("source %q", opts.ScriptPath)
	}

	newBlock := fmt.Sprintf("%s\n# ------------------------------------------------------------------------------\n%s", HeaderMarker, sourceLine)

	if strings.Contains(content, HeaderMarker) {
		re := regexp.MustCompile(`(?m)# Generated via dotfiles generator - do not modify[\s\S]*?^\s*(?:source|\.)\s+["'].*?["'].*?$`)
		if re.MatchString(content) {
			oldBlock := re.FindString(content)
			if oldBlock == newBlock {
				return false, nil
			}
			if err := inj.writePreservingPerm(opts.ProfilePath, re.ReplaceAllString(content, newBlock), perm); err != nil {
				return false, fmt.Errorf("updating profile with block: %w", err)
			}
			return true, nil
		}
	}

	sourcePatterns := []string{
		fmt.Sprintf(`source %q`, opts.ScriptPath),
		fmt.Sprintf(`source '%s'`, opts.ScriptPath),
		fmt.Sprintf(`source %s`, opts.ScriptPath),
		fmt.Sprintf(`. %q`, opts.ScriptPath),
		fmt.Sprintf(`. '%s'`, opts.ScriptPath),
		fmt.Sprintf(`. %s`, opts.ScriptPath),
	}

	for _, pattern := range sourcePatterns {
		if strings.Contains(content, pattern) {
			return false, nil
		}
	}

	var sb strings.Builder
	sb.WriteString(content)
	if content != "" && !strings.HasSuffix(content, "\n") {
		sb.WriteString("\n")
	}
	if content != "" {
		sb.WriteString("\n")
	}
	sb.WriteString(newBlock)
	sb.WriteString("\n")

	if err := inj.writePreservingPerm(opts.ProfilePath, sb.String(), perm); err != nil {
		return false, fmt.Errorf("writing updated profile: %w", err)
	}
	return true, nil
}

// currentPerm returns the profile's permission bits, defaulting to 0644 when they
// cannot be read.
func (inj *Injector) currentPerm(profilePath string) os.FileMode {
	perm := os.FileMode(0644)
	if info, err := inj.fs.Stat(profilePath); err == nil && info != nil {
		perm = info.Mode().Perm()
	}
	return perm
}

// writePreservingPerm rewrites an existing profile with content and leaves it with
// perm. A profile without write bits is unlocked for the write and locked again.
func (inj *Injector) writePreservingPerm(profilePath, content string, perm os.FileMode) error {
	readOnly := perm&0222 == 0
	if readOnly {
		if err := inj.fs.Chmod(profilePath, 0644); err != nil {
			return fmt.Errorf("unlocking read-only profile: %w", err)
		}
	}
	if err := inj.fs.WriteFile(profilePath, []byte(content), perm); err != nil {
		return err
	}
	if readOnly {
		if err := inj.fs.Chmod(profilePath, perm); err != nil {
			return fmt.Errorf("restoring profile permissions: %w", err)
		}
	}
	return nil
}

// Remove deletes the dotfiles initialization block from the specified profile if present.
// Returns (wasUpdated, error).
func (inj *Injector) Remove(profilePath string) (bool, error) {
	if profilePath == "" {
		return false, fmt.Errorf("profile path must not be empty")
	}

	exists, err := inj.fs.Exists(profilePath)
	if err != nil {
		return false, fmt.Errorf("checking profile path: %w", err)
	}
	if !exists {
		return false, nil
	}

	bytes, err := inj.fs.ReadFile(profilePath)
	if err != nil {
		return false, fmt.Errorf("reading profile path: %w", err)
	}
	content := string(bytes)

	if !strings.Contains(content, HeaderMarker) {
		return false, nil
	}

	re := regexp.MustCompile(`(?m)# Generated via dotfiles generator - do not modify[\s\S]*?^\s*(?:source|\.)\s+["'].*?["'].*?$\n?`)
	if re.MatchString(content) {
		newContent := re.ReplaceAllString(content, "")

		newContent = strings.TrimSpace(newContent)
		if newContent != "" {
			newContent += "\n"
		}

		if err := inj.writePreservingPerm(profilePath, newContent, inj.currentPerm(profilePath)); err != nil {
			return false, fmt.Errorf("removing block from profile: %w", err)
		}
		return true, nil
	}

	return false, nil
}

// FormatPath returns shell script commands placing targetDir at the front of PATH.
// Both branches are idempotent so that sourcing the generated script again (nested
// shells, `exec zsh`, re-sourcing after generate) never grows PATH: PowerShell filters
// existing occurrences out before prepending, and the POSIX shells only prepend when
// the directory is not already present.
func FormatPath(shell, targetDir string) string {
	switch shell {
	case "powershell":
		return fmt.Sprintf(`$filtered = ($env:PATH -split [IO.Path]::PathSeparator | Where-Object { $_ -and $_ -ne "%s" }) -join [IO.Path]::PathSeparator
$env:PATH = if ($filtered) { "%s" + [IO.Path]::PathSeparator + $filtered } else { "%s" }`, targetDir, targetDir, targetDir)
	default: // zsh, bash, sh, etc.
		return fmt.Sprintf(`if [[ ":$PATH:" != *":%s:"* ]]; then
  export PATH="%s:$PATH"
fi`, targetDir, targetDir)
	}
}

// FormatFpath returns Zsh code to unique and append the completionsDir to fpath.
func FormatFpath(completionsDir string) string {
	return fmt.Sprintf("typeset -U fpath\nfpath=(%q $fpath)", completionsDir)
}

// FormatCompletionLoad returns the code that makes the completion files dotfiles wrote
// into completionsDir take effect in the given shell.
//
// Zsh looks completion functions up by file name on fpath, so the directory is all it
// needs. Bash has no fpath: each file has to be sourced, which needs nullglob so that an
// empty directory does not source the literal glob, and the user's own nullglob setting
// is handed back through the reusable output of `shopt -p`, exactly as the once-script
// loop does. PowerShell dot-sources each script so the Register-ArgumentCompleter calls
// inside them register against the current session rather than a child scope.
func FormatCompletionLoad(shell, completionsDir string) string {
	switch shell {
	case "zsh":
		return FormatFpath(completionsDir)
	case "bash":
		return fmt.Sprintf(`__dotfiles_completion_nullglob="$(shopt -p nullglob)"
shopt -s nullglob
for completion_script in %q/*; do
  [[ -f "$completion_script" ]] && source "$completion_script"
done
eval "$__dotfiles_completion_nullglob"
unset __dotfiles_completion_nullglob`, completionsDir)
	case "powershell":
		return fmt.Sprintf(`if (Test-Path %q) {
  Get-ChildItem -Path %q -Filter "*.ps1" | ForEach-Object { . $_.FullName }
}`, completionsDir, completionsDir)
	default:
		return ""
	}
}

// FormatOnceLoop returns the dynamic once-scripts glob matching loop for the given shell.
// The loop must run in the current shell: once-scripts self-delete after their first
// run, so an export or function they define has to land in the session that sourced
// them. The bash form needs nullglob for an empty .once directory and hands the user's
// own nullglob setting back afterwards through the reusable output of `shopt -p`.
func FormatOnceLoop(shell, onceDir string) string {
	switch shell {
	case "zsh":
		return fmt.Sprintf(`for once_script in %q/*.zsh(N); do
  [[ -f "$once_script" ]] && source "$once_script"
done`, onceDir)
	case "bash":
		return fmt.Sprintf(`__dotfiles_nullglob="$(shopt -p nullglob)"
shopt -s nullglob
for once_script in %q/*.sh; do
  [[ -f "$once_script" ]] && source "$once_script"
done
eval "$__dotfiles_nullglob"
unset __dotfiles_nullglob`, onceDir)
	case "powershell":
		return fmt.Sprintf(`if (Test-Path %q) {
  Get-ChildItem -Path %q -Filter "*.ps1" | ForEach-Object { & $_.FullName }
}`, onceDir, onceDir)
	default:
		return ""
	}
}

// HeaderLine generates an 80-character wide comment line with repeated characters, optionally with centered text.
func HeaderLine(char string, title string) string {
	totalWidth := 80
	if title == "" {
		return "# " + strings.Repeat(char, totalWidth-2)
	}

	titleWithSpaces := fmt.Sprintf(" %s ", title)
	charsNeeded := totalWidth - 1 - len(titleWithSpaces)
	if charsNeeded < 0 {
		charsNeeded = 0
	}
	leftLen := charsNeeded / 2
	rightLen := charsNeeded - leftLen
	left := strings.Repeat(char, leftLen)
	right := strings.Repeat(char, rightLen)

	return fmt.Sprintf("# %s%s%s", left, titleWithSpaces, right)
}

// GenerateFileHeader generates the standard 80-character header warning users not to edit the generated file.
func GenerateFileHeader(dotfilesDir string) string {
	var lines []string
	lines = append(lines, HeaderLine("=", ""))
	lines = append(lines, "# THIS FILE IS AUTOMATICALLY GENERATED BY THE DOTFILES MANAGEMENT TOOL")
	lines = append(lines, "# DO NOT EDIT THIS FILE DIRECTLY - YOUR CHANGES WILL BE OVERWRITTEN")
	lines = append(lines, HeaderLine("=", ""))
	lines = append(lines, "")
	if dotfilesDir != "" {
		lines = append(lines, fmt.Sprintf("# Dotfiles directory: %s", dotfilesDir))
		lines = append(lines, "")
	}
	return strings.Join(lines, "\n")
}

// GenerateSectionHeader creates a centered section header with equals signs.
func GenerateSectionHeader(title string) string {
	return HeaderLine("=", title)
}

// GenerateToolHeader generates a tool attribution header with file path information.
func GenerateToolHeader(configFilePath string) string {
	var lines []string
	lines = append(lines, HeaderLine("=", ""))
	if configFilePath != "" {
		lines = append(lines, fmt.Sprintf("# %s", configFilePath))
	}
	lines = append(lines, HeaderLine("=", ""))
	return strings.Join(lines, "\n")
}

// GenerateEndOfFile generates the end-of-file marker.
func GenerateEndOfFile() string {
	return GenerateSectionHeader("End of Generated File")
}

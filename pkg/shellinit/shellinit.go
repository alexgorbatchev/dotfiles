package shellinit

import (
	"fmt"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

const (
	// HeaderMarker is the header block marker for dotfiles initialization.
	HeaderMarker = "# Generated via dotfiles generator - do not modify"
)

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

// Inject adds or updates the dotfiles initialization block in the specified profile.
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

	var content string
	if exists {
		bytes, err := inj.fs.ReadFile(opts.ProfilePath)
		if err != nil {
			return false, fmt.Errorf("reading profile path: %w", err)
		}
		content = string(bytes)
	}

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
			newContent := re.ReplaceAllString(content, newBlock)
			err = inj.fs.WriteFile(opts.ProfilePath, []byte(newContent), 0644)
			if err != nil {
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

	parentDir := filepath.Dir(opts.ProfilePath)
	if parentDir != "." && parentDir != "/" {
		if err := inj.fs.MkdirAll(parentDir, 0755); err != nil {
			return false, fmt.Errorf("creating parent directory: %w", err)
		}
	}

	err = inj.fs.WriteFile(opts.ProfilePath, []byte(sb.String()), 0644)
	if err != nil {
		return false, fmt.Errorf("writing updated profile: %w", err)
	}

	return true, nil
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

		err = inj.fs.WriteFile(profilePath, []byte(newContent), 0644)
		if err != nil {
			return false, fmt.Errorf("removing block from profile: %w", err)
		}
		return true, nil
	}

	return false, nil
}

// FormatPath returns a conditional block appending the targetDir to PATH.
func FormatPath(shell, targetDir string) string {
	switch shell {
	case "powershell":
		return fmt.Sprintf(`if ($env:PATH -notlike "*%s*") { $env:PATH = "%s;$env:PATH" }`, targetDir, targetDir)
	default: // zsh, bash, etc.
		return fmt.Sprintf(`if [[ ":$PATH:" != *":%s:"* ]]; then
  export PATH="%s:$PATH"
fi`, targetDir, targetDir)
	}
}

// FormatFpath returns Zsh code to unique and append the completionsDir to fpath.
func FormatFpath(completionsDir string) string {
	return fmt.Sprintf("typeset -U fpath\nfpath=(%q $fpath)\nautoload -Uz compinit && compinit -u", completionsDir)
}

// FormatOnceLoop returns the dynamic once-scripts glob matching loop for the given shell.
func FormatOnceLoop(shell, onceDir string) string {
	switch shell {
	case "zsh":
		return fmt.Sprintf(`for once_script in %q/*.zsh(N); do
  [[ -f "$once_script" ]] && source "$once_script"
done`, onceDir)
	case "bash":
		return fmt.Sprintf(`(shopt -s nullglob; for once_script in %q/*.sh; do [[ -f "$once_script" ]] && source "$once_script"; done)`, onceDir)
	case "powershell":
		return fmt.Sprintf(`if (Test-Path %q) {
  Get-ChildItem -Path %q -Filter "*.ps1" | ForEach-Object { & $_.FullName }
}`, onceDir, onceDir)
	default:
		return ""
	}
}

package shellinit

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

const (
	// HeaderMarker is the header block marker for dotfiles initialization.
	HeaderMarker = "# >>> dotfiles initialize >>>"
	// FooterMarker is the footer block marker for dotfiles initialization.
	FooterMarker = "# <<< dotfiles initialize <<<"
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

	sourceLine := fmt.Sprintf("source %q", opts.ScriptPath)
	newBlock := fmt.Sprintf("%s\n%s\n%s", HeaderMarker, sourceLine, FooterMarker)

	hasHeader := strings.Contains(content, HeaderMarker)
	hasFooter := strings.Contains(content, FooterMarker)

	if hasHeader && hasFooter {
		startIndex := strings.Index(content, HeaderMarker)
		endIndex := strings.Index(content, FooterMarker) + len(FooterMarker)

		oldBlock := content[startIndex:endIndex]
		if oldBlock == newBlock {
			return false, nil
		}

		newContent := content[:startIndex] + newBlock + content[endIndex:]
		err = inj.fs.WriteFile(opts.ProfilePath, []byte(newContent), 0644)
		if err != nil {
			return false, fmt.Errorf("updating profile with block: %w", err)
		}
		return true, nil
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

	hasHeader := strings.Contains(content, HeaderMarker)
	hasFooter := strings.Contains(content, FooterMarker)

	if !hasHeader || !hasFooter {
		return false, nil
	}

	startIndex := strings.Index(content, HeaderMarker)
	endIndex := strings.Index(content, FooterMarker) + len(FooterMarker)

	prefix := content[:startIndex]
	suffix := content[endIndex:]

	if strings.HasSuffix(prefix, "\n\n") && strings.HasPrefix(suffix, "\n") {
		prefix = strings.TrimSuffix(prefix, "\n")
	} else if strings.HasSuffix(prefix, "\n") && strings.HasPrefix(suffix, "\n") {
		suffix = strings.TrimPrefix(suffix, "\n")
	}

	newContent := prefix + suffix
	err = inj.fs.WriteFile(profilePath, []byte(newContent), 0644)
	if err != nil {
		return false, fmt.Errorf("removing block from profile: %w", err)
	}

	return true, nil
}

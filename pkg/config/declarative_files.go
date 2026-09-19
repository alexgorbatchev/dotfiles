package config

import (
	"fmt"
	"os"
	"regexp"
	"strconv"
	"strings"
)

// ParseMode reads a POSIX permission written the way an author writes one.
//
// "0600", "600" and "0o600" all mean the same thing and all appear in real
// configurations, so all three are accepted. Everything else is refused rather than
// guessed at: a mode read as the wrong number would leave a private key readable by
// anyone on the machine, and nothing later in the pipeline would notice.
func ParseMode(value string) (os.FileMode, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return 0, fmt.Errorf("mode is empty, expected an octal permission such as %q", "0600")
	}

	digits := trimmed
	if lowered := strings.ToLower(digits); strings.HasPrefix(lowered, "0o") {
		digits = digits[2:]
	}

	parsed, err := strconv.ParseUint(digits, 8, 32)
	if err != nil {
		return 0, fmt.Errorf("mode %q is not an octal permission such as %q", value, "0600")
	}
	// Anything above 0777 addresses setuid, setgid or the sticky bit, which nothing
	// here sets and which an author almost certainly did not mean to.
	if parsed > 0o777 {
		return 0, fmt.Errorf("mode %q is out of range, expected a value between %q and %q", value, "0000", "0777")
	}
	return os.FileMode(parsed), nil
}

// blockIDPattern is what may be written into a block marker and found again. It
// matches the rule the block package enforces, stated here so a bad id is reported
// while the configuration is being validated rather than halfway through a write.
var blockIDPattern = regexp.MustCompile(`^[A-Za-z0-9._-]+$`)

// validPositions and validConflicts are the values the engine implements. A
// declaration naming anything else is rejected at load time, because a misspelled
// policy that fell back to the default would quietly do the opposite of what the
// author asked for.
var (
	validPositions = []string{"top", "bottom"}
	validConflicts = []string{"merge", "keep-local", "overwrite", "prompt"}
)

// DirectoryConfig is a directory a tool needs to exist, with the permission it needs
// to have. ~/.ssh is the motivating case: ssh refuses to use a key whose directory
// anyone else can read.
type DirectoryConfig struct {
	Path string `json:"path" yaml:"path"`
	Mode string `json:"mode,omitempty" yaml:"mode,omitempty"`
}

// Validate reports a directory declaration that cannot be carried out.
func (dc *DirectoryConfig) Validate() error {
	if strings.TrimSpace(dc.Path) == "" {
		return fmt.Errorf("directory path cannot be empty")
	}
	return validateOptionalMode(dc.Mode)
}

// BlockConfig is one region of a shared file that a tool owns.
type BlockConfig struct {
	Target  string `json:"target" yaml:"target"`
	ID      string `json:"id" yaml:"id"`
	Content string `json:"content,omitempty" yaml:"content,omitempty"`
	Mode    string `json:"mode,omitempty" yaml:"mode,omitempty"`
	// Position decides where a block that is not yet in the file is inserted, and
	// has no effect once it is there.
	Position string `json:"position,omitempty" yaml:"position,omitempty"`
	Conflict string `json:"conflict,omitempty" yaml:"conflict,omitempty"`
}

// Validate reports a block declaration that cannot be carried out.
func (bc *BlockConfig) Validate() error {
	if strings.TrimSpace(bc.Target) == "" {
		return fmt.Errorf("block target cannot be empty")
	}
	if !blockIDPattern.MatchString(bc.ID) {
		return fmt.Errorf("block id %q may only contain letters, digits, dots, dashes and underscores", bc.ID)
	}
	if err := validateOptionalMode(bc.Mode); err != nil {
		return err
	}
	if err := validateOneOf("position", bc.Position, validPositions); err != nil {
		return err
	}
	return validateOneOf("conflict", bc.Conflict, validConflicts)
}

// TemplateConfig is a file rendered from a template in the repository.
type TemplateConfig struct {
	Source    string         `json:"source" yaml:"source"`
	Target    string         `json:"target" yaml:"target"`
	Variables map[string]any `json:"variables,omitempty" yaml:"variables,omitempty"`
	Mode      string         `json:"mode,omitempty" yaml:"mode,omitempty"`
	Conflict  string         `json:"conflict,omitempty" yaml:"conflict,omitempty"`
}

// Validate reports a template declaration that cannot be carried out.
func (tc *TemplateConfig) Validate() error {
	if strings.TrimSpace(tc.Source) == "" {
		return fmt.Errorf("template source cannot be empty")
	}
	if strings.TrimSpace(tc.Target) == "" {
		return fmt.Errorf("template target cannot be empty")
	}
	if err := validateOptionalMode(tc.Mode); err != nil {
		return err
	}
	return validateOneOf("conflict", tc.Conflict, validConflicts)
}

// validateOptionalMode accepts an unset mode and checks the rest.
func validateOptionalMode(mode string) error {
	if mode == "" {
		return nil
	}
	if _, err := ParseMode(mode); err != nil {
		return err
	}
	return nil
}

// validateOneOf accepts an unset value, meaning the default, and checks the rest
// against what the engine implements.
func validateOneOf(field, value string, allowed []string) error {
	if value == "" {
		return nil
	}
	for _, candidate := range allowed {
		if value == candidate {
			return nil
		}
	}
	return fmt.Errorf("%s %q is not one of %s", field, value, strings.Join(allowed, ", "))
}

// RenderTemplate fills a template with the author's variables.
//
// The syntax is the {token} one the rest of the project already uses, rather than a
// second templating language introduced alongside it: an author who has written
// {paths.homeDir} in a symlink target writes it the same way here, "${HOME}" is
// still left for the shell to expand, and every project placeholder keeps working
// inside a template without being redeclared.
//
// A token nothing fills is an error. Rendering it as an empty string would write a
// configuration file with a missing value into place and say nothing, which is the
// failure this whole feature exists to prevent.
func RenderTemplate(content string, variables map[string]any, toolName string, projCfg *ProjectConfig) (string, error) {
	// Resolved first, so a project placeholder still works, and then overlaid with
	// the author's variables, so a name they chose wins over a built-in one.
	withVariables := substituteTokensOnce(content, func(name string) (string, bool) {
		value, ok := variables[name]
		if !ok {
			return "", false
		}
		return fmt.Sprintf("%v", value), true
	})

	rendered, err := ResolvePlaceholders(withVariables, toolName, projCfg)
	if err != nil {
		return "", err
	}

	if tokens := unresolvedTokens(rendered); len(tokens) > 0 {
		return "", fmt.Errorf("template has no value for %s", strings.Join(tokens, ", "))
	}
	return rendered, nil
}

// validateUniqueBlocks reports two declarations claiming the same region of the same
// file. The block engine refuses to act on a file whose markers appear twice, so two
// tools racing for one id would leave the file unwritable from then on; catching it
// here names both declarations instead.
func (tc *ToolConfig) validateUniqueBlocks() error {
	seen := make(map[string]bool, len(tc.Blocks))
	for _, blk := range tc.Blocks {
		key := blk.Target + "\x00" + blk.ID
		if seen[key] {
			return fmt.Errorf("tool %q declares the block %q of %q twice", tc.Name, blk.ID, blk.Target)
		}
		seen[key] = true
	}
	return nil
}

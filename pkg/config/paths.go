package config

import (
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/utils"
)

// The settings the paths block accepts. They name the JSON properties, so they are also
// what a {paths.*} placeholder and a validation error spell.
const (
	pathHomeDir         = "homeDir"
	pathDotfilesDir     = "dotfilesDir"
	pathTargetDir       = "targetDir"
	pathGeneratedDir    = "generatedDir"
	pathToolConfigsDir  = "toolConfigsDir"
	pathShellScriptsDir = "shellScriptsDir"
	pathBinariesDir     = "binariesDir"
)

// pathDefaults is the value each setting falls back to when the configuration leaves it
// out. They are templates rather than finished paths so that a default and a value
// written by hand go through exactly the same expansion, which is what keeps the
// documented defaults true for a configuration that moves paths.dotfilesDir somewhere
// else. Every key of pathsKeys needs an entry; TestPathDefaultsCoverEveryPathsKey pins
// that.
var pathDefaults = map[string]string{
	pathHomeDir:         "{HOME}",
	pathDotfilesDir:     "{configFileDir}",
	pathTargetDir:       "{paths.generatedDir}/bin",
	pathGeneratedDir:    "{paths.dotfilesDir}/.generated",
	pathToolConfigsDir:  "{configFileDir}/tools",
	pathShellScriptsDir: "{paths.generatedDir}/shell-scripts",
	pathBinariesDir:     "{paths.generatedDir}/binaries",
}

// ResolvePlaceholders turns the paths block into the absolute directories the rest of
// the CLI works with. configFileDir is the directory holding the configuration file,
// and it is the anchor for everything the configuration leaves relative, so the same
// configuration describes the same layout whichever directory the command was run from.
//
// Resolution runs in stages, because each one depends on the one before it:
//
//  1. paths.homeDir is resolved on its own, against the home directory the operating
//     system reports, because it is what "~" and {HOME} mean everywhere else.
//  2. Every setting has its placeholders substituted: {HOME} and {homeDir} for the home
//     directory resolved above, {configFileDir} for the directory of the configuration
//     file, and {paths.<setting>} for another setting, which may itself be a template.
//     A placeholder nothing can fill aborts the load rather than becoming part of a
//     directory name.
//  3. A leading "~" is expanded, and whatever is still relative is joined to
//     configFileDir.
//
// It is idempotent: a resolved configuration holds absolute paths with no placeholders
// left, so resolving it again changes nothing.
func (p *ProjectConfig) ResolvePlaceholders(configFileDir string) error {
	if p == nil {
		return nil
	}

	systemHome, _ := os.UserHomeDir()
	values := p.Paths.declaredValues()
	if err := checkPathPlaceholders(values); err != nil {
		return err
	}

	home, err := resolvePathEntry(pathHomeDir, values[pathHomeDir][0], pathLookup(values, configFileDir, systemHome))
	if err != nil {
		return err
	}
	home, err = anchorPath(pathHomeDir, utils.ExpandHomePath(systemHome, home), configFileDir, systemHome)
	if err != nil {
		return err
	}
	values[pathHomeDir] = []string{home}

	lookup := pathLookup(values, configFileDir, home)
	for _, key := range pathsKeys {
		for i, entry := range values[key] {
			resolved, err := resolvePathEntry(key, entry, lookup)
			if err != nil {
				return err
			}
			anchored, err := anchorPath(key, resolved, configFileDir, home)
			if err != nil {
				return err
			}
			values[key][i] = anchored
		}
	}

	p.Paths.assign(values)
	return nil
}

// declaredValues collects what the configuration declared for each setting, falling back
// to that setting's default template. Every setting holds a list because toolConfigsDir
// may name several directories; the rest hold exactly one entry.
func (p PathsConfig) declaredValues() map[string][]string {
	values := map[string][]string{
		pathHomeDir:         {p.HomeDir},
		pathDotfilesDir:     {p.DotfilesDir},
		pathTargetDir:       {p.TargetDir},
		pathGeneratedDir:    {p.GeneratedDir},
		pathToolConfigsDir:  p.GetToolConfigsDirs(),
		pathShellScriptsDir: {p.ShellScriptsDir},
		pathBinariesDir:     {p.BinariesDir},
	}
	for key, entries := range values {
		if len(entries) == 0 || entries[0] == "" {
			values[key] = []string{pathDefaults[key]}
		}
	}
	return values
}

// assign writes resolved values back onto the paths block.
func (p *PathsConfig) assign(values map[string][]string) {
	p.HomeDir = values[pathHomeDir][0]
	p.DotfilesDir = values[pathDotfilesDir][0]
	p.TargetDir = values[pathTargetDir][0]
	p.GeneratedDir = values[pathGeneratedDir][0]
	p.ToolConfigsDir = values[pathToolConfigsDir]
	p.ShellScriptsDir = values[pathShellScriptsDir][0]
	p.BinariesDir = values[pathBinariesDir][0]
}

// pathLookup answers what a placeholder inside the paths block stands for. It reads
// values as it is being resolved, so a setting that references another one picks up
// whatever that one has become.
func pathLookup(values map[string][]string, configFileDir string, homeDir string) func(string) (string, bool) {
	return func(name string) (string, bool) {
		switch name {
		case "HOME", pathHomeDir:
			return homeDir, true
		case "configFileDir":
			return configFileDir, true
		}

		key, ok := strings.CutPrefix(name, "paths.")
		if !ok {
			return "", false
		}
		entries, ok := values[key]
		if !ok || len(entries) == 0 {
			return "", false
		}
		return entries[0], true
	}
}

// checkPathPlaceholders rejects a placeholder that no setting can fill, before anything
// is substituted, so that the error names the setting spelling it rather than whichever
// setting happens to reference that one. Leaving it in place is what created directories
// literally named "{paths.dotfilesDir}".
func checkPathPlaceholders(values map[string][]string) error {
	for _, key := range pathsKeys {
		for _, entry := range values[key] {
			for _, token := range unresolvedTokens(entry) {
				name := strings.Trim(token, "{}")
				if name == "HOME" || name == pathHomeDir || name == "configFileDir" {
					continue
				}
				if setting, ok := strings.CutPrefix(name, "paths."); ok && slices.Contains(pathsKeys, setting) {
					continue
				}
				return fmt.Errorf("paths.%s: unknown placeholder %s", key, token)
			}
		}
	}
	return nil
}

// resolvePathEntry substitutes the placeholders of one setting until nothing changes,
// so that a setting may reference another one that is itself still a template. Every
// placeholder left at this point is one checkPathPlaceholders accepted, so a value that
// never stops changing is a reference cycle.
func resolvePathEntry(key string, value string, lookup func(string) (string, bool)) (string, error) {
	current := value
	for range maxSubstitutionRounds {
		next := substituteTokensOnce(current, lookup)
		if next == current {
			return current, nil
		}
		current = next
	}
	return "", fmt.Errorf("paths.%s: placeholder substitution did not converge after %d rounds, so %q is part of a reference cycle", key, maxSubstitutionRounds, value)
}

// anchorPath expands a leading "~" and joins whatever is still relative to the directory
// of the configuration file.
func anchorPath(key string, value string, configFileDir string, homeDir string) (string, error) {
	if value == "" {
		return "", nil
	}

	expanded := utils.ExpandHomePath(homeDir, value)
	if strings.HasPrefix(expanded, "~") {
		if homeDir == "" {
			return "", fmt.Errorf("paths.%s: %q is relative to the home directory, but no home directory was found; set paths.homeDir", key, value)
		}
		return "", fmt.Errorf("paths.%s: %q is not a home-relative path, which is only %q or a path starting with %q", key, value, "~", "~/")
	}

	if !filepath.IsAbs(expanded) {
		expanded = filepath.Join(configFileDir, expanded)
	}
	return filepath.Clean(expanded), nil
}

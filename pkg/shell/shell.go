package shell

import (
	"fmt"
	"sort"
	"strings"
)

// Directive represents a shell directive to be generated (e.g., path extension, alias, or env export).
type Directive interface {
	Generate() string
}

// PathExtension represents a directive to extend the PATH environment variable.
type PathExtension struct {
	Path        string
	Append      bool
	Deduplicate bool
}

// Generate formats the PathExtension directive for sh-compatible shells.
func (p PathExtension) Generate() string {
	if p.Deduplicate {
		if p.Append {
			return fmt.Sprintf("case \":$PATH:\" in\n  *\":%s:\"*) ;;\n  *) export PATH=\"$PATH:%s\" ;;\nesac", p.Path, p.Path)
		}
		return fmt.Sprintf("case \":$PATH:\" in\n  *\":%s:\"*) ;;\n  *) export PATH=\"%s:$PATH\" ;;\nesac", p.Path, p.Path)
	}
	if p.Append {
		return fmt.Sprintf("export PATH=\"$PATH:%s\"", p.Path)
	}
	return fmt.Sprintf("export PATH=\"%s:$PATH\"", p.Path)
}

// Alias represents a shell alias definition.
type Alias struct {
	Name  string
	Value string
}

// Generate formats the Alias directive for sh-compatible shells.
func (a Alias) Generate() string {
	return fmt.Sprintf("alias %s='%s'", a.Name, a.Value)
}

// EnvVar represents an exported environment variable.
type EnvVar struct {
	Name  string
	Value string
}

// Generate formats the EnvVar directive for sh-compatible shells.
func (e EnvVar) Generate() string {
	return fmt.Sprintf("export %s=\"%s\"", e.Name, e.Value)
}

// FromEnvMap converts a map of environment variables to a slice of EnvVar directives sorted alphabetically by key.
func FromEnvMap(m map[string]string) []EnvVar {
	if len(m) == 0 {
		return nil
	}
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	res := make([]EnvVar, len(keys))
	for i, k := range keys {
		res[i] = EnvVar{Name: k, Value: m[k]}
	}
	return res
}

// FromAliasMap converts a map of aliases to a slice of Alias directives sorted alphabetically by key.
func FromAliasMap(m map[string]string) []Alias {
	if len(m) == 0 {
		return nil
	}
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	res := make([]Alias, len(keys))
	for i, k := range keys {
		res[i] = Alias{Name: k, Value: m[k]}
	}
	return res
}

// FromEnvMapDirectives converts a map of environment variables to a slice of Directive interface sorted by key.
func FromEnvMapDirectives(m map[string]string) []Directive {
	envVars := FromEnvMap(m)
	if len(envVars) == 0 {
		return nil
	}
	directives := make([]Directive, len(envVars))
	for i, v := range envVars {
		directives[i] = v
	}
	return directives
}

// FromAliasMapDirectives converts a map of aliases to a slice of Directive interface sorted by key.
func FromAliasMapDirectives(m map[string]string) []Directive {
	aliases := FromAliasMap(m)
	if len(aliases) == 0 {
		return nil
	}
	directives := make([]Directive, len(aliases))
	for i, a := range aliases {
		directives[i] = a
	}
	return directives
}

// GenerateScript compiles a list of directives into a single shell script string.
func GenerateScript(directives []Directive) string {
	var sb strings.Builder
	for _, d := range directives {
		sb.WriteString(d.Generate())
		sb.WriteString("\n")
	}
	return sb.String()
}

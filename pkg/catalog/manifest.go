package catalog

import (
	"fmt"
	"slices"
	"strings"
)

func (m DefinitionManifest) Validate() error {
	if err := validateSchema(m.SchemaVersion); err != nil {
		return err
	}
	if err := ValidateID(m.ID); err != nil {
		return err
	}
	if err := ValidateID(m.Name); err != nil {
		return err
	}
	if err := validateVersion(m.MinimumCLIVersion); err != nil {
		return err
	}
	if err := validateTargets(m.SupportedTargets); err != nil {
		return err
	}
	if err := m.validateFiles(); err != nil {
		return err
	}
	if len(m.Summaries) != len(m.SupportedTargets) {
		return fmt.Errorf("summary matrix must equal supported targets")
	}
	for i, summary := range m.Summaries {
		if summary.Target != m.SupportedTargets[i] {
			return fmt.Errorf("summary target differs from supported matrix")
		}
		if err := summary.Validate(); err != nil {
			return err
		}
	}
	data, err := CanonicalJSON(m)
	if err != nil {
		return err
	}
	if len(data) > maxManifestBytes {
		return fmt.Errorf("definition manifest exceeds %d bytes", maxManifestBytes)
	}
	return nil
}

func (m DefinitionManifest) validateFiles() error {
	if len(m.Files) < 1 || len(m.Files) > maxBundleFiles {
		return fmt.Errorf("definition requires 1–%d files", maxBundleFiles)
	}
	var total int64
	mainFound := false
	seen := make(map[string]bool, len(m.Files))
	directories := make(map[string]string)
	for i, file := range m.Files {
		if err := validatePath(file.Path); err != nil {
			return err
		}
		if i > 0 && m.Files[i-1].Path >= file.Path {
			return fmt.Errorf("bundle files must be sorted and unique")
		}
		limit := int64(maxAssetBytes)
		if file.Path == m.ID+".tool.ts" {
			mainFound = true
			limit = maxTypeScriptBytes
			if !file.IsText {
				return fmt.Errorf("definition source must be text")
			}
		} else if !strings.HasPrefix(file.Path, "files/") || strings.HasSuffix(file.Path, ".tool.ts") {
			return fmt.Errorf("invalid bundle file %q", file.Path)
		}
		if err := file.Blob.Validate(limit); err != nil {
			return err
		}
		if file.Mode != "0644" && file.Mode != "0755" {
			return fmt.Errorf("invalid bundle mode %q", file.Mode)
		}
		total += file.Blob.Size
		key := strings.ToLower(file.Path)
		if seen[key] {
			return fmt.Errorf("case-insensitive bundle collision %q", file.Path)
		}
		if _, exists := directories[key]; exists {
			return fmt.Errorf("file/directory collision %q", file.Path)
		}
		for _, parent := range pathParents(file.Path) {
			folded := strings.ToLower(parent)
			if seen[folded] {
				return fmt.Errorf("file/directory collision %q", file.Path)
			}
			if spelling, exists := directories[folded]; exists && spelling != parent {
				return fmt.Errorf("case-insensitive directory collision %q", parent)
			}
			directories[folded] = parent
		}
		seen[key] = true
	}
	if !mainFound {
		return fmt.Errorf("bundle is missing %s.tool.ts", m.ID)
	}
	if total > maxDefinitionBytes {
		return fmt.Errorf("selected definition exceeds %d bytes", maxDefinitionBytes)
	}
	return nil
}

func pathParents(value string) []string {
	parts := strings.Split(value, "/")
	parents := make([]string, 0, len(parts)-1)
	for i := 1; i < len(parts); i++ {
		parents = append(parents, strings.Join(parts[:i], "/"))
	}
	return parents
}

var configurationKinds = []ConfigurationKind{"directory", "symlink", "copy", "template", "block", "shell-env", "shell-alias", "shell-function", "shell-script", "shell-completion"}

func (s TargetSummary) Validate() error {
	if err := s.Target.Validate(); err != nil {
		return err
	}
	if err := validateMethod(s.InstallationMethod); err != nil {
		return err
	}
	for i, binary := range s.Binaries {
		if err := validateText("binary name", binary.Name, 1, 0); err != nil {
			return err
		}
		if i > 0 && s.Binaries[i-1].Name >= binary.Name {
			return fmt.Errorf("binary summaries must be sorted and unique")
		}
	}
	if err := sortedStrings(s.Dependencies, "dependencies"); err != nil {
		return err
	}
	if err := sortedStrings(s.Hooks, "hooks"); err != nil {
		return err
	}
	for _, configuration := range s.Configuration {
		if !slices.Contains(configurationKinds, configuration.Kind) {
			return fmt.Errorf("unknown configuration kind %q", configuration.Kind)
		}
		if err := validateText("configuration target", configuration.Target, 1, 0); err != nil {
			return err
		}
	}
	return nil
}

package catalog

import (
	"fmt"
	"slices"
	"strings"
)

func (r CategoryRegistry) Validate() error {
	if err := validateSchema(r.SchemaVersion); err != nil {
		return err
	}
	for i, c := range r.Categories {
		if err := ValidateID(c.ID); err != nil {
			return err
		}
		if i > 0 && r.Categories[i-1].ID >= c.ID {
			return fmt.Errorf("categories must be sorted and unique")
		}
		if err := validateText("category label", c.Label, 1, 0); err != nil {
			return err
		}
		if err := validateText("category description", c.Description, 1, 0); err != nil {
			return err
		}
	}
	return nil
}

func (m ToolMetadata) Validate(registry CategoryRegistry) error {
	if err := registry.Validate(); err != nil {
		return err
	}
	if err := validateSchema(m.SchemaVersion); err != nil {
		return err
	}
	if err := ValidateID(m.ID); err != nil {
		return err
	}
	if err := validateText("display name", m.DisplayName, 1, 80); err != nil {
		return err
	}
	if err := validateText("description", m.Description, 1, 280); err != nil {
		return err
	}
	if err := m.validateCategories(registry); err != nil {
		return err
	}
	if err := validateHTTPS(m.UpstreamURL); err != nil {
		return err
	}
	if err := m.validateMaintainers(); err != nil {
		return err
	}
	if err := validateText("license", m.License, 1, 0); err != nil {
		return err
	}
	if err := m.validateAssetLicenses(); err != nil {
		return err
	}
	names := make([]string, len(m.Definitions))
	for i, d := range m.Definitions {
		names[i] = d.Name
		if err := validateText("definition description", d.Description, 1, 280); err != nil {
			return err
		}
		if err := validateVersion(d.MinimumCLIVersion); err != nil {
			return err
		}
		if err := validateTargets(d.SupportedTargets); err != nil {
			return err
		}
	}
	return validateDefinitions(names)
}

func (m ToolMetadata) validateCategories(registry CategoryRegistry) error {
	if len(m.Categories) < 1 || len(m.Categories) > 8 {
		return fmt.Errorf("tool requires 1–8 categories")
	}
	if err := sortedStrings(m.Categories, "tool categories"); err != nil {
		return err
	}
	for _, id := range m.Categories {
		if !slices.ContainsFunc(registry.Categories, func(c Category) bool { return c.ID == id }) {
			return fmt.Errorf("unknown category %q", id)
		}
	}
	return nil
}

func (m ToolMetadata) validateMaintainers() error {
	if len(m.Maintainers) < 1 || len(m.Maintainers) > 5 {
		return fmt.Errorf("tool requires 1–5 maintainers")
	}
	seen := make(map[string]bool)
	for _, maintainer := range m.Maintainers {
		handle := maintainer.GitHub
		if !handlePattern.MatchString(handle) || strings.Contains(handle, "--") || seen[strings.ToLower(handle)] {
			return fmt.Errorf("invalid or duplicate maintainer handle %q", handle)
		}
		seen[strings.ToLower(handle)] = true
	}
	return nil
}

func (m ToolMetadata) validateAssetLicenses() error {
	for i, asset := range m.AssetLicenses {
		if err := validatePath(asset.Path); err != nil {
			return err
		}
		if !strings.HasPrefix(asset.Path, "files/") {
			return fmt.Errorf("asset license path must be inside files/")
		}
		if i > 0 && m.AssetLicenses[i-1].Path >= asset.Path {
			return fmt.Errorf("asset licenses must be sorted and unique")
		}
		if err := validateText("asset license", asset.License, 1, 0); err != nil {
			return err
		}
		if asset.SourceURL != nil {
			if err := validateHTTPS(*asset.SourceURL); err != nil {
				return err
			}
		}
	}
	return nil
}

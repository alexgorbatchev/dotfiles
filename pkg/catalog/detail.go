package catalog

import (
	"context"
	"fmt"
	"reflect"
	"slices"
	"time"
)

type DefinitionBundle struct {
	Detail   ToolDetail
	Manifest DefinitionManifest
	Files    map[string][]byte
}

type definitionRequest struct {
	ID, Name string
	Request  RequestOptions
}

func (c *Client) Definition(ctx context.Context, snapshot DiscoverySnapshot, id, name string, options RequestOptions) (DefinitionBundle, error) {
	return c.definition(ctx, snapshot, definitionRequest{ID: id, Name: name, Request: options})
}

func (c *Client) definition(ctx context.Context, snapshot DiscoverySnapshot, request definitionRequest) (DefinitionBundle, error) {
	id, name, options := request.ID, request.Name, request.Request
	result := DefinitionBundle{}
	if err := ValidateID(id); err != nil {
		return result, failure("invalid-input", id, err)
	}
	if err := ValidateID(name); err != nil {
		return result, failure("invalid-input", id, err)
	}
	index := slices.IndexFunc(snapshot.Index.Entries, func(entry IndexEntry) bool { return entry.ID == id })
	if index < 0 {
		return result, failure("not-found", id, fmt.Errorf("catalog ID %q is not in snapshot %s", id, snapshot.Snapshot))
	}
	entry := snapshot.Index.Entries[index]
	selected := slices.IndexFunc(entry.Definitions, func(definition IndexDefinition) bool { return definition.Name == name })
	if selected < 0 {
		return result, failure("not-found", id, fmt.Errorf("definition %q does not exist for %q", name, id))
	}
	detail, err := readCatalogJSON[ToolDetail](ctx, c, entry.Detail, "detail "+id, maxDetailBytes, options)
	if err != nil {
		return result, err
	}
	if err := detail.Validate(entry, snapshot.Categories, snapshot.Payload.SourceCommit); err != nil {
		return result, failure("integrity-failed", id, err)
	}
	ref := detail.Definitions[selected]
	manifest, err := readCatalogJSON[DefinitionManifest](ctx, c, ref.Manifest, "definition "+id+"/"+name, maxManifestBytes, options)
	if err != nil {
		return result, err
	}
	if err := manifest.Validate(); err != nil {
		return result, failure("integrity-failed", id, err)
	}
	revision, err := manifest.Revision()
	if err != nil {
		return result, failure("integrity-failed", id, err)
	}
	if revision != entry.Definitions[selected].Revision {
		return result, failure("integrity-failed", id, fmt.Errorf("definition revision differs from its canonical manifest"))
	}
	if manifest.ID != id || manifest.Name != name || manifest.MinimumCLIVersion != entry.Definitions[selected].MinimumCLIVersion {
		return result, failure("integrity-failed", id, fmt.Errorf("manifest identity differs from selected definition"))
	}
	metadata := detail.Metadata.Definitions[selected]
	if !slices.Equal(manifest.SupportedTargets, metadata.SupportedTargets) {
		return result, failure("integrity-failed", id, fmt.Errorf("manifest target matrix differs from metadata"))
	}
	if err := validateManifestIndex(manifest, entry.Definitions[selected]); err != nil {
		return result, failure("integrity-failed", id, err)
	}
	result = DefinitionBundle{Detail: detail, Manifest: manifest, Files: make(map[string][]byte, len(manifest.Files))}
	for _, file := range manifest.Files {
		data, err := c.definitionAsset(ctx, request, file)
		if err != nil {
			return DefinitionBundle{}, err
		}
		result.Files[file.Path] = data
	}
	return result, nil
}

func (c *Client) definitionAsset(ctx context.Context, request definitionRequest, file BundleFile) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	data, err := c.object(ctx, file.Blob, "asset "+request.ID+"/"+file.Path, maxAssetBytes, request.Request)
	if err != nil {
		return nil, err
	}
	if IsText(data) != file.IsText {
		return nil, failure("integrity-failed", request.ID, fmt.Errorf("asset %q text classification is incorrect", file.Path))
	}
	return data, nil
}

func validateManifestIndex(manifest DefinitionManifest, definition IndexDefinition) error {
	if len(manifest.Summaries) != len(definition.Summaries) {
		return fmt.Errorf("manifest summary matrix differs from index")
	}
	for i, summary := range manifest.Summaries {
		projection := IndexTarget{Target: summary.Target, InstallationMethod: summary.InstallationMethod}
		if !reflect.DeepEqual(projection, definition.Summaries[i]) {
			return fmt.Errorf("manifest target/method projection differs from index")
		}
	}
	return nil
}

func (detail ToolDetail) Validate(entry IndexEntry, categories CategoryRegistry, commit string) error {
	if err := validateSchema(detail.SchemaVersion); err != nil {
		return err
	}
	if detail.SourceCommit != commit || !commitPattern.MatchString(detail.SourceCommit) || detail.SourcePath != entry.SourcePath {
		return fmt.Errorf("detail source identity differs from snapshot/index")
	}
	if err := detail.Metadata.Validate(categories); err != nil {
		return err
	}
	m := detail.Metadata
	if m.ID != entry.ID || m.DisplayName != entry.DisplayName || m.Description != entry.Description || !slices.Equal(m.Categories, entry.Categories) {
		return fmt.Errorf("detail metadata differs from index")
	}
	if len(detail.Definitions) != len(entry.Definitions) || len(detail.Definitions) != len(m.Definitions) {
		return fmt.Errorf("detail definition matrix differs from metadata/index")
	}
	for i, definition := range detail.Definitions {
		indexed := entry.Definitions[i]
		if definition.Name != indexed.Name || definition.Name != m.Definitions[i].Name || definition.Revision != indexed.Revision || definition.Revision != definition.Manifest.SHA256 {
			return fmt.Errorf("detail definition identity differs from index")
		}
		if err := definition.Manifest.Validate(maxManifestBytes); err != nil {
			return err
		}
		if indexed.MinimumCLIVersion != m.Definitions[i].MinimumCLIVersion {
			return fmt.Errorf("detail minimum CLI version differs from index")
		}
	}
	if err := detail.validateVerification(); err != nil {
		return err
	}
	return detail.validateIndexVerification(entry)
}

func (detail ToolDetail) validateVerification() error {
	previous := ""
	var previousTime time.Time
	for _, check := range detail.Verification {
		selected := slices.IndexFunc(detail.Definitions, func(d DefinitionRef) bool {
			return d.Name == check.Definition && d.Revision == check.DefinitionRevision
		})
		if selected < 0 || !slices.Contains(detail.Metadata.Definitions[selected].SupportedTargets, check.Target) {
			return fmt.Errorf("verification is not bound to a current declared definition/target")
		}
		if err := validateCheck(IndexVerification{Target: check.Target, Outcome: check.Outcome, CheckedAt: check.CheckedAt, LastSuccessfulCheck: check.LastSuccessfulCheck}); err != nil {
			return err
		}
		key := definitionKey(check.Definition) + "/" + targetKey(check.Target)
		checked, err := time.Parse(time.RFC3339Nano, check.CheckedAt)
		if err != nil {
			return err
		}
		if key < previous || (key == previous && !checked.After(previousTime)) {
			return fmt.Errorf("verification checks must be sorted and unique")
		}
		previous = key
		previousTime = checked
		if err := validateVersion(check.CLIVersion); err != nil {
			return err
		}
		if err := validateText("runner image", check.RunnerImage, 1, 0); err != nil {
			return err
		}
		if err := validateHTTPS(check.LogURL); err != nil {
			return err
		}
		if !hashPattern.MatchString(check.DescriptorDigest) {
			return fmt.Errorf("invalid verification descriptor digest")
		}
		if err := validateVerificationDependencies(check.Dependencies); err != nil {
			return err
		}
	}
	return nil
}

func (detail ToolDetail) validateIndexVerification(entry IndexEntry) error {
	for _, definition := range entry.Definitions {
		latest := make(map[Target]IndexVerification)
		for _, check := range detail.Verification {
			if check.Definition != definition.Name {
				continue
			}
			latest[check.Target] = IndexVerification{Target: check.Target, Outcome: check.Outcome, CheckedAt: check.CheckedAt, LastSuccessfulCheck: check.LastSuccessfulCheck}
		}
		if len(latest) != len(definition.Verification) {
			return fmt.Errorf("index verification differs from latest detail evidence")
		}
		for _, check := range definition.Verification {
			if projected, ok := latest[check.Target]; !ok || !reflect.DeepEqual(projected, check) {
				return fmt.Errorf("index verification differs from latest detail evidence")
			}
		}
	}
	return nil
}

func validateVerificationDependencies(dependencies []VerificationDependency) error {
	previous := ""
	for _, dependency := range dependencies {
		if err := ValidateID(dependency.ProviderID); err != nil {
			return err
		}
		if err := ValidateID(dependency.Definition); err != nil {
			return err
		}
		key := dependency.ProviderID + "/" + definitionKey(dependency.Definition)
		if key <= previous || !hashPattern.MatchString(dependency.Revision) {
			return fmt.Errorf("verification dependencies must be sorted unique valid revisions")
		}
		previous = key
	}
	return nil
}

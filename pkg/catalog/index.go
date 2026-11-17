package catalog

import (
	"fmt"
	"slices"
	"time"
)

const (
	maxPointerBytes  = 16 << 10
	maxSnapshotBytes = 64 << 10
	maxIndexBytes    = 32 << 20
	maxDetailBytes   = 256 << 10
)

func (p Pointer) Validate() error {
	if err := validateSchema(p.SchemaVersion); err != nil {
		return err
	}
	return p.Snapshot.Validate(maxSnapshotBytes)
}

func (p SnapshotPayload) Validate() error {
	if err := validateSchema(p.SchemaVersion); err != nil {
		return err
	}
	if p.MinimumReaderVersion != schemaVersion {
		return fmt.Errorf("unsupported catalog reader version %d", p.MinimumReaderVersion)
	}
	if !commitPattern.MatchString(p.SourceCommit) {
		return fmt.Errorf("invalid source commit %q", p.SourceCommit)
	}
	if err := validateTimestamp(p.GeneratedAt); err != nil {
		return err
	}
	for _, ref := range []BlobRef{p.Index, p.Categories, p.Tombstones} {
		if err := ref.Validate(maxIndexBytes); err != nil {
			return err
		}
	}
	return nil
}

func (r TombstoneRegistry) Validate() error {
	if err := validateSchema(r.SchemaVersion); err != nil {
		return err
	}
	for i, tool := range r.Tools {
		if err := ValidateID(tool.ID); err != nil {
			return err
		}
		if i > 0 && r.Tools[i-1].ID >= tool.ID {
			return fmt.Errorf("tombstones must be sorted and unique")
		}
		if err := validateText("retirement reason", tool.Reason, 1, 0); err != nil {
			return err
		}
		if tool.ReplacementID != nil {
			if err := ValidateID(*tool.ReplacementID); err != nil {
				return err
			}
			if *tool.ReplacementID == tool.ID {
				return fmt.Errorf("retired ID cannot replace itself")
			}
		}
	}
	return nil
}

func (index Index) Validate(categories CategoryRegistry, tombstones TombstoneRegistry) error {
	if err := validateSchema(index.SchemaVersion); err != nil {
		return err
	}
	if err := categories.Validate(); err != nil {
		return err
	}
	if err := tombstones.Validate(); err != nil {
		return err
	}
	for i, entry := range index.Entries {
		if i > 0 && index.Entries[i-1].ID >= entry.ID {
			return fmt.Errorf("index entries must be sorted and unique")
		}
		if slices.ContainsFunc(tombstones.Tools, func(t Tombstone) bool { return t.ID == entry.ID }) {
			return fmt.Errorf("retired ID %q is active", entry.ID)
		}
		if err := entry.Validate(categories); err != nil {
			return fmt.Errorf("index entry %q: %w", entry.ID, err)
		}
	}
	return nil
}

func (entry IndexEntry) Validate(categories CategoryRegistry) error {
	expected, err := SourcePath(entry.ID)
	if err != nil {
		return err
	}
	if entry.SourcePath != expected {
		return fmt.Errorf("incorrect source path %q, expected %q", entry.SourcePath, expected)
	}
	if err := validateText("display name", entry.DisplayName, 1, 80); err != nil {
		return err
	}
	if err := validateText("description", entry.Description, 1, 280); err != nil {
		return err
	}
	if err := (ToolMetadata{Categories: entry.Categories}).validateCategories(categories); err != nil {
		return err
	}
	if err := entry.Detail.Validate(maxDetailBytes); err != nil {
		return err
	}
	if !slices.Contains([]string{"verified", "partial", "failed", "stale", "unverified"}, entry.VerificationStatus) {
		return fmt.Errorf("invalid verification status %q", entry.VerificationStatus)
	}
	names := make([]string, len(entry.Definitions))
	for i, definition := range entry.Definitions {
		names[i] = definition.Name
		if err := definition.Validate(); err != nil {
			return err
		}
	}
	return validateDefinitions(names)
}

func (definition IndexDefinition) Validate() error {
	if !hashPattern.MatchString(definition.Revision) {
		return fmt.Errorf("invalid definition revision %q", definition.Revision)
	}
	if err := validateVersion(definition.MinimumCLIVersion); err != nil {
		return err
	}
	targets := make([]Target, len(definition.Summaries))
	for i, summary := range definition.Summaries {
		targets[i] = summary.Target
		if err := validateMethod(summary.InstallationMethod); err != nil {
			return err
		}
	}
	if err := validateTargets(targets); err != nil {
		return err
	}
	for i, check := range definition.Verification {
		if !slices.Contains(targets, check.Target) {
			return fmt.Errorf("verification target is not supported")
		}
		if i > 0 && targetKey(definition.Verification[i-1].Target) >= targetKey(check.Target) {
			return fmt.Errorf("index verification must contain one sorted latest check per target")
		}
		if err := validateCheck(check); err != nil {
			return err
		}
	}
	return nil
}

func validateCheck(check IndexVerification) error {
	if !slices.Contains([]CheckOutcome{"passed", "failed", "unavailable"}, check.Outcome) {
		return fmt.Errorf("unknown check outcome %q", check.Outcome)
	}
	if err := validateTimestamp(check.CheckedAt); err != nil {
		return err
	}
	if check.LastSuccessfulCheck != nil {
		if err := validateTimestamp(*check.LastSuccessfulCheck); err != nil {
			return err
		}
		checked, _ := time.Parse(time.RFC3339Nano, check.CheckedAt)               // validated above
		successful, _ := time.Parse(time.RFC3339Nano, *check.LastSuccessfulCheck) // validated above
		if successful.After(checked) {
			return fmt.Errorf("successful check follows latest check")
		}
	}
	if check.Outcome == "passed" && (check.LastSuccessfulCheck == nil || !sameTimestamp(*check.LastSuccessfulCheck, check.CheckedAt)) {
		return fmt.Errorf("passed check must record its exact successful timestamp")
	}
	return nil
}

func sameTimestamp(a, b string) bool {
	left, leftErr := time.Parse(time.RFC3339Nano, a)
	right, rightErr := time.Parse(time.RFC3339Nano, b)
	return leftErr == nil && rightErr == nil && left.Equal(right)
}

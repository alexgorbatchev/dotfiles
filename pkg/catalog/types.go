// Package catalog owns catalog wire validation and static tool discovery.
package catalog

type Target struct {
	Platform     string `json:"platform"`
	Architecture string `json:"architecture"`
	Libc         string `json:"libc"`
}

type Maintainer struct {
	GitHub string `json:"github"`
}

type DefinitionMetadata struct {
	Name              string   `json:"name"`
	Description       string   `json:"description"`
	MinimumCLIVersion string   `json:"minimumCliVersion"`
	SupportedTargets  []Target `json:"supportedTargets"`
}

type ToolMetadata struct {
	SchemaVersion int                  `json:"schemaVersion"`
	ID            string               `json:"id"`
	DisplayName   string               `json:"displayName"`
	Description   string               `json:"description"`
	Categories    []string             `json:"categories"`
	UpstreamURL   string               `json:"upstreamUrl"`
	Maintainers   []Maintainer         `json:"maintainers"`
	License       string               `json:"license"`
	AssetLicenses []AssetLicense       `json:"assetLicenses"`
	Definitions   []DefinitionMetadata `json:"definitions"`
}

type AssetLicense struct {
	Path      string  `json:"path"`
	License   string  `json:"license"`
	SourceURL *string `json:"sourceUrl"`
}

type Category struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Description string `json:"description"`
}

type CategoryRegistry struct {
	SchemaVersion int        `json:"schemaVersion"`
	Categories    []Category `json:"categories"`
}

type BlobRef struct {
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
}

type BundleFile struct {
	Path   string  `json:"path"`
	Blob   BlobRef `json:"blob"`
	Mode   string  `json:"mode"`
	IsText bool    `json:"isText"`
}

type BinarySummary struct {
	Name    string `json:"name"`
	HasShim bool   `json:"hasShim"`
}

type ConfigurationKind string

type ConfigurationSummary struct {
	Kind   ConfigurationKind `json:"kind"`
	Target string            `json:"target"`
	Source *string           `json:"source"`
	Detail string            `json:"detail"`
}

type TargetSummary struct {
	Target                      Target                 `json:"target"`
	InstallationMethod          *string                `json:"installationMethod"`
	RequestedSoftwareVersion    *string                `json:"requestedSoftwareVersion"`
	HasDynamicInstallParameters bool                   `json:"hasDynamicInstallParameters"`
	Binaries                    []BinarySummary        `json:"binaries"`
	Dependencies                []string               `json:"dependencies"`
	Configuration               []ConfigurationSummary `json:"configuration"`
	Hooks                       []string               `json:"hooks"`
	RequiresElevation           bool                   `json:"requiresElevation"`
}

type DefinitionManifest struct {
	SchemaVersion     int             `json:"schemaVersion"`
	ID                string          `json:"id"`
	Name              string          `json:"name"`
	MinimumCLIVersion string          `json:"minimumCliVersion"`
	SupportedTargets  []Target        `json:"supportedTargets"`
	Files             []BundleFile    `json:"files"`
	Summaries         []TargetSummary `json:"summaries"`
}

type DefinitionRef struct {
	Name     string  `json:"name"`
	Revision string  `json:"revision"`
	Manifest BlobRef `json:"manifest"`
}

type ToolDetail struct {
	SchemaVersion int                 `json:"schemaVersion"`
	SourceCommit  string              `json:"sourceCommit"`
	SourcePath    string              `json:"sourcePath"`
	Metadata      ToolMetadata        `json:"metadata"`
	Definitions   []DefinitionRef     `json:"definitions"`
	Verification  []VerificationCheck `json:"verification"`
}

type CheckOutcome string

type VerificationCheck struct {
	Definition               string                   `json:"definition"`
	DefinitionRevision       string                   `json:"definitionRevision"`
	Target                   Target                   `json:"target"`
	CheckedAt                string                   `json:"checkedAt"`
	Outcome                  CheckOutcome             `json:"outcome"`
	LastSuccessfulCheck      *string                  `json:"lastSuccessfulCheck"`
	RunnerImage              string                   `json:"runnerImage"`
	CLIVersion               string                   `json:"cliVersion"`
	InstalledSoftwareVersion *string                  `json:"installedSoftwareVersion"`
	DescriptorDigest         string                   `json:"descriptorDigest"`
	Dependencies             []VerificationDependency `json:"dependencies"`
	LogURL                   string                   `json:"logUrl"`
}

type VerificationDependency struct {
	ProviderID string `json:"providerId"`
	Definition string `json:"definition"`
	Revision   string `json:"revision"`
}

type IndexDefinition struct {
	Name              string              `json:"name"`
	Revision          string              `json:"revision"`
	MinimumCLIVersion string              `json:"minimumCliVersion"`
	Summaries         []IndexTarget       `json:"summaries"`
	Verification      []IndexVerification `json:"verification"`
}

type IndexVerification struct {
	Target              Target       `json:"target"`
	Outcome             CheckOutcome `json:"outcome"`
	CheckedAt           string       `json:"checkedAt"`
	LastSuccessfulCheck *string      `json:"lastSuccessfulCheck"`
}

type IndexTarget struct {
	Target             Target  `json:"target"`
	InstallationMethod *string `json:"installationMethod"`
}

type IndexEntry struct {
	ID                 string            `json:"id"`
	DisplayName        string            `json:"displayName"`
	Description        string            `json:"description"`
	Categories         []string          `json:"categories"`
	SourcePath         string            `json:"sourcePath"`
	Detail             BlobRef           `json:"detail"`
	Definitions        []IndexDefinition `json:"definitions"`
	VerificationStatus string            `json:"verificationStatus"`
}

type Index struct {
	SchemaVersion int          `json:"schemaVersion"`
	Entries       []IndexEntry `json:"entries"`
}

type Tombstone struct {
	ID            string  `json:"id"`
	Reason        string  `json:"reason"`
	ReplacementID *string `json:"replacementId"`
}

type TombstoneRegistry struct {
	SchemaVersion int         `json:"schemaVersion"`
	Tools         []Tombstone `json:"tools"`
}

type SnapshotPayload struct {
	SchemaVersion        int     `json:"schemaVersion"`
	SourceCommit         string  `json:"sourceCommit"`
	GeneratedAt          string  `json:"generatedAt"`
	MinimumReaderVersion int     `json:"minimumReaderVersion"`
	Index                BlobRef `json:"index"`
	Categories           BlobRef `json:"categories"`
	Tombstones           BlobRef `json:"tombstones"`
}

type Pointer struct {
	SchemaVersion int     `json:"schemaVersion"`
	Snapshot      BlobRef `json:"snapshot"`
}

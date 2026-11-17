package catalog

import (
	"fmt"
	"net/url"
	"path"
	"regexp"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"golang.org/x/mod/semver"
)

const (
	schemaVersion      = 1
	maxDefinitions     = 16
	maxTargets         = 12
	maxBundleFiles     = 256
	maxDefinitionBytes = 20 << 20
	maxAssetBytes      = 5 << 20
	maxTypeScriptBytes = 256 << 10
	maxManifestBytes   = 256 << 10
)

var (
	idPattern     = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$`)
	hashPattern   = regexp.MustCompile(`^[a-f0-9]{64}$`)
	commitPattern = regexp.MustCompile(`^[a-f0-9]{40}$`)
	handlePattern = regexp.MustCompile(`^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$`)
)

func ValidateID(id string) error {
	if !idPattern.MatchString(id) || reservedName(id) {
		return fmt.Errorf("invalid catalog ID %q", id)
	}
	return nil
}

func reservedName(name string) bool {
	base := strings.ToLower(strings.SplitN(name, ".", 2)[0])
	if slices.Contains([]string{"con", "prn", "aux", "nul"}, base) {
		return true
	}
	return len(base) == 4 && (strings.HasPrefix(base, "com") || strings.HasPrefix(base, "lpt")) && base[3] >= '1' && base[3] <= '9'
}

func SourcePath(id string) (string, error) {
	if err := ValidateID(id); err != nil {
		return "", err
	}
	second := "_"
	if len(id) > 1 {
		second = id[1:2]
	}
	return "tools/" + id[:1] + "/" + second + "/" + id, nil
}

func validateSchema(version int) error {
	if version != schemaVersion {
		return fmt.Errorf("unsupported catalog schema version %d", version)
	}
	return nil
}

func validateVersion(version string) error {
	v := "v" + strings.TrimPrefix(version, "v")
	if !semver.IsValid(v) || semver.Canonical(v) != v || strings.Count(strings.SplitN(v, "-", 2)[0], ".") != 2 {
		return fmt.Errorf("CLI version %q must be an exact semantic version", version)
	}
	return nil
}

func validateHTTPS(raw string) error {
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("invalid HTTPS URL: %w", err)
	}
	if u.Scheme != "https" || u.Hostname() == "" || u.User != nil || u.Opaque != "" {
		return fmt.Errorf("URL %q must be absolute HTTPS without credentials", raw)
	}
	return nil
}

func validateTimestamp(value string) error {
	_, err := time.Parse(time.RFC3339Nano, value)
	if err != nil || !strings.HasSuffix(value, "Z") {
		return fmt.Errorf("timestamp %q must be UTC RFC 3339", value)
	}
	return nil
}

func validateText(label, value string, min, max int) error {
	n := utf8.RuneCountInString(value)
	if !utf8.ValidString(value) || n < min || (max > 0 && n > max) || strings.ContainsRune(value, 0) {
		return fmt.Errorf("%s must contain %d–%d valid characters", label, min, max)
	}
	return nil
}

func (t Target) Validate() error {
	if !slices.Contains([]string{"linux", "macos", "windows"}, t.Platform) || !slices.Contains([]string{"amd64", "arm64"}, t.Architecture) {
		return fmt.Errorf("invalid catalog target %+v", t)
	}
	if t.Platform == "linux" {
		if t.Libc != "gnu" && t.Libc != "musl" {
			return fmt.Errorf("Linux target requires gnu or musl libc")
		}
	} else if t.Libc != "unknown" {
		return fmt.Errorf("non-Linux target requires unknown libc")
	}
	return nil
}

func targetKey(t Target) string { return t.Platform + "/" + t.Architecture + "/" + t.Libc }

func validateTargets(targets []Target) error {
	if len(targets) < 1 || len(targets) > maxTargets {
		return fmt.Errorf("definition requires 1–%d targets", maxTargets)
	}
	for i, target := range targets {
		if err := target.Validate(); err != nil {
			return err
		}
		if i > 0 && targetKey(targets[i-1]) >= targetKey(target) {
			return fmt.Errorf("targets must be sorted and unique")
		}
	}
	return nil
}

func sortedStrings(values []string, label string) error {
	for i, v := range values {
		if v == "" || (i > 0 && values[i-1] >= v) {
			return fmt.Errorf("%s must be sorted, nonempty and unique", label)
		}
	}
	return nil
}

func definitionKey(name string) string {
	if name == "default" {
		return ""
	}
	return name
}

func validateDefinitions(names []string) error {
	if len(names) < 1 || len(names) > maxDefinitions || names[0] != "default" {
		return fmt.Errorf("definitions require default first and at most %d names", maxDefinitions)
	}
	for i, name := range names {
		if err := ValidateID(name); err != nil {
			return err
		}
		if i > 0 && definitionKey(names[i-1]) >= definitionKey(name) {
			return fmt.Errorf("definitions must be sorted and unique")
		}
	}
	return nil
}

func (b BlobRef) Validate(limit int64) error {
	if !hashPattern.MatchString(b.SHA256) || b.Size < 0 || (limit > 0 && b.Size > limit) {
		return fmt.Errorf("invalid blob reference %s (%d bytes)", b.SHA256, b.Size)
	}
	return nil
}

func validatePath(value string) error {
	if value == "" || path.IsAbs(value) || path.Clean(value) != value || strings.ContainsAny(value, "\\:\x00") {
		return fmt.Errorf("unsafe relative catalog path %q", value)
	}
	for _, segment := range strings.Split(value, "/") {
		if segment == ".." || segment == "." || reservedName(segment) || strings.HasSuffix(segment, ".") || strings.HasSuffix(segment, " ") {
			return fmt.Errorf("unsafe catalog path component %q", segment)
		}
	}
	return nil
}

func validateMethod(method *string) error {
	if method != nil && !slices.Contains(config.InstallMethods(), *method) {
		return fmt.Errorf("unknown installation method %q", *method)
	}
	return nil
}

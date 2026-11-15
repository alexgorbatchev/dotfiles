package config

import (
	"fmt"
	"slices"
	"sort"
	"strings"
	"testing"
)

// acceptedProjectKeys walks the validator's section and child allow-lists. Known
// objects are expanded explicitly; any new section or features child fails until
// its expansion is defined, so an accepted object cannot be silently omitted.
// Keys are dotted paths as a user writes them, such as "downloader.cache.ttl".
func acceptedProjectKeys(t *testing.T) []string {
	t.Helper()
	host := func(prefix string) []string {
		allowed := hostKeys
		if prefix == "cargo.cratesIo" || prefix == "cargo.githubRaw" {
			allowed = cargoHostKeys
		} else if prefix == "cargo.githubRelease" {
			allowed = cargoReleaseHostKeys
		}
		var keys []string
		for _, k := range allowed {
			if k == "cache" {
				for _, c := range cacheKeys {
					keys = append(keys, prefix+".cache."+c)
				}
				continue
			}
			keys = append(keys, prefix+"."+k)
		}
		return keys
	}

	var keys []string
	appendLeaves := func(prefix string, leaves []string) {
		for _, leaf := range leaves {
			keys = append(keys, prefix+"."+leaf)
		}
	}
	for _, section := range projectSectionKeys {
		switch section {
		case "paths":
			appendLeaves(section, pathsKeys)
		case "system":
			appendLeaves(section, systemKeys)
		case "github":
			keys = append(keys, host(section)...)
		case "cargo":
			for _, key := range cargoKeys {
				if slices.Contains(cargoSubHosts, key) {
					keys = append(keys, host(section+"."+key)...)
					continue
				}
				keys = append(keys, section+"."+key)
			}
		case "downloader":
			for _, key := range downloaderKeys {
				if key == "cache" {
					appendLeaves(section+".cache", cacheKeys)
					continue
				}
				keys = append(keys, section+"."+key)
			}
		case "features":
			for _, child := range featuresKeys {
				switch child {
				case "catalog":
					appendLeaves(section+"."+child, catalogKeys)
				case "shellInstall":
					appendLeaves(section+"."+child, shellInstallKeys)
				default:
					t.Fatalf("acceptedProjectKeys has no expansion for accepted configuration object %q", section+"."+child)
				}
			}
		case "ai":
			appendLeaves(section, aiKeys)
		default:
			t.Fatalf("acceptedProjectKeys has no expansion for accepted configuration section %q", section)
		}
	}
	return keys
}

// projectConfigConsumers names, for every accepted key, the code that honours it. A
// key whose value is empty changes nothing when it is set, which is a defect: the
// loader would accept a setting and then ignore it.
//
// Adding a key to the validator's allow-list without adding it here fails
// TestEveryAcceptedProjectKeyIsAccountedFor, which is the drift this table exists to
// prevent.
var projectConfigConsumers = map[string]string{
	"paths.homeDir":         "utils.ExpandHomePath and fs.ResolvedFS, for ~ expansion",
	"paths.dotfilesDir":     "ProjectConfig.ResolvePlaceholders, the root generatedDir hangs off",
	"paths.targetDir":       "orchestrator shim generation",
	"paths.generatedDir":    "every path the CLI writes, including the registry database",
	"paths.toolConfigsDir":  "PathsConfig.GetToolConfigsDirs, resolved by ProjectConfig.ResolvePlaceholders",
	"paths.shellScriptsDir": "shellinit script generation",
	"paths.binariesDir":     "orchestrator install pipeline staging and promotion",

	"system.sudoPrompt": "installer sudo elevation (sudo -p)",

	"github.host":          "installer.GitHubSettings.Host, the release API root of github-release, dmg, pkg and cargo, and the dashboard README lookup",
	"github.token":         "installer.GitHubSettings.Token and the dashboard README lookup, both through github.Token",
	"github.userAgent":     "installer.GitHubSettings.UserAgent, githubReleaseClient.agent",
	"github.cache.enabled": "installer.GitHubSettings.CacheEnabled, GitHubInstaller release metadata cache",
	"github.cache.ttl":     "orchestrator install pipeline, GitHubInstaller.CacheTTL",

	"downloader.timeout":       "orchestrator downloadSettings, downloader.Settings.Timeout",
	"downloader.retryCount":    "orchestrator downloadSettings, downloader.Settings.RetryCount",
	"downloader.retryDelay":    "orchestrator downloadSettings, downloader.Settings.RetryDelay",
	"downloader.pruneCache":    "orchestrator finishDownloadCache, downloader.PruningEnabled",
	"downloader.cache.enabled": "orchestrator downloadSettings, downloader.Settings.CacheEnabled",
	"downloader.cache.ttl":     "orchestrator downloadSettings, downloader.Settings.CacheTTL",

	"features.shellInstall.zsh":        "shellinit profile injection",
	"features.shellInstall.bash":       "shellinit profile injection",
	"features.shellInstall.powershell": "shellinit profile injection",

	// Accepted by the configuration loader, but no command writes a catalog file.
	"features.catalog.generate": "",
	"features.catalog.filePath": "",

	"ai.harness": "harness.Argv, the command tool make runs",

	"cargo.userAgent":               "installer.CargoSettings.UserAgent, sent with crates.io and Cargo.toml requests",
	"cargo.cratesIo.host":           "installer.CargoSettings.CratesIO.Host, the crates.io site root CargoInstaller queries under /api/v1/crates",
	"cargo.cratesIo.token":          "installer.CargoSettings.CratesIO.Token, the Authorization header of crates.io API requests",
	"cargo.cratesIo.cache.enabled":  "installer.CargoSettings.CratesIOCache.Enabled, CargoInstaller crates.io response cache",
	"cargo.cratesIo.cache.ttl":      "installer.CargoSettings.CratesIOCache.TTL, CargoInstaller crates.io response cache",
	"cargo.githubRaw.host":          "installer.CargoSettings.GitHubRaw.Host, the host CargoInstaller reads a githubRepo's Cargo.toml from",
	"cargo.githubRaw.token":         "installer.CargoSettings.GitHubRaw.Token, authenticates Cargo.toml fetches from that host",
	"cargo.githubRaw.cache.enabled": "installer.CargoSettings.GitHubRawCache.Enabled, CargoInstaller Cargo.toml response cache",
	"cargo.githubRaw.cache.ttl":     "installer.CargoSettings.GitHubRawCache.TTL, CargoInstaller Cargo.toml response cache",
	"cargo.githubRelease.host":      "installer.CargoSettings.GitHubRelease.Host, the host of quickinstall and github-releases archive downloads",
	"cargo.githubRelease.token":     "installer.CargoSettings.GitHubRelease.Token, authenticates those archive downloads",
}

// keysAwaitingImplementation are public keys intentionally retained for a
// replacement Markdown catalog generator. They have no consumer today. The test
// below pins that exception until the generator implements them; new inert keys
// must not enter this list without an explicit configuration-surface decision.
var keysAwaitingImplementation = []string{
	"features.catalog.filePath",
	"features.catalog.generate",
}

// TestEveryAcceptedProjectKeyIsAccountedFor fails when the validator accepts a key
// that no code honours, which is how a configuration comes to load without complaint
// and behave exactly as before. A new key must either name its consumer in
// projectConfigConsumers or be admitted to keysAwaitingImplementation deliberately.
func TestEveryAcceptedProjectKeyIsAccountedFor(t *testing.T) {
	accepted := acceptedProjectKeys(t)

	t.Run("every accepted key names a consumer or is awaiting implementation", func(t *testing.T) {
		var undeclared, unconsumed []string
		for _, key := range accepted {
			consumer, declared := projectConfigConsumers[key]
			if !declared {
				undeclared = append(undeclared, key)
				continue
			}
			if consumer == "" && !slices.Contains(keysAwaitingImplementation, key) {
				unconsumed = append(unconsumed, key)
			}
		}
		if len(undeclared) > 0 {
			sort.Strings(undeclared)
			t.Errorf("the validator accepts keys that projectConfigConsumers does not describe: %s\n"+
				"wire each one to the code that should honour it, or delete it from the allow-list, ProjectConfig, pkg/vm/dsl-types.ts and the documentation",
				strings.Join(undeclared, ", "))
		}
		if len(unconsumed) > 0 {
			sort.Strings(unconsumed)
			t.Errorf("these accepted keys have no consumer and are not listed in keysAwaitingImplementation: %s", strings.Join(unconsumed, ", "))
		}
	})

	t.Run("the consumer table describes nothing the validator rejects", func(t *testing.T) {
		for key := range projectConfigConsumers {
			if !slices.Contains(accepted, key) {
				t.Errorf("projectConfigConsumers describes %q, which the validator does not accept", key)
			}
		}
	})

	t.Run("keysAwaitingImplementation holds exactly the keys with no consumer", func(t *testing.T) {
		for _, key := range keysAwaitingImplementation {
			consumer, declared := projectConfigConsumers[key]
			if !declared {
				t.Errorf("keysAwaitingImplementation holds %q, which projectConfigConsumers does not describe", key)
				continue
			}
			if consumer != "" {
				t.Errorf("%q now has a consumer (%s) and must be removed from keysAwaitingImplementation", key, consumer)
			}
		}
	})

	t.Run("every accepted key really is accepted", func(t *testing.T) {
		for _, key := range accepted {
			if err := ValidateProjectConfigRawJSON([]byte(nestedJSON(key))); err != nil {
				t.Errorf("ValidateProjectConfigRawJSON rejected %q: %v", key, err)
			}
		}
	})
}

// nestedJSON renders a dotted key path as the nested JSON document that sets it, so
// the table above is checked against the validator rather than against itself.
func nestedJSON(key string) string {
	segments := strings.Split(key, ".")
	doc := "null"
	for i := len(segments) - 1; i >= 0; i-- {
		doc = fmt.Sprintf("{%q:%s}", segments[i], doc)
	}
	return doc
}

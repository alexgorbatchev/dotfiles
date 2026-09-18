package config

import (
	"fmt"
	"slices"
	"sort"
	"strings"
	"testing"
)

// acceptedProjectKeys returns every key path a project configuration may set,
// derived from the same allow-lists the validator enforces so the two cannot drift
// apart. Keys are dotted paths as a user writes them, such as
// "downloader.cache.ttl".
func acceptedProjectKeys() []string {
	host := func(prefix string) []string {
		var keys []string
		for _, k := range hostKeys {
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
	for _, k := range pathsKeys {
		keys = append(keys, "paths."+k)
	}
	for _, k := range systemKeys {
		keys = append(keys, "system."+k)
	}
	for _, k := range loggingKeys {
		keys = append(keys, "logging."+k)
	}
	for _, k := range updatesKeys {
		keys = append(keys, "updates."+k)
	}
	keys = append(keys, host("github")...)
	for _, k := range cargoKeys {
		if slices.Contains(cargoHostKeys, k) {
			keys = append(keys, host("cargo."+k)...)
			continue
		}
		keys = append(keys, "cargo."+k)
	}
	for _, k := range downloaderKeys {
		if k == "cache" {
			for _, c := range cacheKeys {
				keys = append(keys, "downloader.cache."+c)
			}
			continue
		}
		keys = append(keys, "downloader."+k)
	}
	for _, k := range catalogKeys {
		keys = append(keys, "features.catalog."+k)
	}
	for _, k := range shellInstallKeys {
		keys = append(keys, "features.shellInstall."+k)
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

	"github.host":          "orchestrator install pipeline, GitHubInstaller.BaseURL",
	"github.token":         "installer.GitHubSettings.Token, githubToken",
	"github.userAgent":     "installer.GitHubSettings.UserAgent, githubReleaseClient.agent",
	"github.cache.enabled": "installer.GitHubSettings.CacheEnabled, GitHubInstaller release metadata cache",
	"github.cache.ttl":     "orchestrator install pipeline, GitHubInstaller.CacheTTL",

	"downloader.timeout":       "orchestrator downloadSettings, downloader.Settings.Timeout",
	"downloader.retryCount":    "orchestrator downloadSettings, downloader.Settings.RetryCount",
	"downloader.retryDelay":    "orchestrator downloadSettings, downloader.Settings.RetryDelay",
	"downloader.cache.enabled": "orchestrator downloadSettings, downloader.Settings.CacheEnabled",
	"downloader.cache.ttl":     "orchestrator downloadSettings, downloader.Settings.CacheTTL",

	"features.shellInstall.zsh":        "shellinit profile injection",
	"features.shellInstall.bash":       "shellinit profile injection",
	"features.shellInstall.powershell": "shellinit profile injection",

	// Reported by `dotfiles features`, but no command writes a catalog file.
	"features.catalog.generate": "",
	"features.catalog.filePath": "",

	// Carried over from the v1 schema, where they had no consumer either. The
	// log level is set with --log, -v and -q instead.
	"logging.debug":                     "",
	"updates.checkOnRun":                "",
	"updates.checkInterval":             "",
	"cargo.userAgent":                   "",
	"cargo.cratesIo.host":               "",
	"cargo.cratesIo.token":              "",
	"cargo.cratesIo.userAgent":          "",
	"cargo.cratesIo.cache.enabled":      "",
	"cargo.cratesIo.cache.ttl":          "",
	"cargo.githubRaw.host":              "",
	"cargo.githubRaw.token":             "",
	"cargo.githubRaw.userAgent":         "",
	"cargo.githubRaw.cache.enabled":     "",
	"cargo.githubRaw.cache.ttl":         "",
	"cargo.githubRelease.host":          "",
	"cargo.githubRelease.token":         "",
	"cargo.githubRelease.userAgent":     "",
	"cargo.githubRelease.cache.enabled": "",
	"cargo.githubRelease.cache.ttl":     "",
}

// keysAwaitingRemoval are the accepted keys that change nothing today. Every one of
// them is a documented public configuration key, so removing it is an API change
// that the project owner has to approve; until then this set records exactly which
// keys are in that state, and the test below fails if the set and the consumer table
// disagree. It is expected to end up empty.
var keysAwaitingRemoval = []string{
	"cargo.cratesIo.cache.enabled",
	"cargo.cratesIo.cache.ttl",
	"cargo.cratesIo.host",
	"cargo.cratesIo.token",
	"cargo.cratesIo.userAgent",
	"cargo.githubRaw.cache.enabled",
	"cargo.githubRaw.cache.ttl",
	"cargo.githubRaw.host",
	"cargo.githubRaw.token",
	"cargo.githubRaw.userAgent",
	"cargo.githubRelease.cache.enabled",
	"cargo.githubRelease.cache.ttl",
	"cargo.githubRelease.host",
	"cargo.githubRelease.token",
	"cargo.githubRelease.userAgent",
	"cargo.userAgent",
	"features.catalog.filePath",
	"features.catalog.generate",
	"logging.debug",
	"updates.checkInterval",
	"updates.checkOnRun",
}

// TestEveryAcceptedProjectKeyIsAccountedFor fails when the validator accepts a key
// that no code honours, which is how a configuration comes to load without complaint
// and behave exactly as before. A new key must either name its consumer in
// projectConfigConsumers or be admitted to keysAwaitingRemoval deliberately.
func TestEveryAcceptedProjectKeyIsAccountedFor(t *testing.T) {
	accepted := acceptedProjectKeys()

	t.Run("every accepted key names a consumer or is awaiting removal", func(t *testing.T) {
		var undeclared, unconsumed []string
		for _, key := range accepted {
			consumer, declared := projectConfigConsumers[key]
			if !declared {
				undeclared = append(undeclared, key)
				continue
			}
			if consumer == "" && !slices.Contains(keysAwaitingRemoval, key) {
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
			t.Errorf("these accepted keys have no consumer and are not listed in keysAwaitingRemoval: %s", strings.Join(unconsumed, ", "))
		}
	})

	t.Run("the consumer table describes nothing the validator rejects", func(t *testing.T) {
		for key := range projectConfigConsumers {
			if !slices.Contains(accepted, key) {
				t.Errorf("projectConfigConsumers describes %q, which the validator does not accept", key)
			}
		}
	})

	t.Run("keysAwaitingRemoval holds exactly the keys with no consumer", func(t *testing.T) {
		for _, key := range keysAwaitingRemoval {
			consumer, declared := projectConfigConsumers[key]
			if !declared {
				t.Errorf("keysAwaitingRemoval holds %q, which projectConfigConsumers does not describe", key)
				continue
			}
			if consumer != "" {
				t.Errorf("%q now has a consumer (%s) and must be removed from keysAwaitingRemoval", key, consumer)
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

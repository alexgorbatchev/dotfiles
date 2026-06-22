package logger

import "fmt"

// Message represents a type-safe branded log message string.
type Message string

func (m Message) String() string {
	return string(m)
}

// Messages acts as the single source of truth for all logged events.
var Messages = struct {
	PluginAlreadyRegistered  func(method string) Message
	PluginRegistered         func(method, displayName, version string) Message
	PluginRegistrationFailed func(method string) Message
	SchemasComposed          func(count int, methods string) Message
	NoPluginForMethod        func(method, availableMethods string) Message
	PluginValidationFailed   func(errors string) Message
	ValidationFailed         func(method, errors string) Message
	ValidationWarning        func(method, warning string) Message
	DelegatingToPlatform     func(platform string) Message
	ValidationCacheCleared   func() Message
	CleaningUpPlugins        func() Message
	PluginCleanedUp          func(method string) Message
	PluginCleanupFailed      func(method string) Message
	PluginCleanupComplete    func() Message
	ReplaceInFileNoMatch     func(pattern, filePath string) Message
	ResolveNoMatches         func(pattern string) Message
	ResolveMultipleMatches   func(pattern string, count int, matches string) Message
	CommandCompleted         func(dryRun bool) Message
	CommandExecutionFailed   func(cmd string, code int) Message
	ToolUpToDate             func(name, local, remote string) Message
	ToolConfiguredToLatest   func(name, remote string) Message
	ToolUpdateFailed         func(name, reason string) Message
	ToolShimUpToDate         func(name, version string) Message
	ServiceGithubApiFailed   func(service string, code int) Message
	ConfigLoadFailed         func(target string) Message
	ToolNotInstalled         func(name string) Message
	NoConflictsDetected      func() Message
	ConflictsDetected        func(count int) Message
}{
	PluginAlreadyRegistered: func(method string) Message {
		return Message(fmt.Sprintf("Plugin %s is already registered, replacing...", method))
	},
	PluginRegistered: func(method, displayName, version string) Message {
		return Message(fmt.Sprintf("Registered installer plugin: %s (%s v%s)", method, displayName, version))
	},
	PluginRegistrationFailed: func(method string) Message {
		return Message(fmt.Sprintf("Failed to register plugin %s", method))
	},
	SchemasComposed: func(count int, methods string) Message {
		return Message(fmt.Sprintf("Composed schemas from %d plugins: %s", count, methods))
	},
	NoPluginForMethod: func(method, availableMethods string) Message {
		return Message(fmt.Sprintf("No plugin registered for installation method: %s. Available methods: %s", method, availableMethods))
	},
	PluginValidationFailed: func(errors string) Message {
		return Message(fmt.Sprintf("Plugin validation failed: %s", errors))
	},
	ValidationFailed: func(method, errors string) Message {
		return Message(fmt.Sprintf("Plugin validation failed for %s: %s", method, errors))
	},
	ValidationWarning: func(method, warning string) Message {
		return Message(fmt.Sprintf("Validation warning for %s: %s", method, warning))
	},
	DelegatingToPlatform: func(platform string) Message {
		return Message(fmt.Sprintf("Delegating installation to plugin: %s", platform))
	},
	ValidationCacheCleared: func() Message {
		return Message("Validation cache cleared")
	},
	CleaningUpPlugins: func() Message {
		return Message("Cleaning up plugins...")
	},
	PluginCleanedUp: func(method string) Message {
		return Message(fmt.Sprintf("Cleaned up plugin: %s", method))
	},
	PluginCleanupFailed: func(method string) Message {
		return Message(fmt.Sprintf("Failed to cleanup plugin %s", method))
	},
	PluginCleanupComplete: func() Message {
		return Message("Plugin cleanup complete")
	},
	ReplaceInFileNoMatch: func(pattern, filePath string) Message {
		return Message(fmt.Sprintf("Could not find '%s' in %s", pattern, filePath))
	},
	ResolveNoMatches: func(pattern string) Message {
		return Message(fmt.Sprintf("No matches found for pattern: %s", pattern))
	},
	ResolveMultipleMatches: func(pattern string, count int, matches string) Message {
		return Message(fmt.Sprintf("Pattern '%s' matched %d paths (expected exactly 1): %s", pattern, count, matches))
	},
	CommandCompleted: func(dryRun bool) Message {
		if dryRun {
			return Message("Command completed successfully (dry-run)")
		}
		return Message("Command completed successfully")
	},
	CommandExecutionFailed: func(cmd string, code int) Message {
		return Message(fmt.Sprintf("Command '%s' execution failed with code %d", cmd, code))
	},
	ToolUpToDate: func(name, local, remote string) Message {
		return Message(fmt.Sprintf("Tool %s is up-to-date (local: %s, remote: %s)", name, local, remote))
	},
	ToolConfiguredToLatest: func(name, remote string) Message {
		return Message(fmt.Sprintf("Tool %s is configured to latest: %s", name, remote))
	},
	ToolUpdateFailed: func(name, reason string) Message {
		return Message(fmt.Sprintf("Failed to update tool %s: %s", name, reason))
	},
	ToolShimUpToDate: func(name, version string) Message {
		return Message(fmt.Sprintf("Shim for %s is already up-to-date (version: %s)", name, version))
	},
	ServiceGithubApiFailed: func(service string, code int) Message {
		return Message(fmt.Sprintf("GitHub API request for service '%s' failed with status code %d", service, code))
	},
	ConfigLoadFailed: func(target string) Message {
		return Message(fmt.Sprintf("Failed to load configuration: %s", target))
	},
	ToolNotInstalled: func(name string) Message {
		return Message(fmt.Sprintf("Tool %s is not installed", name))
	},
	NoConflictsDetected: func() Message {
		return Message("No conflicts detected")
	},
	ConflictsDetected: func(count int) Message {
		return Message(fmt.Sprintf("Detected %d conflict(s)", count))
	},
}

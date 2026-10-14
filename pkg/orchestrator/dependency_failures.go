package orchestrator

import "github.com/alexgorbatchev/dotfiles/pkg/config"

// resolvedDependencyProviders is used after sorting has rejected ambiguity. As in
// the dependency graph, a declared binary takes precedence over a tool's name.
func resolvedDependencyProviders(tools []*config.ToolConfig) map[string]*config.ToolConfig {
	providers := make(map[string]*config.ToolConfig)
	for _, tool := range tools {
		providers[tool.Name] = tool
	}
	for _, tool := range tools {
		for _, bin := range getBinaryNames(tool.Binaries) {
			providers[bin] = tool
		}
	}
	return providers
}

func failedDependency(tool *config.ToolConfig, providers map[string]*config.ToolConfig, failed map[string]bool) string {
	for _, dep := range tool.Dependencies {
		if provider := providers[dep]; provider != nil && failed[provider.Name] {
			return provider.Name
		}
	}
	return ""
}

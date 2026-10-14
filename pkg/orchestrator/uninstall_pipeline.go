package orchestrator

import (
	"context"
	"errors"
	"fmt"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/toolbatch"
)

// UninstallTools removes tools in reverse dependency order, retaining dependencies
// of failed removals and continuing with independent tools before returning failures.
func (o *Orchestrator) UninstallTools(ctx context.Context, tools []*config.ToolConfig, project *config.ProjectConfig) error {
	sorted, err := TopologicalSort(tools)
	if err != nil {
		return err
	}
	providers := resolvedDependencyProviders(sorted)
	blocked := make(map[string]string)
	var failures toolbatch.Failures
	for i := len(sorted) - 1; i >= 0; i-- {
		if err := ctx.Err(); err != nil {
			return errors.Join(failures.Err(), err)
		}
		tool := sorted[i]
		var removeErr error
		if dependent := blocked[tool.Name]; dependent != "" {
			removeErr = fmt.Errorf("Skipping uninstallation: dependent tool %q could not be removed", dependent)
		} else {
			removeErr = o.UninstallTool(ctx, tool, project)
		}
		if removeErr == nil {
			continue
		}
		failures.Record(o.logger, tool.Name, removeErr)
		for _, dep := range tool.Dependencies {
			if provider := providers[dep]; provider != nil {
				blocked[provider.Name] = tool.Name
			}
		}
	}
	return failures.Err()
}

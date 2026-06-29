package config

import (
	"context"
	"os"
)

type contextKey string

const (
	overwriteKey     contextKey = "DOTFILES_OVERWRITE"
	projectConfigKey contextKey = "DOTFILES_PROJECT_CONFIG"
)

// WithProjectConfig returns a new context with the project config set.
func WithProjectConfig(ctx context.Context, cfg *ProjectConfig) context.Context {
	return context.WithValue(ctx, projectConfigKey, cfg)
}

// GetProjectConfig retrieves the project config from the context.
func GetProjectConfig(ctx context.Context) *ProjectConfig {
	if ctx != nil {
		if val, ok := ctx.Value(projectConfigKey).(*ProjectConfig); ok {
			return val
		}
	}
	return nil
}

// WithOverwrite returns a new context with the overwrite flag set.
func WithOverwrite(ctx context.Context, overwrite bool) context.Context {
	return context.WithValue(ctx, overwriteKey, overwrite)
}

// IsOverwriteEnabled checks if overwrite is enabled in the context or fallback environment variable.
func IsOverwriteEnabled(ctx context.Context) bool {
	if ctx != nil {
		if val, ok := ctx.Value(overwriteKey).(bool); ok {
			return val
		}
	}
	return os.Getenv("DOTFILES_OVERWRITE") == "true"
}

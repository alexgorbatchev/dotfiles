package config

import (
	"context"
	"os"
)

type contextKey string

const (
	dryRunKey        contextKey = "DOTFILES_DRY_RUN"
	forceKey         contextKey = "DOTFILES_FORCE"
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

// WithDryRun returns a new context with the dry-run flag set.
func WithDryRun(ctx context.Context, dryRun bool) context.Context {
	return context.WithValue(ctx, dryRunKey, dryRun)
}

// IsDryRunEnabled checks if dry-run is enabled in the context or fallback environment variable.
func IsDryRunEnabled(ctx context.Context) bool {
	if ctx != nil {
		if val, ok := ctx.Value(dryRunKey).(bool); ok {
			return val
		}
	}
	return os.Getenv("DOTFILES_DRY_RUN") == "true"
}

// WithForce returns a new context with the force flag set.
func WithForce(ctx context.Context, force bool) context.Context {
	return context.WithValue(ctx, forceKey, force)
}

// IsForceEnabled checks if force is enabled in the context or fallback environment variable.
func IsForceEnabled(ctx context.Context) bool {
	if ctx != nil {
		if val, ok := ctx.Value(forceKey).(bool); ok {
			return val
		}
	}
	return os.Getenv("DOTFILES_FORCE") == "true"
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

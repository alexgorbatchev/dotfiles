package config

import (
	"context"
	"testing"
)

func TestContextHelpers(t *testing.T) {
	// 1. GetProjectConfig with nil context
	if cfg := GetProjectConfig(nil); cfg != nil {
		t.Errorf("GetProjectConfig(nil) = %v, want nil", cfg)
	}

	// 2. WithProjectConfig and GetProjectConfig
	pCfg := &ProjectConfig{
		Paths: PathsConfig{
			HomeDir: "/home/test",
		},
	}
	ctx := WithProjectConfig(context.Background(), pCfg)
	gotCfg := GetProjectConfig(ctx)
	if gotCfg != pCfg {
		t.Errorf("GetProjectConfig(ctx) = %v, want %v", gotCfg, pCfg)
	}

	// 3. IsOverwriteEnabled with nil context and env
	t.Setenv("DOTFILES_OVERWRITE", "")
	if IsOverwriteEnabled(nil) {
		t.Errorf("IsOverwriteEnabled(nil) = true, want false")
	}

	t.Setenv("DOTFILES_OVERWRITE", "true")
	if !IsOverwriteEnabled(nil) {
		t.Errorf("IsOverwriteEnabled(nil) with env true = false, want true")
	}

	// 4. WithOverwrite and IsOverwriteEnabled
	ctxOverwrite := WithOverwrite(context.Background(), true)
	if !IsOverwriteEnabled(ctxOverwrite) {
		t.Errorf("IsOverwriteEnabled(ctx) = false, want true")
	}

	ctxNoOverwrite := WithOverwrite(context.Background(), false)
	t.Setenv("DOTFILES_OVERWRITE", "true") // Context value overrides env!
	if IsOverwriteEnabled(ctxNoOverwrite) {
		t.Errorf("IsOverwriteEnabled(ctx false) = true, want false")
	}
}

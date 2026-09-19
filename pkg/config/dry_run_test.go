package config

import (
	"context"
	"testing"
)

// TestDryRunContext pins the dry-run flag to the context, alongside force and
// overwrite. The flag used to be recovered by scanning os.Args, which reported
// the flags of whatever process happened to be running rather than the flags of
// the command being executed.
func TestDryRunContext(t *testing.T) {
	tests := []struct {
		name string
		ctx  func() context.Context
		env  string
		want bool
	}{
		{
			name: "absent from context and environment",
			ctx:  func() context.Context { return context.Background() },
			want: false,
		},
		{
			name: "nil context falls back to environment",
			ctx:  func() context.Context { return nil },
			env:  "true",
			want: true,
		},
		{
			name: "enabled on the context",
			ctx:  func() context.Context { return WithDryRun(context.Background(), true) },
			want: true,
		},
		{
			name: "disabled on the context overrides the environment",
			ctx:  func() context.Context { return WithDryRun(context.Background(), false) },
			env:  "true",
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("DOTFILES_DRY_RUN", tt.env)
			if got := IsDryRunEnabled(tt.ctx()); got != tt.want {
				t.Errorf("IsDryRunEnabled() = %v, want %v", got, tt.want)
			}
		})
	}
}

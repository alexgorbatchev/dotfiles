package installer

import (
	"context"
	"errors"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestNpmInstaller(t *testing.T) {
	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	inst := NewNpmInstaller(runner, fsys, nil)

	if inst.Name() != "npm" {
		t.Errorf("expected name to be 'npm', got %s", inst.Name())
	}

	if inst.SupportsSudo() {
		t.Error("expected SupportsSudo() to be false")
	}

	// The version install parameter is the pin config.ToolConfig.RequestedVersion names
	// for npm, and the one update refuses to move, so it must be what npm installs.
	t.Run("the version install parameter wins over .version()", func(t *testing.T) {
		runner.Clear()
		ver := "2.1.0"
		tool := &config.ToolConfig{
			Name:               "prettier",
			InstallationMethod: "npm",
			Version:            &ver,
			InstallParams:      map[string]interface{}{"package": "prettier", "version": "3.0.0"},
		}

		if _, err := inst.Install(context.Background(), tool); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(runner.History) == 0 {
			t.Fatal("expected command to run")
		}
		if cmd := runner.History[0]; cmd.Name != "npm" || len(cmd.Args) != 3 || cmd.Args[2] != "prettier@3.0.0" {
			t.Errorf("command = %s %v, want npm install -g prettier@3.0.0", cmd.Name, cmd.Args)
		}
	})

	t.Run("Install success with npm", func(t *testing.T) {
		runner.Clear()
		ver := "2.1.0"
		tool := &config.ToolConfig{
			Name:    "prettier",
			Version: &ver,
			InstallParams: map[string]interface{}{
				"packageManager": "npm",
				"package":        "prettier",
				"force":          true,
			},
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(res.Binaries) != 1 || res.Binaries[0] != "/usr/local/bin/prettier" {
			t.Errorf("expected [/usr/local/bin/prettier] binaries for npm, got %v", res.Binaries)
		}

		if len(runner.History) == 0 {
			t.Fatal("expected command to run")
		}
		cmd := runner.History[0]
		if cmd.Name != "npm" || cmd.Args[0] != "install" || cmd.Args[1] != "-g" || cmd.Args[2] != "--force" || cmd.Args[3] != "prettier@2.1.0" {
			t.Errorf("unexpected command: %s %v", cmd.Name, cmd.Args)
		}
	})

	t.Run("Install success with bun", func(t *testing.T) {
		runner.Clear()
		tool := &config.ToolConfig{
			Name: "prettier",
			InstallParams: map[string]interface{}{
				"packageManager": "bun",
				"package":        "prettier",
			},
		}

		_, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(runner.History) == 0 {
			t.Fatal("expected command to run")
		}
		cmd := runner.History[0]
		if cmd.Name != "bun" || cmd.Args[0] != "install" || cmd.Args[1] != "-g" || cmd.Args[2] != "prettier" {
			t.Errorf("unexpected command: %s %v", cmd.Name, cmd.Args)
		}
	})

	t.Run("Uninstall success with bun", func(t *testing.T) {
		runner.Clear()
		tool := &config.ToolConfig{
			Name: "prettier",
			InstallParams: map[string]interface{}{
				"packageManager": "bun",
			},
		}

		err := inst.Uninstall(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(runner.History) == 0 {
			t.Fatal("expected command to run")
		}
		cmd := runner.History[0]
		if cmd.Name != "bun" || cmd.Args[0] != "remove" || cmd.Args[1] != "-g" || cmd.Args[2] != "prettier" {
			t.Errorf("unexpected command: %s %v", cmd.Name, cmd.Args)
		}
	})

	t.Run("Install failure", func(t *testing.T) {
		runner.Clear()
		runner.Register("npm", nil, errors.New("npm error"))

		tool := &config.ToolConfig{
			Name: "prettier",
		}

		_, err := inst.Install(context.Background(), tool)
		if err == nil {
			t.Error("expected error but got nil")
		}
	})
}

// TestNpmInstaller_CheckUpdate pins that the latest version is what the registry query
// printed, and that a query which failed or printed nothing is an error naming the
// command, never an empty result that every caller reads as "up to date" (issue #120).
func TestNpmInstaller_CheckUpdate(t *testing.T) {
	bun := map[string]interface{}{"packageManager": "bun"}
	tests := []struct {
		name        string
		params      map[string]interface{}
		command     string
		stdout      string
		stderr      string
		err         error
		wantLatest  string
		wantErrText []string
	}{
		{name: "npm prints the latest version", command: "npm", stdout: "3.9.8\n", wantLatest: "3.9.8"},
		{name: "bun prints the latest version", params: bun, command: "bun", stdout: "3.9.8\n", wantLatest: "3.9.8"},
		{
			name:    "npm fails",
			command: "npm",
			stderr:  "npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/prettier - Not found\n",
			err:     exitStatusError(1),
			wantErrText: []string{
				"running npm view prettier version", "exit status 1", "npm error code E404",
			},
		},
		{
			name:        "bun fails",
			params:      bun,
			command:     "bun",
			stderr:      "404 Not Found: https://registry.npmjs.org/prettier\n",
			err:         exitStatusError(1),
			wantErrText: []string{"running bun pm view prettier version", "404 Not Found"},
		},
		{
			name:        "npm prints nothing",
			command:     "npm",
			stdout:      "\n",
			wantErrText: []string{"running npm view prettier version", "printed no version"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			runner := exec.NewMockRunner()
			registerQuery(runner, tt.command, tt.stdout, tt.stderr, tt.err)
			inst := NewNpmInstaller(runner, fs.NewMemFS(), nil)

			res, err := inst.CheckUpdate(context.Background(), &config.ToolConfig{Name: "prettier", InstallParams: tt.params})
			if len(tt.wantErrText) > 0 {
				assertCheckFailed(t, res, err, tt.wantErrText...)
				return
			}
			if err != nil {
				t.Fatalf("CheckUpdate() error = %v", err)
			}
			if res.LatestVersion != tt.wantLatest || res.Outdated != nil {
				t.Errorf("CheckUpdate() = %+v, want LatestVersion %q and no verdict", res, tt.wantLatest)
			}
		})
	}
}

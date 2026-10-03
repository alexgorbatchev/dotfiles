package installer

import (
	"context"
	"errors"
	"slices"
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
		if cmd := runner.History[0]; cmd.Name != "npm" || len(cmd.Args) != 4 || cmd.Args[2] != "--" || cmd.Args[3] != "prettier@3.0.0" {
			t.Errorf("command = %s %v, want npm install -g -- prettier@3.0.0", cmd.Name, cmd.Args)
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
		if cmd.Name != "npm" || cmd.Args[0] != "install" || cmd.Args[1] != "-g" || cmd.Args[2] != "--force" || cmd.Args[3] != "--" || cmd.Args[4] != "prettier@2.1.0" {
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
		if cmd.Name != "bun" || cmd.Args[0] != "install" || cmd.Args[1] != "-g" || cmd.Args[2] != "--" || cmd.Args[3] != "prettier" {
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

		err := inst.Uninstall(context.Background(), tool, Installation{})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(runner.History) == 0 {
			t.Fatal("expected command to run")
		}
		cmd := runner.History[0]
		if cmd.Name != "bun" || cmd.Args[0] != "remove" || cmd.Args[1] != "-g" || cmd.Args[2] != "--" || cmd.Args[3] != "prettier" {
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

	t.Run("End of options marker is passed for npm and bun commands", func(t *testing.T) {
		// 1. npm install -g -- <spec>
		runner.Clear()
		runner.Register("npm", []byte("/usr/local"), nil)
		toolNpm := &config.ToolConfig{
			Name:               "prettier",
			InstallationMethod: "npm",
			InstallParams:      map[string]interface{}{"package": "prettier", "version": "3.0.0"},
		}
		if _, err := inst.Install(context.Background(), toolNpm); err != nil {
			t.Fatalf("Install failed: %v", err)
		}
		var npmInstallCmd *exec.MockCmd
		for _, cmd := range runner.History {
			if cmd.Name == "npm" && len(cmd.Args) >= 2 && cmd.Args[0] == "install" {
				npmInstallCmd = cmd
			}
		}
		if npmInstallCmd == nil || !slices.Equal(npmInstallCmd.Args, []string{"install", "-g", "--", "prettier@3.0.0"}) {
			t.Errorf("npm install args = %v, want [install -g -- prettier@3.0.0]", npmInstallCmd)
		}

		// 2. npm install -g --force -- <spec>
		runner.Clear()
		runner.Register("npm", []byte("/usr/local"), nil)
		toolNpmForce := &config.ToolConfig{
			Name:          "prettier",
			InstallParams: map[string]interface{}{"package": "prettier", "force": true},
		}
		if _, err := inst.Install(context.Background(), toolNpmForce); err != nil {
			t.Fatalf("Install failed: %v", err)
		}
		npmInstallCmd = nil
		for _, cmd := range runner.History {
			if cmd.Name == "npm" && len(cmd.Args) >= 2 && cmd.Args[0] == "install" {
				npmInstallCmd = cmd
			}
		}
		if npmInstallCmd == nil || !slices.Equal(npmInstallCmd.Args, []string{"install", "-g", "--force", "--", "prettier"}) {
			t.Errorf("npm install force args = %v, want [install -g --force -- prettier]", npmInstallCmd)
		}

		// 3. bun install -g -- <spec>
		runner.Clear()
		runner.Register("bun", []byte("/usr/local/bin"), nil)
		toolBun := &config.ToolConfig{
			Name:          "prettier",
			InstallParams: map[string]interface{}{"packageManager": "bun", "package": "prettier"},
		}
		if _, err := inst.Install(context.Background(), toolBun); err != nil {
			t.Fatalf("Install failed: %v", err)
		}
		var bunInstallCmd *exec.MockCmd
		for _, cmd := range runner.History {
			if cmd.Name == "bun" && len(cmd.Args) >= 2 && cmd.Args[0] == "install" {
				bunInstallCmd = cmd
			}
		}
		if bunInstallCmd == nil || !slices.Equal(bunInstallCmd.Args, []string{"install", "-g", "--", "prettier"}) {
			t.Errorf("bun install args = %v, want [install -g -- prettier]", bunInstallCmd)
		}

		// 4. npm uninstall -g -- <name>
		runner.Clear()
		if err := inst.Uninstall(context.Background(), toolNpm, Installation{}); err != nil {
			t.Fatalf("Uninstall failed: %v", err)
		}
		if len(runner.History) == 0 || !slices.Equal(runner.History[0].Args, []string{"uninstall", "-g", "--", "prettier"}) {
			t.Errorf("npm uninstall args = %v, want [uninstall -g -- prettier]", runner.History)
		}

		// 5. bun remove -g -- <name>
		runner.Clear()
		if err := inst.Uninstall(context.Background(), toolBun, Installation{}); err != nil {
			t.Fatalf("Uninstall failed: %v", err)
		}
		if len(runner.History) == 0 || !slices.Equal(runner.History[0].Args, []string{"remove", "-g", "--", "prettier"}) {
			t.Errorf("bun remove args = %v, want [remove -g -- prettier]", runner.History)
		}

		// 6. npm view -- <name> version
		runner.Clear()
		registerQuery(runner, "npm", "3.0.0\n", "", nil)
		if _, err := inst.CheckUpdate(context.Background(), toolNpm); err != nil {
			t.Fatalf("CheckUpdate failed: %v", err)
		}
		if len(runner.History) == 0 || !slices.Equal(runner.History[0].Args, []string{"view", "--", "prettier", "version"}) {
			t.Errorf("npm view args = %v, want [view -- prettier version]", runner.History)
		}

		// 7. bun pm view -g -- <name> version
		runner.Clear()
		registerQuery(runner, "bun", "3.0.0\n", "", nil)
		if _, err := inst.CheckUpdate(context.Background(), toolBun); err != nil {
			t.Fatalf("CheckUpdate failed: %v", err)
		}
		if len(runner.History) == 0 || !slices.Equal(runner.History[0].Args, []string{"pm", "view", "-g", "--", "prettier", "version"}) {
			t.Errorf("bun pm view args = %v, want [pm view -g -- prettier version]", runner.History)
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
				"running npm view -- prettier version", "exit status 1", "npm error code E404",
			},
		},
		{
			name:        "bun fails",
			params:      bun,
			command:     "bun",
			stderr:      "404 Not Found: https://registry.npmjs.org/prettier\n",
			err:         exitStatusError(1),
			wantErrText: []string{"running bun pm view -g -- prettier version", "404 Not Found"},
		},
		{
			name:        "npm prints nothing",
			command:     "npm",
			stdout:      "\n",
			wantErrText: []string{"running npm view -- prettier version", "printed no version"},
		},
		{
			name:        "bun prints nothing",
			params:      bun,
			command:     "bun",
			stdout:      "\n",
			wantErrText: []string{"running bun pm view -g -- prettier version", "printed no version"},
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

func TestNpmInstaller_CheckUpdateConfiguredPackage(t *testing.T) {
	tests := []struct {
		manager string
		args    []string
	}{
		{manager: "npm", args: []string{"view", "--", "@openai/codex", "version"}},
		{manager: "bun", args: []string{"pm", "view", "-g", "--", "@openai/codex", "version"}},
	}
	for _, tt := range tests {
		t.Run(tt.manager, func(t *testing.T) {
			runner := exec.NewMockRunner()
			registerQuery(runner, tt.manager, "1.2.3\n", "", nil)
			inst := NewNpmInstaller(runner, fs.NewMemFS(), nil)
			tool := &config.ToolConfig{
				Name: "codex",
				InstallParams: map[string]interface{}{
					"packageManager": tt.manager,
					"package":        "@openai/codex",
				},
			}

			res, err := inst.CheckUpdate(context.Background(), tool)
			if err != nil {
				t.Fatalf("CheckUpdate() error = %v", err)
			}
			if res.LatestVersion != "1.2.3" {
				t.Errorf("LatestVersion = %q, want 1.2.3", res.LatestVersion)
			}
			if len(runner.History) != 1 {
				t.Fatalf("ran %d commands, want one registry query", len(runner.History))
			}
			cmd := runner.History[0]
			if cmd.Name != tt.manager || !slices.Equal(cmd.Args, tt.args) {
				t.Errorf("query = %s %v, want %s %v", cmd.Name, cmd.Args, tt.manager, tt.args)
			}
		})
	}
}

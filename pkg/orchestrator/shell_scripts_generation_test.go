package orchestrator

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

func TestShellGenerationContinuesAfterToolFailure(t *testing.T) {
	for _, broken := range []struct {
		name  string
		shell config.ShellTypeConfig
	}{
		{"path", config.ShellTypeConfig{Paths: []interface{}{"{paths.dotfilesDir}/bin"}}},
		{"environment", config.ShellTypeConfig{Env: map[string]string{"BAD": "{paths.dotfilesDir}"}}},
		{"alias", config.ShellTypeConfig{Aliases: map[string]string{"bad": "{paths.dotfilesDir}"}}},
		{"always", config.ShellTypeConfig{Scripts: []config.ShellScript{{Kind: config.ShellScriptAlways, Value: "{paths.dotfilesDir}"}}}},
		{"once", config.ShellTypeConfig{Scripts: []config.ShellScript{{Kind: config.ShellScriptOnce, Value: "{paths.dotfilesDir}"}}}},
	} {
		t.Run(broken.name, func(t *testing.T) {
			mem := newMemFS()
			o := newTestOrchestrator(t, mem, "")
			project := &config.ProjectConfig{Paths: config.PathsConfig{
				HomeDir: "/home/user", GeneratedDir: "/generated", TargetDir: "/target",
				DotfilesDir: "{paths.binariesDir}", BinariesDir: "{paths.dotfilesDir}",
			}}
			tools := []*config.ToolConfig{
				{Name: "broken", ShellConfigs: &config.ShellConfigs{Zsh: &broken.shell}},
				{Name: "healthy", ShellConfigs: &config.ShellConfigs{Zsh: &config.ShellTypeConfig{Aliases: map[string]string{"healthy": "echo healthy"}}}},
			}
			err := o.GenerateTools(context.Background(), tools, project)
			if err == nil || !strings.Contains(err.Error(), "cycle") {
				t.Errorf("error = %v, want placeholder cycle reported", err)
			}
			data, err := mem.ReadFile("/generated/shell-scripts/main.zsh")
			if err != nil || !strings.Contains(string(data), "alias healthy='echo healthy'") {
				t.Errorf("healthy shell configuration was not generated: %s, %v", data, err)
			}
		})
	}
}

func TestOrchestrator_OnceScriptSelfDeletionAndPruning(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := newMemFS()
	runner := exec.NewMockRunner()

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed to open sqlite DB: %v", err)
	}
	defer sqlDB.Close()

	reg := registry.NewRegistry(sqlDB)
	instReg := installer.NewRegistry()

	orch := NewOrchestrator(nil, fsys, runner, reg, instReg)
	orch.SetSymlinkFS(fsys)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:      "/home/user",
			TargetDir:    "/home/user/bin",
			GeneratedDir: "/home/user/.generated",
		},
	}

	stc := &config.ShellTypeConfig{
		Scripts: []config.ShellScript{
			{Kind: "once", Value: "echo 'hello once'"},
		},
	}
	tool := &config.ToolConfig{
		Name: "once-tool",
		ShellConfigs: &config.ShellConfigs{
			Zsh:        stc,
			Bash:       stc,
			Powershell: stc,
		},
	}

	_ = fsys.MkdirAll("/home/user/bin", 0755)

	// Generate shell scripts
	err = orch.GenerateTools(ctx, []*config.ToolConfig{tool}, projCfg)
	if err != nil {
		t.Fatalf("unexpected failure generating tools: %v", err)
	}

	onceDir := "/home/user/.generated/shell-scripts/.once"

	// 1. Verify files exist in onceDir
	zshOncePath := filepath.Join(onceDir, "once-001.zsh")
	bashOncePath := filepath.Join(onceDir, "once-001.sh")
	ps1OncePath := filepath.Join(onceDir, "once-001.ps1")

	for _, p := range []string{zshOncePath, bashOncePath, ps1OncePath} {
		exists, err := fsys.Exists(p)
		if err != nil || !exists {
			t.Fatalf("expected once script %q to exist", p)
		}
	}

	// 2. Verify self-deletion statements inside once files
	zshBytes, _ := fsys.ReadFile(zshOncePath)
	zshContent := string(zshBytes)
	if !strings.Contains(zshContent, `rm -f "${(%):-%x}"`) {
		t.Errorf("expected zsh once script to contain self-deletion command, got:\n%s", zshContent)
	}

	bashBytes, _ := fsys.ReadFile(bashOncePath)
	bashContent := string(bashBytes)
	if !strings.Contains(bashContent, `rm -f "${BASH_SOURCE[0]}"`) {
		t.Errorf("expected bash once script to contain self-deletion command, got:\n%s", bashContent)
	}

	ps1Bytes, _ := fsys.ReadFile(ps1OncePath)
	ps1Content := string(ps1Bytes)
	if !strings.Contains(ps1Content, `Remove-Item $MyInvocation.MyCommand.Path`) {
		t.Errorf("expected ps1 once script to contain self-deletion command, got:\n%s", ps1Content)
	}

	// 3. Verify consecutive generate prunes the once directory
	// Write a stray file inside onceDir
	strayPath := filepath.Join(onceDir, "once-002.zsh")
	_ = fsys.WriteFile(strayPath, []byte("echo stray"), 0755)

	err = orch.GenerateTools(ctx, []*config.ToolConfig{tool}, projCfg)
	if err != nil {
		t.Fatalf("unexpected failure on consecutive generate: %v", err)
	}

	exists, err := fsys.Exists(strayPath)
	if err != nil || exists {
		t.Errorf("expected stray once script to be pruned on consecutive generate, but it still exists")
	}
}

func TestOrchestratorNativeShellGeneration(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	var logBuf bytes.Buffer
	log := logger.New(logger.Config{
		Level:  logger.LogLevelVerbose,
		Writer: &logBuf,
	})

	memFS := newMemFS()
	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed to open database: %v", err)
	}
	defer sqlDB.Close()

	reg := registry.NewRegistry(sqlDB)
	trackedFS := fs.NewTrackedFileSystem(memFS, reg, log, "system").WithFileType("init")
	runner := exec.NewMockRunner()
	instReg := installer.NewRegistry()

	orch := NewOrchestrator(log, trackedFS, runner, reg, instReg)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			GeneratedDir:    "/home/user/.generated",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
			TargetDir:       "/home/user/.generated/user-bin",
		},
	}

	tools := []*config.ToolConfig{
		{
			Name:           "test-tool",
			ConfigFilePath: "/home/user/tools/test-tool.tool.ts",
			ShellConfigs: &config.ShellConfigs{
				Zsh: &config.ShellTypeConfig{
					Env: map[string]string{
						"MY_ENV": "value1",
					},
					Aliases: map[string]string{
						"my-alias": "my-cmd",
					},
					Functions: map[string]string{
						"my-func": "echo hello",
					},
					Scripts: []config.ShellScript{
						{Kind: "sourceFile", Value: "shell.zsh"},
						{Kind: "source", Value: "echo inline-source"},
						{Kind: "sourceFunction", Value: "my-func"},
					},
				},
			},
		},
	}

	// Create test source file inside sandbox
	_ = memFS.MkdirAll("/home/user/tools", 0755)
	_ = memFS.WriteFile("/home/user/tools/shell.zsh", []byte("echo sourced"), 0644)

	err = orch.generateShellScripts(ctx, tools, projCfg)
	if err != nil {
		t.Fatalf("failed to generate shell scripts: %v", err)
	}

	mainZshPath := "/home/user/.generated/shell-scripts/main.zsh"
	data, err := memFS.ReadFile(mainZshPath)
	if err != nil {
		t.Fatalf("failed to read main.zsh: %v", err)
	}

	scriptContent := string(data)
	t.Logf("Generated scriptContent:\n%s", scriptContent)

	if !strings.Contains(scriptContent, "export MY_ENV=\"value1\"") {
		t.Errorf("expected script to contain MY_ENV variable")
	}
	if !strings.Contains(scriptContent, "alias my-alias='my-cmd'") {
		t.Errorf("expected script to contain my-alias alias")
	}
	if !strings.Contains(scriptContent, "my_func() {") && !strings.Contains(scriptContent, "my-func() {") {
		t.Errorf("expected script to contain function definition")
	}
	if !strings.Contains(scriptContent, "[[ -f /home/user/tools/shell.zsh ]] && source /home/user/tools/shell.zsh") {
		t.Errorf("expected script to contain sourceFile direct emission")
	}
	if !strings.Contains(scriptContent, "echo inline-source") {
		t.Errorf("expected script to contain sources block")
	}
	if !strings.Contains(scriptContent, "source <(my-func)") {
		t.Errorf("expected script to contain source <(my-func)")
	}
}

func TestUnindentString(t *testing.T) {
	t.Parallel()
	input := `
          # Initialize Hermit shell hooks
          eval "$(test -x $HERMIT_ROOT_BIN && $HERMIT_ROOT_BIN shell-hooks --print --zsh)"
        `
	got := unindentString(input)
	expected := "# Initialize Hermit shell hooks\neval \"$(test -x $HERMIT_ROOT_BIN && $HERMIT_ROOT_BIN shell-hooks --print --zsh)\""
	if got != expected {
		t.Errorf("unindentString() =\n%q\nwant:\n%q", got, expected)
	}
}

func TestFormatFunctionBody(t *testing.T) {
	t.Parallel()
	input := `
            if (( CURRENT == 2 )) && [[ "${words[CURRENT]}" != -* ]]; then
              local -a recipes
              recipes=(
                ${(f)"$(command just --summary 2>/dev/null | tr ' ' '
')"}
              )
            fi
          `
	got := formatFunctionBody(input)
	expected := "  if (( CURRENT == 2 )) && [[ \"${words[CURRENT]}\" != -* ]]; then\n    local -a recipes\n    recipes=(\n      ${(f)\"$(command just --summary 2>/dev/null | tr ' ' '\n  ')\"}\n    )\n  fi"
	if got != expected {
		t.Errorf("formatFunctionBody() =\n%q\nwant:\n%q", got, expected)
	}
}

func TestGenerateShellScripts_CompleteActiveConfiguration(t *testing.T) {
	mem := newMemFS()
	o := newTestOrchestrator(t, mem, "")
	project := &config.ProjectConfig{Paths: config.PathsConfig{
		HomeDir: "/home/user", TargetDir: "/target", GeneratedDir: "/generated", BinariesDir: "/binaries",
	}}
	tool := func(name string) *config.ToolConfig {
		return &config.ToolConfig{Name: name, ShellConfigs: &config.ShellConfigs{
			Zsh:        &config.ShellTypeConfig{Functions: map[string]string{name: "echo " + name}},
			Bash:       &config.ShellTypeConfig{Functions: map[string]string{name: "echo " + name}},
			Powershell: &config.ShellTypeConfig{Functions: map[string]string{name: "echo " + name}},
		}}
	}
	dependent, dependency, disabled, remote := tool("dependent"), tool("dependency"), tool("disabled"), tool("remote")
	dependent.Dependencies = []string{"dependency"}
	disabled.Disabled = true
	remote.Hostname = "dotfiles-test-other-host.invalid"
	tools := []*config.ToolConfig{dependent, disabled, remote, dependency}
	if err := o.GenerateShellScripts(context.Background(), tools, project); err != nil {
		t.Fatal(err)
	}
	for _, shell := range []string{"zsh", "bash", "ps1"} {
		script, err := mem.ReadFile("/generated/shell-scripts/main." + shell)
		if err != nil {
			t.Fatal(err)
		}
		text := string(script)
		if !strings.Contains(text, "echo dependent") || !strings.Contains(text, "echo dependency") {
			t.Errorf("%s missing active tool shell setup: %s", shell, text)
		}
		if strings.Index(text, "echo dependency") > strings.Index(text, "echo dependent") {
			t.Errorf("%s dependent preceded its dependency", shell)
		}
		if strings.Contains(text, "echo disabled") || strings.Contains(text, "echo remote") {
			t.Errorf("%s included inactive shell setup", shell)
		}
	}
	dependent.Dependencies = []string{"missing"}
	if err := o.GenerateShellScripts(context.Background(), tools, project); err == nil {
		t.Error("unresolved dependency did not fail shell generation")
	}
	if err := o.GenerateShellScripts(context.Background(), tools, nil); err == nil {
		t.Error("nil project configuration did not fail shell generation")
	}
}

func TestGenerateShellScriptsFeaturesAndTypes(t *testing.T) {
	t.Parallel()
	memFS := newMemFS()
	runner := exec.NewMockRunner()
	ctx := context.Background()

	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	log := logger.New(logger.Config{Writer: io.Discard})
	instReg := installer.NewRegistry()

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/test",
			DotfilesDir:     "/home/test/dotfiles",
			TargetDir:       "/home/test/.bin",
			BinariesDir:     "/home/test/.binaries",
			GeneratedDir:    "/home/test/.generated",
			ShellScriptsDir: "/home/test/.generated/shell-scripts",
		},
		Features: config.FeaturesConfig{
			ShellInstall: &config.ShellInstallConfig{
				Zsh:        "enabled",
				Bash:       "disabled",
				Powershell: "disabled",
			},
		},
	}

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

	tool := &config.ToolConfig{
		Name: "script-tool",
		ShellConfigs: &config.ShellConfigs{
			Zsh: &config.ShellTypeConfig{
				Aliases:   map[string]string{"ll": "ls -la"},
				Env:       map[string]string{"TEST_VAR": "val"},
				Functions: map[string]string{"f": "echo f"},
				Paths:     []interface{}{"/home/test/.bin"},
				Scripts: []config.ShellScript{
					{Kind: "once", Value: "echo once_script"},
					{Kind: "always", Value: "echo always_script"},
					{Kind: "sourceFile", Value: "/home/test/source.zsh"},
					{Kind: "source", Value: "source_func() { echo 1; }"},
					{Kind: "sourceFunction", Value: "source_func"},
				},
			},
			Bash: &config.ShellTypeConfig{
				Env: map[string]string{"TEST_VAR": "val"},
			},
		},
	}

	_ = memFS.WriteFile("/home/test/source.zsh", []byte("echo source"), 0644)

	err = orch.generateShellScripts(ctx, []*config.ToolConfig{tool}, projCfg)
	if err != nil {
		t.Fatalf("generateShellScripts failed: %v", err)
	}

	zshMain, err := memFS.ReadFile("/home/test/.generated/shell-scripts/main.zsh")
	if err != nil || !strings.Contains(string(zshMain), "ll") {
		t.Errorf("expected main.zsh to contain alias 'll', got %q, err=%v", string(zshMain), err)
	}
}

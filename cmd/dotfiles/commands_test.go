package main

import (
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCommandsExecution(t *testing.T) {
	tmpDir := t.TempDir()
	cfgPath := filepath.Join(tmpDir, "dotfiles.config.ts")
	_ = os.WriteFile(cfgPath, []byte(`export default { paths: { generatedDir: "./.generated" } };`), 0644)

	oldCfg := cfgFile
	cfgFile = cfgPath
	defer func() { cfgFile = oldCfg }()

	targetSkill := filepath.Join(tmpDir, "skill_target")

	commands := [][]string{
		{"--config", cfgPath, "shell", "init"},
		{"--config", cfgPath, "shell", "audit"},
		{"--config", cfgPath, "state", "cleanup"},
		{"--config", cfgPath, "state", "generate"},
		{"--config", cfgPath, "skill", targetSkill},
		{"--config", cfgPath, "tool", "check"},
		{"--config", cfgPath, "tool", "list"},
		{"--config", cfgPath, "path"},
		{"--config", cfgPath, "state", "log"},
		{"--config", cfgPath, "tool", "validate"},
		{"--config", cfgPath, "self", "version"},
	}

	for _, cmdArgs := range commands {
		t.Run(strings.Join(cmdArgs, " "), func(t *testing.T) {
			rootCmd.SetIn(strings.NewReader(""))
			rootCmd.SetOut(io.Discard)
			rootCmd.SetErr(io.Discard)
			rootCmd.SetArgs(cmdArgs)
			_ = rootCmd.Execute()
		})
	}
}

package main

import (
	"os"
	"path/filepath"
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
		{"--config", cfgPath, "env"},
		{"--config", cfgPath, "cleanup"},
		{"--config", cfgPath, "detect-conflicts"},
		{"--config", cfgPath, "features"},
		{"--config", cfgPath, "generate"},
		{"--config", cfgPath, "skill", targetSkill},
		{"--config", cfgPath, "check-updates"},
		{"--config", cfgPath, "bin"},
		{"--config", cfgPath, "convert"},
		{"--config", cfgPath, "log"},
		{"--config", cfgPath, "validate"},
	}

	for _, cmdArgs := range commands {
		t.Run(cmdArgs[0], func(t *testing.T) {
			rootCmd.SetArgs(cmdArgs)
			_ = rootCmd.Execute()
		})
	}
}

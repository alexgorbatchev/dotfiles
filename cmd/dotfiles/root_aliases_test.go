package main

import (
	"fmt"
	"path/filepath"
	"testing"
)

func TestRootShortcutsAndDomainAliases(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := writeTSProject(t, tmpDir,
		fmt.Sprintf(`"paths": {"targetDir": %q, "generatedDir": %q}`, filepath.ToSlash(filepath.Join(tmpDir, "target")), filepath.ToSlash(filepath.Join(tmpDir, ".generated"))),
		tsTools{"bat": `install("github-release", { repo: "sharkdp/bat" }).bin("bat")`})

	t.Run("generate and g root shortcuts", func(t *testing.T) {
		out1, err := executeCommand("-c", configPath, "generate")
		if err != nil {
			t.Fatalf("root generate shortcut failed: %v\n%s", err, out1)
		}
		out2, err := executeCommand("-c", configPath, "g")
		if err != nil {
			t.Fatalf("root g shortcut failed: %v\n%s", err, out2)
		}
		out3, err := executeCommand("-c", configPath, "state", "g")
		if err != nil {
			t.Fatalf("state g alias failed: %v\n%s", err, out3)
		}
	})

	t.Run("install and i root shortcuts", func(t *testing.T) {
		out1, err := executeCommand("-c", configPath, "--dry-run", "install", "bat")
		if err != nil {
			t.Fatalf("root install shortcut failed: %v\n%s", err, out1)
		}
		out2, err := executeCommand("-c", configPath, "--dry-run", "i", "bat")
		if err != nil {
			t.Fatalf("root i shortcut failed: %v\n%s", err, out2)
		}
		out3, err := executeCommand("-c", configPath, "--dry-run", "tool", "i", "bat")
		if err != nil {
			t.Fatalf("tool i alias failed: %v\n%s", err, out3)
		}
	})

	t.Run("update and u root shortcuts", func(t *testing.T) {
		out1, err := executeCommand("-c", configPath, "--dry-run", "update")
		if err != nil {
			t.Fatalf("root update shortcut failed: %v\n%s", err, out1)
		}
		out2, err := executeCommand("-c", configPath, "--dry-run", "u")
		if err != nil {
			t.Fatalf("root u shortcut failed: %v\n%s", err, out2)
		}
		out3, err := executeCommand("-c", configPath, "--dry-run", "tool", "u")
		if err != nil {
			t.Fatalf("tool u alias failed: %v\n%s", err, out3)
		}
	})

	t.Run("root shortcuts remain hidden from help", func(t *testing.T) {
		for _, name := range []string{"generate", "g", "pull", "install", "i", "update", "u"} {
			cmd, _, err := rootCmd.Find([]string{name})
			if err != nil {
				t.Fatalf("finding command %s: %v", name, err)
			}
			if !cmd.Hidden {
				t.Errorf("command %s should be Hidden", name)
			}
		}
	})
}

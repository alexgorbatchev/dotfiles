package main

import (
	"bytes"
	"fmt"
	"io"
	iofs "io/fs"
	"os"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/embedded"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/spf13/cobra"
)

func printSkill(cmd *cobra.Command) error {
	data, err := embedded.SkillFS.ReadFile("skill/SKILL.md")
	if err != nil {
		return fmt.Errorf("reading embedded skill: %w", err)
	}
	if _, err := io.Copy(cmd.OutOrStdout(), bytes.NewReader(data)); err != nil {
		return fmt.Errorf("printing embedded skill: %w", err)
	}
	return nil
}

func copySkillToPath(cmd *cobra.Command, targetPath string) error {
	log := GetLogger("skill", cmd.ErrOrStderr())
	destPath := filepath.Join(targetPath, "dotfiles")
	if err := os.MkdirAll(destPath, 0755); err != nil {
		return fmt.Errorf("creating destination skill directory: %w", err)
	}

	err := iofs.WalkDir(embedded.SkillFS, "skill", func(path string, d iofs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel("skill", path)
		if err != nil {
			return fmt.Errorf("resolving embedded skill path %q: %w", path, err)
		}
		if rel == "." {
			return nil
		}
		dst := filepath.Join(destPath, rel)
		if d.IsDir() {
			return os.MkdirAll(dst, 0755)
		}
		data, err := iofs.ReadFile(embedded.SkillFS, path)
		if err != nil {
			return fmt.Errorf("reading embedded skill file %q: %w", path, err)
		}
		return os.WriteFile(dst, data, 0644)
	})
	if err != nil {
		return fmt.Errorf("extracting embedded skill: %w", err)
	}
	log.Info(logger.Message(fmt.Sprintf("Copied skill folder to %s", destPath)))
	return nil
}

var skillCmd = &cobra.Command{
	Use:   "skill",
	Args:  cobra.NoArgs,
	Short: "Print the bundled dotfiles skill",
	RunE: func(cmd *cobra.Command, args []string) error {
		return printSkill(cmd)
	},
}

func init() {
	skillCmd.AddCommand(skillCopyCmd)
	rootCmd.AddCommand(skillCmd)
}

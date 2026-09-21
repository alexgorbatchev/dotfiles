package main

import (
	"fmt"
	iofs "io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/cliout"
	"github.com/alexgorbatchev/dotfiles/pkg/embedded"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/utils"
	"github.com/spf13/cobra"
)

var (
	skillDir  string
	skillJSON bool
)

func parseSkillDescription(content string) string {
	lines := strings.Split(content, "\n")
	if len(lines) == 0 {
		return "No description"
	}

	var frontmatterLines []string
	var bodyLines []string

	trimmedFirst := strings.TrimSpace(lines[0])
	if trimmedFirst == "---" {
		for i := 1; i < len(lines); i++ {
			line := lines[i]
			if strings.TrimSpace(line) == "---" {
				bodyLines = lines[i+1:]
				break
			}
			frontmatterLines = append(frontmatterLines, line)
		}
	} else {
		bodyLines = lines
	}

	if len(frontmatterLines) > 0 {
		for i := 0; i < len(frontmatterLines); i++ {
			line := frontmatterLines[i]
			lineTrim := strings.TrimSpace(line)
			if strings.HasPrefix(lineTrim, "description:") {
				val := strings.TrimSpace(strings.TrimPrefix(lineTrim, "description:"))
				// Check if val is a multiline scalar indicator (| or >)
				if val == "|" || val == ">" || val == "|-" || val == ">-" || val == "|+" || val == ">+" || strings.HasPrefix(val, "|") || strings.HasPrefix(val, ">") {
					var multi []string
					for j := i + 1; j < len(frontmatterLines); j++ {
						nextLine := frontmatterLines[j]
						if strings.TrimSpace(nextLine) == "" {
							continue
						}
						// Check if line is indented
						if strings.HasPrefix(nextLine, " ") || strings.HasPrefix(nextLine, "\t") {
							multi = append(multi, strings.TrimSpace(nextLine))
						} else {
							break
						}
					}
					if len(multi) > 0 {
						return strings.Join(multi, " ")
					}
				} else if val != "" {
					val = strings.Trim(val, `"'`)
					return val
				}
			}
		}
	}

	for _, line := range bodyLines {
		lineTrim := strings.TrimSpace(line)
		if strings.HasPrefix(lineTrim, "# ") {
			return strings.TrimPrefix(lineTrim, "# ")
		}
	}

	return "No description"
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
		if err != nil || rel == "." {
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

func listSkills(cmd *cobra.Command) error {
	log := GetLogger("skill", cmd.ErrOrStderr())
	cwd, _ := os.Getwd()
	homeDir, _ := os.UserHomeDir()

	var searchDirs []string
	if skillDir != "" {
		searchDirs = []string{utils.ExpandHomePath(homeDir, skillDir)}
	} else {
		searchDirs = []string{
			filepath.Join(cwd, ".agents", "skills"),
			filepath.Join(cwd, ".pi", "skills"),
		}
		if homeDir != "" {
			searchDirs = append(searchDirs, filepath.Join(homeDir, ".agents", "skills"))
		}
	}

	type SkillInfo struct {
		Name        string `json:"name"`
		Path        string `json:"path"`
		Description string `json:"description"`
	}

	var foundSkills []SkillInfo

	for _, sDir := range searchDirs {
		entries, err := os.ReadDir(sDir)
		if err != nil {
			continue
		}

		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}

			skillPath := filepath.Join(sDir, entry.Name())
			skillFile := filepath.Join(skillPath, "SKILL.md")

			if exists, _ := fileExists(skillFile); exists {
				data, err := os.ReadFile(skillFile)
				desc := "No description"
				if err == nil {
					desc = parseSkillDescription(string(data))
				}
				foundSkills = append(foundSkills, SkillInfo{
					Name:        entry.Name(),
					Path:        skillPath,
					Description: desc,
				})
			}
		}
	}

	if len(foundSkills) == 0 {
		log.Info("No AI skills found.")
		if skillJSON {
			return cliout.RenderJSON(cmd.OutOrStdout(), []any{})
		}
		if cliout.IsAgentMode() {
			fmt.Fprintln(cmd.OutOrStdout(), "no skills found")
		} else {
			fmt.Fprintln(cmd.OutOrStdout(), "No AI skills found.")
		}
		return nil
	}

	if skillJSON {
		return cliout.RenderJSON(cmd.OutOrStdout(), foundSkills)
	}

	log.Info(logger.Message(fmt.Sprintf("Installed AI skills (%d):", len(foundSkills))))
	for _, s := range foundSkills {
		if cliout.IsAgentMode() {
			fmt.Fprintf(cmd.OutOrStdout(), "name:%s desc:%s path:%s\n", s.Name, s.Description, s.Path)
		} else {
			fmt.Fprintf(cmd.OutOrStdout(), "- %s: %s (%s)\n", s.Name, s.Description, s.Path)
		}
	}

	return nil
}

var skillCmd = &cobra.Command{
	Use:   "skill [path]",
	Args:  cobra.MaximumNArgs(1),
	Short: "AI Agent skill definitions",
	RunE: func(cmd *cobra.Command, args []string) error {
		if len(args) > 0 {
			return copySkillToPath(cmd, args[0])
		}
		return listSkills(cmd)
	},
}

func init() {
	skillCmd.Flags().StringVar(&skillDir, "dir", "", "Custom skills directory to search")
	skillCmd.Flags().BoolVar(&skillJSON, "json", false, "Output results in JSON format")
	skillCmd.AddCommand(skillCopyCmd)
	rootCmd.AddCommand(skillCmd)
}

package main

import (
	"fmt"
	iofs "io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/embedded"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/utils"
	"github.com/spf13/cobra"
)

var skillDir string

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

var skillCmd = &cobra.Command{
	Use:   "skill [path]",
	Short: "Manage AI skills or copy dotfiles skill folder to target path",
	RunE: func(cmd *cobra.Command, args []string) error {
		log := GetLogger("skill", cmd.ErrOrStderr())

		if len(args) > 0 {
			targetPath := args[0]
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

		cwd, _ := os.Getwd()
		homeDir, _ := os.UserHomeDir()

		searchDirs := []string{
			filepath.Join(cwd, ".agents", "skills"),
			filepath.Join(cwd, ".pi", "skills"),
		}
		if homeDir != "" {
			searchDirs = append(searchDirs, filepath.Join(homeDir, ".agents", "skills"))
		}
		if skillDir != "" {
			searchDirs = append([]string{utils.ExpandHomePath(homeDir, skillDir)}, searchDirs...)
		}

		type SkillInfo struct {
			Name        string
			Path        string
			Description string
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
			log.Info(logger.Messages.CommandCompleted(dryRun))
			fmt.Fprintln(cmd.OutOrStdout(), "No AI skills found.")
			return nil
		}

		log.Info(logger.Message(fmt.Sprintf("Installed AI skills (%d):", len(foundSkills))))
		for _, s := range foundSkills {
			fmt.Fprintf(cmd.OutOrStdout(), "- %s: %s (%s)\n", s.Name, s.Description, s.Path)
		}

		log.Info(logger.Messages.CommandCompleted(dryRun))
		return nil
	},
}

func init() {
	skillCmd.Flags().StringVar(&skillDir, "dir", "", "Custom skills directory path")
	rootCmd.AddCommand(skillCmd)
}

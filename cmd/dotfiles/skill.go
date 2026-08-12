package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

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
	Use:   "skill",
	Short: "Manage AI skills",
	RunE: func(cmd *cobra.Command, args []string) error {
		log := GetLogger("skill", cmd.ErrOrStderr())

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
			fmt.Fprintln(cmd.OutOrStdout(), "No AI skills found.")
			return nil
		}

		log.Info(logger.Message(fmt.Sprintf("Installed AI skills (%d):", len(foundSkills))))
		for _, s := range foundSkills {
			fmt.Fprintf(cmd.OutOrStdout(), "- %s: %s (%s)\n", s.Name, s.Description, s.Path)
		}

		return nil
	},
}

func init() {
	skillCmd.Flags().StringVar(&skillDir, "dir", "", "Custom skills directory path")
	rootCmd.AddCommand(skillCmd)
}

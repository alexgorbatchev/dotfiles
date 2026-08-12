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
						lines := strings.Split(string(data), "\n")
						for _, line := range lines {
							lineTrim := strings.TrimSpace(line)
							if strings.HasPrefix(lineTrim, "description:") {
								desc = strings.TrimSpace(strings.TrimPrefix(lineTrim, "description:"))
								desc = strings.Trim(desc, `"'`)
								break
							} else if strings.HasPrefix(lineTrim, "# ") {
								desc = strings.TrimPrefix(lineTrim, "# ")
								break
							}
						}
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

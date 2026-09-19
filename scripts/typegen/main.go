package main

import (
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/tkrajina/typescriptify-golang-structs/typescriptify"
)

func generateTypes(outputPath string) error {
	if dir := filepath.Dir(outputPath); dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return err
		}
	}

	t := typescriptify.New()
	t.CreateInterface = true
	t.BackupDir = "" // Do not create backup files (e.g. *.backup) when overwriting files

	// Add all structs to be translated
	t.Add(config.CacheConfig{})
	t.Add(config.HostConfig{})
	t.Add(config.PathsConfig{})
	t.Add(config.SystemConfig{})
	t.Add(config.CargoConfig{})
	t.Add(config.DownloaderConfig{})
	t.Add(config.CatalogConfig{})
	t.Add(config.ShellInstallConfig{})
	t.Add(config.FeaturesConfig{})
	t.Add(config.ProjectConfig{})
	t.Add(config.BinaryConfig{})
	t.Add(config.SymlinkConfig{})
	t.Add(config.CopyConfig{})
	t.Add(config.ShellScript{})
	t.Add(config.ShellTypeConfig{})
	t.Add(config.ShellConfigs{})
	t.Add(config.ToolConfigUpdateCheck{})
	t.Add(config.ToolConfig{})

	if err := t.ConvertToFile(outputPath); err != nil {
		return err
	}

	// Refine any types to unions where needed
	content, err := os.ReadFile(outputPath)
	if err == nil {
		updated := strings.ReplaceAll(string(content), "toolConfigsDir?: any;", "toolConfigsDir?: string | string[];")
		updated = strings.ReplaceAll(updated, "toolConfigsDir: any;", "toolConfigsDir: string | string[];")
		_ = os.WriteFile(outputPath, []byte(updated), 0644)
	}

	// Format generated TypeScript file with oxfmt
	cmd := exec.Command("bun", "--bun", "oxfmt", outputPath)
	_ = cmd.Run()
	return nil
}

func runMain(args []string) error {
	fs := flag.NewFlagSet("typegen", flag.ContinueOnError)
	outFlag := fs.String("out", "", "Output file path")
	if err := fs.Parse(args); err != nil {
		return err
	}

	outputPath := *outFlag
	if fs.NArg() > 0 {
		outputPath = fs.Arg(0)
	}

	if outputPath != "" {
		if err := generateTypes(outputPath); err != nil {
			return fmt.Errorf("error converting Go structures to TypeScript: %w", err)
		}
		fmt.Printf("Successfully generated TypeScript interfaces at %s\n", outputPath)
		return nil
	}

	dashboardPath := "packages/dashboard/src/shared/types.gen.ts"
	if err := generateTypes(dashboardPath); err != nil {
		return fmt.Errorf("error generating %s: %w", dashboardPath, err)
	}
	fmt.Printf("Successfully generated TypeScript interfaces at %s\n", dashboardPath)
	return nil
}

func main() {
	if err := runMain(os.Args[1:]); err != nil {
		fmt.Fprintf(os.Stderr, "%v\n", err)
		os.Exit(1)
	}
}

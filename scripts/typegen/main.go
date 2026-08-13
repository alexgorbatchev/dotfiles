package main

import (
	"flag"
	"fmt"
	"os"
	"os/exec"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/tkrajina/typescriptify-golang-structs/typescriptify"
)

func generateTypes(outputPath string) error {
	t := typescriptify.New()
	t.CreateInterface = true
	t.BackupDir = "" // Do not create backup files (e.g. *.backup) when overwriting files

	// Add all structs to be translated
	t.Add(config.CacheConfig{})
	t.Add(config.HostConfig{})
	t.Add(config.PathsConfig{})
	t.Add(config.SystemConfig{})
	t.Add(config.LoggingConfig{})
	t.Add(config.UpdatesConfig{})
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
	t.Add(config.PlatformConfigEntry{})
	t.Add(config.ToolConfig{})

	if err := t.ConvertToFile(outputPath); err != nil {
		return err
	}

	// Format generated TypeScript file with oxfmt
	cmd := exec.Command("bun", "--bun", "oxfmt", outputPath)
	_ = cmd.Run()
	return nil
}

func main() {
	outFlag := flag.String("out", "", "Output file path")
	flag.Parse()

	outputPath := *outFlag
	if flag.NArg() > 0 {
		outputPath = flag.Arg(0)
	}

	if outputPath != "" {
		if err := generateTypes(outputPath); err != nil {
			fmt.Printf("Error converting Go structures to TypeScript: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Successfully generated TypeScript interfaces at %s\n", outputPath)
		return
	}

	dashboardPath := "packages/dashboard/src/shared/types.gen.ts"
	if err := generateTypes(dashboardPath); err != nil {
		fmt.Printf("Error generating %s: %v\n", dashboardPath, err)
		os.Exit(1)
	}
	fmt.Printf("Successfully generated TypeScript interfaces at %s\n", dashboardPath)

	distDir := ".dist"
	if err := os.MkdirAll(distDir, 0755); err != nil {
		fmt.Printf("Error creating %s directory: %v\n", distDir, err)
		os.Exit(1)
	}

	distPath := ".dist/index.d.ts"
	if err := generateTypes(distPath); err != nil {
		fmt.Printf("Error generating %s: %v\n", distPath, err)
		os.Exit(1)
	}
	fmt.Printf("Successfully generated TypeScript interfaces at %s\n", distPath)
}


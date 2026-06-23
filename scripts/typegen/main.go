package main

import (
	"fmt"
	"os"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/tkrajina/typescriptify-golang-structs/typescriptify"
)

func main() {
	t := typescriptify.New()
	t.CreateInterface = true

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

	outputPath := "packages/core/src/types.gen.ts"
	err := t.ConvertToFile(outputPath)
	if err != nil {
		fmt.Printf("Error converting Go structures to TypeScript: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Successfully generated TypeScript interfaces at %s\n", outputPath)
}

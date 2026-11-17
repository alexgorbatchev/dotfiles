package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/catalog"
	"github.com/alexgorbatchev/dotfiles/pkg/cliout"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/vm"
	"github.com/spf13/cobra"
)

const (
	defaultCatalogRepository = "https://github.com/alexgorbatchev/dotfiles-catalog"
	catalogRepositoryEnv     = "DOTFILES_CATALOG_REPO"
)

var catalogFetchFlags struct{ repository, ref string }

var catalogFetchCmd = &cobra.Command{
	Use:   "fetch <id>",
	Short: "Download a tool definition and its files from Git",
	Long: `Download tools/<first>/<second-or-_>/<id>/ from a Git repository.
The directory must contain tool.ts. Its files are copied to <primary-tools>/<id>/,
and tool.ts becomes <id>.tool.ts. Existing destinations are refused.

The default repository is ` + defaultCatalogRepository + `.
Set ` + catalogRepositoryEnv + ` to change it, or use --repo to override both.
An empty environment variable uses the default; an explicitly empty --repo is invalid.
Supply --repo as an HTTPS, SSH or file Git URL, or an absolute local repository
path. --ref selects one branch, tag or commit; the default is the remote HEAD.
Git must be installed. No downloaded source is executed and no software is installed.
Review the files, then run dotfiles generate and dotfiles install <id>.

Discovery options --catalog-url, --offline and --refresh do not apply to fetch.
--dry-run retrieves and validates temporary files without importing them.`,
	Args:              catalogArgs(cobra.ExactArgs(1)),
	ValidArgsFunction: completeNoFileComp,
	RunE:              runCatalogFetch,
}

func init() {
	catalogFetchCmd.Flags().StringVar(&catalogFetchFlags.repository, "repo", defaultCatalogRepository, "Git repository URL or absolute local path (overrides "+catalogRepositoryEnv+")")
	catalogFetchCmd.Flags().StringVar(&catalogFetchFlags.ref, "ref", "", "Branch, tag or commit (default: remote HEAD)")
	catalogCmd.AddCommand(catalogFetchCmd)
}

func runCatalogFetch(cmd *cobra.Command, args []string) error {
	repository := catalogFetchFlags.repository
	if !cmd.Flags().Changed("repo") {
		if value := os.Getenv(catalogRepositoryEnv); value != "" {
			repository = value
		}
	}
	options := catalog.FetchOptions{ID: args[0], Repository: repository, Ref: catalogFetchFlags.ref, DryRun: dryRun}
	if err := options.Validate(); err != nil {
		return reportCatalogFailure(cmd, catalogInputError(err))
	}
	for _, flag := range []string{"catalog-url", "offline", "refresh"} {
		if cmd.Flags().Changed(flag) {
			return reportCatalogFailure(cmd, catalogInputError(fmt.Errorf("--%s is a discovery option and does not apply to fetch", flag)))
		}
	}
	configPath := cfgFile
	if configPath == "" {
		configPath = "dotfiles.config.ts"
	}
	if err := requireScriptConfig(configPath); err != nil {
		return reportCatalogFailure(cmd, err)
	}
	configPath, err := fs.NewResolvedFS(fs.NewOSFS(), "").Abs(configPath)
	if err != nil {
		return reportCatalogFailure(cmd, err)
	}
	log := GetLogger("catalog", cmd.ErrOrStderr())
	// Loading the existing local configuration discovers its actual tool roots.
	// Avoid installation services and their registry; fetched source is never loaded.
	project, err := vm.LoadProjectConfig(log, fs.NewOSFS(), configPath, vm.WithTarget(resolveTarget(log)))
	if err != nil {
		return reportCatalogFailure(cmd, fmt.Errorf("load local project: %w", err))
	}
	options.ToolsDir = project.Paths.GetPrimaryToolConfigsDir()
	options.TemporaryDir = filepath.Join(filepath.Dir(configPath), ".tmp")
	result, err := catalog.Fetch(cmd.Context(), exec.NewOSRunner(), options)
	if err != nil {
		return reportCatalogFailure(cmd, err)
	}
	if catalogFlags.json {
		return cliout.RenderJSON(cmd.OutOrStdout(), result)
	}
	action := "Fetched"
	if dryRun {
		action = "Would fetch"
	}
	log.Info(logger.Message(fmt.Sprintf("%s %s at %s to %s", action, result.ID, result.Commit, result.Destination)))
	return nil
}

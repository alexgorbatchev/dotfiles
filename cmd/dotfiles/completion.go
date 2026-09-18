package main

import (
	"fmt"
	"slices"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/spf13/cobra"
)

// Shell completion for positional tool arguments.
//
// Cobra's generated shell scripts are thin clients: on every Tab they run the hidden
// `__complete` subcommand and print whatever it returns. Without a ValidArgsFunction
// cobra answers with directive 0, which every shell interprets as "complete file
// names", so `dotfiles install <Tab>` would list the working directory. The functions
// below load the configuration and answer with the configured tool names instead.

// loadToolConfigsForCompletion bootstraps services the same way the commands do so
// completion honours --config, --platform and --arch, and releases the registry
// handle immediately since completion only needs the parsed configuration.
func loadToolConfigsForCompletion(cmd *cobra.Command) ([]*config.ToolConfig, error) {
	services, err := BootstrapServices(cmd.Context(), cfgFile)
	if err != nil {
		return nil, fmt.Errorf("loading configuration for completion: %w", err)
	}
	defer services.Close()
	return services.ToolConfigs, nil
}

// completionError reports a failed completion the way cobra expects: the message goes
// to stderr where the shell script discards it, and the directive tells the shell to
// ignore the (empty) result rather than fall back to file names.
func completionError(err error) ([]cobra.Completion, cobra.ShellCompDirective) {
	cobra.CompErrorln(err.Error())
	return nil, cobra.ShellCompDirectiveError
}

// filterByPrefix keeps the candidates that start with what the user has typed so far,
// in a stable order. Tool configurations originate from a map, so sorting is what
// makes the output deterministic across invocations.
func filterByPrefix(candidates []cobra.Completion, toComplete string) []cobra.Completion {
	out := make([]cobra.Completion, 0, len(candidates))
	for _, c := range candidates {
		name, _, _ := strings.Cut(c, "\t")
		if strings.HasPrefix(name, toComplete) {
			out = append(out, c)
		}
	}
	slices.Sort(out)
	return out
}

// toolNameCandidates describes each tool by its installation method so shells that
// render descriptions (zsh, fish) show where the tool comes from.
func toolNameCandidates(toolConfigs []*config.ToolConfig) []cobra.Completion {
	out := make([]cobra.Completion, 0, len(toolConfigs))
	for _, tc := range toolConfigs {
		out = append(out, cobra.CompletionWithDesc(tc.Name, tc.InstallationMethod))
	}
	return out
}

// completeToolName completes a single positional tool argument. Once a tool has been
// given, nothing further is offered and file completion stays suppressed.
func completeToolName(cmd *cobra.Command, args []string, toComplete string) ([]cobra.Completion, cobra.ShellCompDirective) {
	if len(args) > 0 {
		return nil, cobra.ShellCompDirectiveNoFileComp
	}
	toolConfigs, err := loadToolConfigsForCompletion(cmd)
	if err != nil {
		return completionError(err)
	}
	return filterByPrefix(toolNameCandidates(toolConfigs), toComplete), cobra.ShellCompDirectiveNoFileComp
}

// completeToolNames completes a repeatable tool argument, as `install` accepts, and
// omits tools already present on the command line. `install` skips KEY=VALUE words
// when it loops over its arguments, so they are not treated as consumed tools here.
func completeToolNames(cmd *cobra.Command, args []string, toComplete string) ([]cobra.Completion, cobra.ShellCompDirective) {
	toolConfigs, err := loadToolConfigsForCompletion(cmd)
	if err != nil {
		return completionError(err)
	}
	remaining := make([]*config.ToolConfig, 0, len(toolConfigs))
	for _, tc := range toolConfigs {
		if !slices.Contains(args, tc.Name) {
			remaining = append(remaining, tc)
		}
	}
	return filterByPrefix(toolNameCandidates(remaining), toComplete), cobra.ShellCompDirectiveNoFileComp
}

// completeBinaryOrToolName completes the single argument of `bin`, whose lookup
// accepts either a binary name or a tool name, so both are offered.
func completeBinaryOrToolName(cmd *cobra.Command, args []string, toComplete string) ([]cobra.Completion, cobra.ShellCompDirective) {
	if len(args) > 0 {
		return nil, cobra.ShellCompDirectiveNoFileComp
	}
	toolConfigs, err := loadToolConfigsForCompletion(cmd)
	if err != nil {
		return completionError(err)
	}
	candidates := toolNameCandidates(toolConfigs)
	seen := make(map[string]bool, len(toolConfigs))
	for _, tc := range toolConfigs {
		seen[tc.Name] = true
	}
	for _, tc := range toolConfigs {
		for _, bin := range installer.GetBinaryNames(tc.Name, tc.Binaries) {
			if seen[bin] {
				continue
			}
			seen[bin] = true
			candidates = append(candidates, cobra.CompletionWithDesc(bin, "binary of "+tc.Name))
		}
	}
	return filterByPrefix(candidates, toComplete), cobra.ShellCompDirectiveNoFileComp
}

package main

import (
	"errors"
	"fmt"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/harness"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/spf13/cobra"
)

var toolMakeCmd = &cobra.Command{
	Use:   "make <request...>",
	Args:  cobra.MinimumNArgs(1),
	Short: "Create a tool configuration with your AI coding assistant",
	Long: `Starts the AI coding assistant configured under ai.harness in dotfiles.config.ts
and asks it to create a .tool.ts configuration for the request, which is usually
a repository URL. Every argument is joined with spaces into one request, so it
needs no quoting:

  dotfiles tool make https://github.com/muesli/duf with config

The assistant is told to read the dotfiles skill, create the tool file in the
primary tool configs directory, add a prefilled configuration file linked into
the home directory when the tool reads one, and run dotfiles generate. Each
command it is given runs this same dotfiles program with this configuration.

ai.harness is the assistant's command as a list, such as ["claude", "PROMPT"].
Each "PROMPT" element is replaced with the instructions, a leading ~ in the
first element is expanded to the home directory, and the command is run
directly, without a shell, from the directory holding dotfiles.config.ts. It
shares this terminal, and this command exits with the assistant's exit status.

With --dry-run, prints the instructions instead of starting the assistant.`,
	ValidArgsFunction: completeNoFileComp,
	RunE: func(cmd *cobra.Command, args []string) error {
		request := strings.TrimSpace(strings.Join(args, " "))
		if request == "" {
			return errors.New("the request is empty: name the tool to create, such as a repository URL")
		}

		services, err := BootstrapServices(cmd.Context(), cfgFile)
		if err != nil {
			return err
		}
		defer services.Close()

		prompt := harness.ToolPrompt(harness.ToolRequest{
			Subject:        request,
			ConfigPath:     services.ConfigPath,
			ToolConfigsDir: services.ProjectConfig.Paths.GetPrimaryToolConfigsDir(),
			// AI harnesses run their commands through bash.
			CLI: services.Orchestrator.CliCommandForShell("bash", services.ProjectConfig),
		})
		command := services.ProjectConfig.AI.Harness
		argv, err := harness.Argv(command, prompt, services.ProjectConfig.Paths.HomeDir)
		if err != nil {
			return err
		}

		if dryRun {
			GetLogger("make", cmd.ErrOrStderr()).Info(logger.Message(fmt.Sprintf("Would run AI harness: %q", command)))
			if _, err := fmt.Fprint(cmd.OutOrStdout(), prompt); err != nil {
				return fmt.Errorf("printing the prompt: %w", err)
			}
			return nil
		}

		return harness.Run(cmd.Context(), services.Runner, argv, services.ProjectConfig.ConfigFileDir, harness.Streams{
			Stdin:  cmd.InOrStdin(),
			Stdout: cmd.OutOrStdout(),
			Stderr: cmd.ErrOrStderr(),
		})
	},
}

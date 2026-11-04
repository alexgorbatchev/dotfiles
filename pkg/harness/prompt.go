package harness

import (
	"fmt"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/shell"
)

// ToolRequest is what a tool-creation prompt is built from.
type ToolRequest struct {
	// Subject is what to create a tool file for, as the user wrote it: usually a
	// repository URL, possibly followed by further wishes.
	Subject string
	// ConfigPath is the absolute path of the project configuration file.
	ConfigPath string
	// ToolConfigsDir is the tool configs directory the new tool file belongs in.
	ToolConfigsDir string
	// CLI is the shell command that runs this CLI, already quoted for the shell, such as
	// the executing binary's path. The harness may not find "dotfiles" on PATH, or may
	// find a different version there.
	CLI string
}

// ToolPrompt returns the instructions that ask a harness to create a .tool.ts file for
// req.Subject. The harness learns the authoring rules from the bundled dotfiles skill
// rather than from this prompt, so the prompt stays correct as the skill evolves.
func ToolPrompt(req ToolRequest) string {
	// The configuration path is quoted where it is part of a command to run, so a path
	// with spaces stays one argument; in prose it is shown as it is.
	config := shell.Quote(req.ConfigPath)
	steps := []string{
		fmt.Sprintf("Run `%s skill` and follow its \"Creating Tool Files\" procedure. Run `%s skill copy <directory>` to read the reference files it links to.", req.CLI, req.CLI),
		fmt.Sprintf("The dotfiles project configuration is `%s`. Run every dotfiles command as `%s --config %s <command>`.", req.ConfigPath, req.CLI, config),
		fmt.Sprintf("Create the tool file in `%s`, following the layout of the tool files already there.", req.ToolConfigsDir),
		"If the tool reads a configuration file from the user's home directory, create that file beside the tool file, prefilled with the tool's documented settings, and link it to the location the tool reads with `.symlink()`.",
		fmt.Sprintf("Run `%s --config %s generate` and fix every error it reports.", req.CLI, config),
	}

	var b strings.Builder
	fmt.Fprintf(&b, "Create a dotfiles tool configuration file (.tool.ts) for: %s\n", req.Subject)
	for i, step := range steps {
		fmt.Fprintf(&b, "\n%d. %s", i+1, step)
	}
	b.WriteString("\n")
	return b.String()
}

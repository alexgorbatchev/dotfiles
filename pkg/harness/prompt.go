package harness

import (
	"fmt"
	"strings"
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
}

// ToolPrompt returns the instructions that ask a harness to create a .tool.ts file for
// req.Subject. The harness learns the authoring rules from the bundled dotfiles skill
// rather than from this prompt, so the prompt stays correct as the skill evolves.
func ToolPrompt(req ToolRequest) string {
	steps := []string{
		"Run `dotfiles skill` and follow its \"Creating Tool Files\" procedure. Run `dotfiles skill copy <directory>` to read the reference files it links to.",
		fmt.Sprintf("The dotfiles project configuration is `%s`. Pass `--config %s` to every dotfiles command you run.", req.ConfigPath, req.ConfigPath),
		fmt.Sprintf("Create the tool file in `%s`, following the layout of the tool files already there.", req.ToolConfigsDir),
		"If the tool reads a configuration file from the user's home directory, create that file beside the tool file, prefilled with the tool's documented settings, and link it to the location the tool reads with `.symlink()`.",
		fmt.Sprintf("Run `dotfiles --config %s generate` and fix every error it reports.", req.ConfigPath),
	}

	var b strings.Builder
	fmt.Fprintf(&b, "Create a dotfiles tool configuration file (.tool.ts) for: %s\n", req.Subject)
	for i, step := range steps {
		fmt.Fprintf(&b, "\n%d. %s", i+1, step)
	}
	b.WriteString("\n")
	return b.String()
}

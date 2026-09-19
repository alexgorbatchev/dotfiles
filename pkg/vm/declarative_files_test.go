package vm

import (
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
)

// loadDeclaringTool loads a single tool file and returns the configuration it
// produced. It builds on the shared loadToolSource helper, which always names the
// tool it writes "probe".
func loadDeclaringTool(t *testing.T, source string) (*config.ToolConfig, error) {
	t.Helper()
	toolConfigs, err := loadToolSource(t, source)
	if err != nil {
		return nil, err
	}
	tool, ok := toolConfigs["probe"]
	if !ok {
		t.Fatalf("the probe tool was not loaded")
	}
	return tool, nil
}

// TestBlockDeclarationReachesGo checks the whole path a .block() takes: the options
// are recorded, and the content callback is called and its result carried across the
// JSON boundary rather than being lost the way a function would be.
func TestBlockDeclarationReachesGo(t *testing.T) {
	tool, err := loadDeclaringTool(t, `
	import { defineTool } from "@dotfiles/cli";
	export default defineTool((install, ctx) =>
		install("manual")
			.ensureDir("~/.ssh", { mode: "0700" })
			.symlink("id_rsa", "~/.ssh/id_rsa", { mode: "0600" })
			.block("~/.ssh/config", {
				id: "includes",
				mode: "0600",
				position: "top",
				conflict: "keep-local",
				content: ({ toolDir }) => "Include " + toolDir + "/config",
			}),
	);`)
	if err != nil {
		t.Fatalf("loading configuration: %v", err)
	}

	if len(tool.Directories) != 1 {
		t.Fatalf("directories = %+v, want one", tool.Directories)
	}
	if tool.Directories[0].Path != "~/.ssh" || tool.Directories[0].Mode != "0700" {
		t.Errorf("directory = %+v", tool.Directories[0])
	}

	if len(tool.Symlinks) != 1 || tool.Symlinks[0].Mode != "0600" {
		t.Errorf("symlinks = %+v, want one carrying mode 0600", tool.Symlinks)
	}

	if len(tool.Blocks) != 1 {
		t.Fatalf("blocks = %+v, want one", tool.Blocks)
	}
	block := tool.Blocks[0]
	if block.ID != "includes" || block.Mode != "0600" || block.Position != "top" || block.Conflict != "keep-local" {
		t.Errorf("block = %+v", block)
	}
	if !strings.HasSuffix(block.Content, "/config") || !strings.Contains(block.Content, "Include ") {
		t.Errorf("block content = %q, want it built from the tool directory", block.Content)
	}
}

// TestAsyncBlockContentIsSettled is the case a function-valued declaration exists
// for. An asynchronous callback returns a promise, and a promise serialises to an
// empty object: left unsettled, the tool would arrive in Go with an empty block and
// nothing said about it.
func TestAsyncBlockContentIsSettled(t *testing.T) {
	tool, err := loadDeclaringTool(t, `
	import { defineTool } from "@dotfiles/cli";
	export default defineTool((install) =>
		install("manual").block("~/.ssh/config", {
			id: "includes",
			content: async () => {
				await Promise.resolve();
				return "Include /repo/tools/ssh/config";
			},
		}),
	);`)
	if err != nil {
		t.Fatalf("loading configuration: %v", err)
	}

	if len(tool.Blocks) != 1 {
		t.Fatalf("blocks = %+v, want one", tool.Blocks)
	}
	if got := tool.Blocks[0].Content; got != "Include /repo/tools/ssh/config" {
		t.Errorf("block content = %q, want the value the promise resolved to", got)
	}
}

// TestAsyncBlockContentFailureIsReported checks that a rejected callback stops the
// load and names the declaration, rather than leaving the block silently empty.
func TestAsyncBlockContentFailureIsReported(t *testing.T) {
	_, err := loadDeclaringTool(t, `
	import { defineTool } from "@dotfiles/cli";
	export default defineTool((install) =>
		install("manual").block("~/.ssh/config", {
			id: "includes",
			content: async () => {
				throw new Error("the host list could not be read");
			},
		}),
	);`)
	if err == nil {
		t.Fatal("expected loading to fail")
	}
	if !strings.Contains(err.Error(), "the host list could not be read") {
		t.Errorf("error = %q, want it to carry the callback's own message", err)
	}
	if !strings.Contains(err.Error(), "includes") {
		t.Errorf("error = %q, want it to name the block that failed", err)
	}
}

// TestTemplateDeclarationReachesGo covers the same path for .template(), whose
// variables are an object rather than a string.
func TestTemplateDeclarationReachesGo(t *testing.T) {
	tool, err := loadDeclaringTool(t, `
	import { defineTool } from "@dotfiles/cli";
	export default defineTool((install) =>
		install("manual").template("./gitconfig.template", "~/.gitconfig", {
			mode: "0644",
			conflict: "merge",
			variables: async () => ({ email: "alex@example.com", signingKey: "ssh-ed25519 AAAA" }),
		}),
	);`)
	if err != nil {
		t.Fatalf("loading configuration: %v", err)
	}

	if len(tool.Templates) != 1 {
		t.Fatalf("templates = %+v, want one", tool.Templates)
	}
	tmpl := tool.Templates[0]
	if tmpl.Source != "./gitconfig.template" || tmpl.Target != "~/.gitconfig" {
		t.Errorf("template = %+v", tmpl)
	}
	if tmpl.Mode != "0644" || tmpl.Conflict != "merge" {
		t.Errorf("template options = %+v", tmpl)
	}
	if got := tmpl.Variables["email"]; got != "alex@example.com" {
		t.Errorf("template variables = %+v", tmpl.Variables)
	}
}

// TestBlockWithoutAnIDIsRejected checks that the mistake is reported where it is
// made. Nothing type-checks during generate, so an id left out would otherwise reach
// Go as an empty string and be refused far from the line that caused it.
func TestBlockWithoutAnIDIsRejected(t *testing.T) {
	_, err := loadDeclaringTool(t, `
	import { defineTool } from "@dotfiles/cli";
	export default defineTool((install) =>
		install("manual").block("~/.ssh/config", { content: "Include x" }),
	);`)
	if err == nil {
		t.Fatal("expected a block with no id to be rejected")
	}
	if !strings.Contains(err.Error(), "id") {
		t.Errorf("error = %q, want it to say an id is needed", err)
	}
}

// TestDeclarativeFilesSurviveAPlatformBlock checks that declarations made inside
// .platform() are kept, since that is where a platform-specific include or mode
// belongs.
func TestDeclarativeFilesSurviveAPlatformBlock(t *testing.T) {
	tool, err := loadDeclaringTool(t, `
	import { defineTool, Platform } from "@dotfiles/cli";
	export default defineTool((install) =>
		install("manual")
			.block("~/.ssh/config", { id: "base", content: "Include base" })
			.platform(Platform.All, (install) =>
				install().block("~/.ssh/config", { id: "everywhere", content: "Include everywhere" }),
			),
	);`)
	if err != nil {
		t.Fatalf("loading configuration: %v", err)
	}

	ids := make([]string, 0, len(tool.Blocks))
	for _, block := range tool.Blocks {
		ids = append(ids, block.ID)
	}
	for _, want := range []string{"base", "everywhere"} {
		found := false
		for _, id := range ids {
			if id == want {
				found = true
			}
		}
		if !found {
			t.Errorf("block %q is missing; got %v", want, ids)
		}
	}
}

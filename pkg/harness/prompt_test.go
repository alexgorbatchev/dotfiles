package harness

import "testing"

func TestToolPrompt(t *testing.T) {
	got := ToolPrompt(ToolRequest{
		Subject:        "https://github.com/muesli/duf with config",
		ConfigPath:     "/home/dev/.dotfiles/dotfiles.config.ts",
		ToolConfigsDir: "/home/dev/.dotfiles/tools",
	})
	want := "Create a dotfiles tool configuration file (.tool.ts) for: https://github.com/muesli/duf with config\n" +
		"\n1. Run `dotfiles skill` and follow its \"Creating Tool Files\" procedure. Run `dotfiles skill copy <directory>` to read the reference files it links to." +
		"\n2. The dotfiles project configuration is `/home/dev/.dotfiles/dotfiles.config.ts`. Pass `--config /home/dev/.dotfiles/dotfiles.config.ts` to every dotfiles command you run." +
		"\n3. Create the tool file in `/home/dev/.dotfiles/tools`, following the layout of the tool files already there." +
		"\n4. If the tool reads a configuration file from the user's home directory, create that file beside the tool file, prefilled with the tool's documented settings, and link it to the location the tool reads with `.symlink()`." +
		"\n5. Run `dotfiles --config /home/dev/.dotfiles/dotfiles.config.ts generate` and fix every error it reports.\n"
	if got != want {
		t.Fatalf("ToolPrompt() =\n%s\nwant\n%s", got, want)
	}
}

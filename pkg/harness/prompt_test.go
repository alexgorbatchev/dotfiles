package harness

import "testing"

func TestToolPrompt(t *testing.T) {
	tests := []struct {
		name string
		req  ToolRequest
		want string
	}{
		{
			name: "plain paths",
			req: ToolRequest{
				Subject:        "https://github.com/muesli/duf with config",
				ConfigPath:     "/home/dev/.dotfiles/dotfiles.config.ts",
				ToolConfigsDir: "/home/dev/.dotfiles/tools",
				CLI:            "/home/dev/.dotfiles/.generated/binaries/dotfiles/current/dotfiles",
			},
			want: "Create a dotfiles tool configuration file (.tool.ts) for: https://github.com/muesli/duf with config\n" +
				"\n1. Run `/home/dev/.dotfiles/.generated/binaries/dotfiles/current/dotfiles skill` and follow its \"Creating Tool Files\" procedure. Run `/home/dev/.dotfiles/.generated/binaries/dotfiles/current/dotfiles skill copy <directory>` to read the reference files it links to." +
				"\n2. The dotfiles project configuration is `/home/dev/.dotfiles/dotfiles.config.ts`. Run every dotfiles command as `/home/dev/.dotfiles/.generated/binaries/dotfiles/current/dotfiles --config /home/dev/.dotfiles/dotfiles.config.ts <command>`." +
				"\n3. Create the tool file in `/home/dev/.dotfiles/tools`, following the layout of the tool files already there." +
				"\n4. If the tool reads a configuration file from the user's home directory, create that file beside the tool file, prefilled with the tool's documented settings, and link it to the location the tool reads with `.symlink()`." +
				"\n5. Run `/home/dev/.dotfiles/.generated/binaries/dotfiles/current/dotfiles --config /home/dev/.dotfiles/dotfiles.config.ts generate` and fix every error it reports.\n",
		},
		{
			name: "paths with spaces",
			req: ToolRequest{
				Subject:        "duf",
				ConfigPath:     "/Users/me/Mobile Documents/dotfiles/dotfiles.config.ts",
				ToolConfigsDir: "/Users/me/Mobile Documents/dotfiles/tools",
				CLI:            `go run "/Users/me/src/dot files/cmd/dotfiles"`,
			},
			want: "Create a dotfiles tool configuration file (.tool.ts) for: duf\n" +
				"\n1. Run `go run \"/Users/me/src/dot files/cmd/dotfiles\" skill` and follow its \"Creating Tool Files\" procedure. Run `go run \"/Users/me/src/dot files/cmd/dotfiles\" skill copy <directory>` to read the reference files it links to." +
				"\n2. The dotfiles project configuration is `/Users/me/Mobile Documents/dotfiles/dotfiles.config.ts`. Run every dotfiles command as `go run \"/Users/me/src/dot files/cmd/dotfiles\" --config '/Users/me/Mobile Documents/dotfiles/dotfiles.config.ts' <command>`." +
				"\n3. Create the tool file in `/Users/me/Mobile Documents/dotfiles/tools`, following the layout of the tool files already there." +
				"\n4. If the tool reads a configuration file from the user's home directory, create that file beside the tool file, prefilled with the tool's documented settings, and link it to the location the tool reads with `.symlink()`." +
				"\n5. Run `go run \"/Users/me/src/dot files/cmd/dotfiles\" --config '/Users/me/Mobile Documents/dotfiles/dotfiles.config.ts' generate` and fix every error it reports.\n",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ToolPrompt(tt.req); got != tt.want {
				t.Fatalf("ToolPrompt() =\n%s\nwant\n%s", got, tt.want)
			}
		})
	}
}

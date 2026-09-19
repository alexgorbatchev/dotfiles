package block

import (
	"path/filepath"
	"strings"
)

// styleByExtension maps a file's extension to the comment syntax its parser accepts.
//
// Only the syntaxes that actually appear in configuration files are listed. Anything
// absent falls back to "#", which is what the overwhelming majority of dotfiles use
// and what a file with no extension, such as ~/.ssh/config or /etc/hosts, needs.
var styleByExtension = map[string]Style{
	".bash":         StyleHash,
	".cfg":          StyleSemicolon,
	".conf":         StyleHash,
	".editorconfig": StyleHash,
	".fish":         StyleHash,
	".gitignore":    StyleHash,
	".ini":          StyleSemicolon,
	".js":           StyleSlash,
	".json5":        StyleSlash,
	".jsonc":        StyleSlash,
	".lua":          StyleDash,
	".properties":   StyleHash,
	".py":           StyleHash,
	".rb":           StyleHash,
	".sh":           StyleHash,
	".sql":          StyleDash,
	".toml":         StyleHash,
	".ts":           StyleSlash,
	".vim":          StyleDoubleQuote,
	".yaml":         StyleHash,
	".yml":          StyleHash,
	".zsh":          StyleHash,
}

// styleByName maps a file that carries its syntax in its name rather than in an
// extension. A leading dot is not an extension, so these would otherwise fall to the
// default and have "#" written into a file where it means nothing.
var styleByName = map[string]Style{
	".gitconfig": StyleSemicolon,
	".npmrc":     StyleSemicolon,
	".vimrc":     StyleDoubleQuote,
	".gvimrc":    StyleDoubleQuote,
}

// StyleFor returns the comment syntax a file's markers have to be written in.
func StyleFor(path string) Style {
	base := filepath.Base(path)
	if style, ok := styleByName[base]; ok {
		return style
	}

	// filepath.Ext reports ".bashrc" as the extension of ".bashrc", because it only
	// looks for the last dot. A name whose only dot is the leading one has no
	// extension at all, and treating it as one would make every dotfile its own
	// unknown type.
	if ext := filepath.Ext(base); ext != "" && ext != base {
		if style, ok := styleByExtension[strings.ToLower(ext)]; ok {
			return style
		}
	}

	return StyleHash
}

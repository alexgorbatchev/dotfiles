package embedded

import "embed"

// TypesFS embeds all generated TypeScript declaration files and package.json.
//
//go:embed all:dist
var TypesFS embed.FS

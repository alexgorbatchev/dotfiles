package vm

import "embed"

// DistFS embeds pre-bundled JS files from the dist directory.
//
//go:embed dist/*.js
var DistFS embed.FS

package dashboard

import "github.com/alexgorbatchev/dotfiles/pkg/fs"

// testFS matches what the CLI hands the server: a home-aware filesystem, so tool-config
// directory resolution behaves in tests the way it does in production.
func testFS() fs.FS {
	return fs.NewResolvedFS(&fs.OSFS{}, "")
}

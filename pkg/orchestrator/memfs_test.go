package orchestrator

import "github.com/alexgorbatchev/dotfiles/pkg/fs"

// newMemFS returns an isolated filesystem modelling a host with bash at /bin/bash:
// every generated shim names the bash that runs it in its shebang, so generation
// fails on a host without one.
func newMemFS() *fs.MemFS {
	mem := fs.NewMemFS()
	if err := mem.MkdirAll("/bin", 0755); err != nil {
		panic(err)
	}
	// Non-empty: a zero-byte file counts as a shim placeholder, which is never bash.
	if err := mem.WriteFile("/bin/bash", []byte("bash"), 0755); err != nil {
		panic(err)
	}
	return mem
}

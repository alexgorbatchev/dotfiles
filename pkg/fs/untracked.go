package fs

// Untracked removes operation-recording wrappers while preserving path resolution
// and dry-run overlays. Independent ownership stores use it so their metadata is
// not mistaken for generated tool artifacts during reconciliation.
func Untracked(fsys FS) FS {
	switch wrapped := fsys.(type) {
	case *TrackedFileSystem:
		return Untracked(wrapped.fs)
	case *ResolvedFS:
		return &ResolvedFS{inner: Untracked(wrapped.inner), homeDir: wrapped.homeDir}
	default:
		return fsys
	}
}

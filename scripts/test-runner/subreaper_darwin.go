package main

// Darwin reparents orphaned descendants to launchd, which reaps them. Group
// completion is still checked after the direct child has been joined.
func enableSubreaper() error { return nil }

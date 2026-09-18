// Package lifecycle carries the installation's lifecycle emitter through the context.
//
// Downloading and extraction happen deep inside the individual installers, but the
// hooks that observe them are owned by the orchestrator. Passing an emitter through
// the context lets the shared downloader and extractor announce what they did without
// every installer having to thread a callback through its own signature, and without
// the low-level packages depending on the orchestrator.
package lifecycle

import "context"

// Event names the point an installation has reached.
type Event string

const (
	// AfterDownload is emitted once an asset has been fetched to disk.
	AfterDownload Event = "after-download"
	// AfterExtract is emitted once an archive has been unpacked.
	AfterExtract Event = "after-extract"
)

// Details carries the paths an event produced. Fields are populated per event.
type Details struct {
	DownloadPath string
	ExtractDir   string
	// ExtractedFiles and Executables accompany ExtractDir: everything the extractor
	// unpacked, and the subset it marked executable. A hook placing a binary reads
	// them rather than walking the tree and repeating the executable heuristic.
	ExtractedFiles []string
	Executables    []string
}

// Emitter is notified when an installation reaches an event. An error fails the
// installation, so a hook that cannot do its job stops the tool being marked installed.
type Emitter func(ctx context.Context, event Event, details Details) error

type emitterKey struct{}

// WithEmitter returns a context that notifies fn as the installation progresses.
func WithEmitter(ctx context.Context, fn Emitter) context.Context {
	if fn == nil {
		return ctx
	}
	return context.WithValue(ctx, emitterKey{}, fn)
}

// Emit notifies the emitter carried by ctx, if any. Callers that run outside an
// installation -- tests, one-off downloads -- carry no emitter and are unaffected.
func Emit(ctx context.Context, event Event, details Details) error {
	if ctx == nil {
		return nil
	}
	fn, ok := ctx.Value(emitterKey{}).(Emitter)
	if !ok || fn == nil {
		return nil
	}
	return fn(ctx, event, details)
}

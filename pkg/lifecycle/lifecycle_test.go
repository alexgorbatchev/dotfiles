package lifecycle

import (
	"context"
	"errors"
	"testing"
)

// An installation reaching an event notifies whoever is watching, with what the event
// produced.
func TestEmitReachesTheEmitter(t *testing.T) {
	var seen Event
	var got Details

	ctx := WithEmitter(context.Background(), func(_ context.Context, event Event, details Details) error {
		seen = event
		got = details
		return nil
	})

	err := Emit(ctx, AfterExtract, Details{
		ExtractDir:     "/staging/extracted",
		ExtractedFiles: []string{"/staging/extracted/tool"},
		Executables:    []string{"/staging/extracted/tool"},
	})
	if err != nil {
		t.Fatalf("Emit returned error: %v", err)
	}
	if seen != AfterExtract {
		t.Errorf("event = %q, want %q", seen, AfterExtract)
	}
	if got.ExtractDir != "/staging/extracted" {
		t.Errorf("ExtractDir = %q", got.ExtractDir)
	}
	if len(got.ExtractedFiles) != 1 || len(got.Executables) != 1 {
		t.Errorf("details = %+v, want the extraction result carried through", got)
	}
}

// A hook that cannot do its job stops the installation, so the tool is not marked
// installed on the strength of work that failed.
func TestEmitReportsTheEmitterFailure(t *testing.T) {
	failure := errors.New("the hook refused")
	ctx := WithEmitter(context.Background(), func(context.Context, Event, Details) error {
		return failure
	})

	if err := Emit(ctx, AfterDownload, Details{DownloadPath: "/staging/tool.tar.gz"}); !errors.Is(err, failure) {
		t.Errorf("Emit error = %v, want %v", err, failure)
	}
}

// Downloading outside an installation -- a one-off fetch, a test -- carries no emitter
// and must be unaffected rather than failing for want of one.
func TestEmitWithoutAnEmitter(t *testing.T) {
	for _, tt := range []struct {
		name string
		ctx  context.Context
	}{
		{name: "a plain context", ctx: context.Background()},
		{name: "no context at all", ctx: nil},
		{name: "an emitter that was never set", ctx: WithEmitter(context.Background(), nil)},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if err := Emit(tt.ctx, AfterDownload, Details{}); err != nil {
				t.Errorf("Emit returned %v, want nil", err)
			}
		})
	}
}

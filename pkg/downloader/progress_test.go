package downloader

import (
	"strings"
	"testing"
	"time"
)

func TestFormatDuration(t *testing.T) {
	tests := []struct {
		d    time.Duration
		want string
	}{
		{5 * time.Second, "5s"},
		{65 * time.Second, "1m 5s"},
		{3665 * time.Second, "1h 1m"},
	}

	for _, tt := range tests {
		got := formatDuration(tt.d)
		if got != tt.want {
			t.Errorf("formatDuration(%v) = %q, want %q", tt.d, got, tt.want)
		}
	}
}

func TestFormatEta(t *testing.T) {
	// Less than delay -> empty
	if got := formatEta(100, 1000, 1000, true); got != "" {
		t.Errorf("expected empty string for < 2s delay, got %q", got)
	}

	// Downloaded >= total -> empty
	if got := formatEta(1000, 1000, 3000, true); got != "" {
		t.Errorf("expected empty string when completed, got %q", got)
	}

	// Downloaded <= 0 -> empty
	if got := formatEta(0, 1000, 3000, true); got != "" {
		t.Errorf("expected empty string when downloaded is 0, got %q", got)
	}

	// Active downloading > 2s with ANSI
	gotAnsi := formatEta(500, 1000, 3000, true)
	if !strings.Contains(gotAnsi, "left") {
		t.Errorf("expected eta text with left, got %q", gotAnsi)
	}

	// Active downloading > 2s without ANSI
	gotNoAnsi := formatEta(500, 1000, 3000, false)
	if !strings.Contains(gotNoAnsi, "left") {
		t.Errorf("expected eta text with left, got %q", gotNoAnsi)
	}
}

func TestFormatBytes(t *testing.T) {
	tests := []struct {
		bytes float64
		want  string
	}{
		{500, "500B"},
		{1500, "1.50kB"},
		{1500000, "1.50MB"},
		{1500000000, "1.50GB"},
	}

	for _, tt := range tests {
		got := formatBytes(tt.bytes)
		if got != tt.want {
			t.Errorf("formatBytes(%v) = %q, want %q", tt.bytes, got, tt.want)
		}
	}
}

func TestHighlightAndPrefix(t *testing.T) {
	if got := highlight("text", false); got != "text" {
		t.Errorf("highlight(false) = %q, want \"text\"", got)
	}
	if got := highlight("text", true); !strings.Contains(got, "text") {
		t.Errorf("highlight(true) mismatch: %q", got)
	}

	if got := renderPrefix("file.txt", false); got != "⏵ file.txt" {
		t.Errorf("renderPrefix(false) = %q", got)
	}
	if got := renderPrefix("file.txt", true); !strings.Contains(got, "file.txt") {
		t.Errorf("renderPrefix(true) mismatch: %q", got)
	}
}

func TestProgressBarTTYMethods(t *testing.T) {
	bar := NewProgressBar(1000, "file.txt")
	bar.isTTY = true

	bar.Start()
	bar.Update(500)
	bar.Finish()

	// Bar without totalBytes
	barUnknown := NewProgressBar(0, "unknown.txt")
	frame := barUnknown.RenderFrame()
	if !strings.Contains(frame, "[ 0B ]") {
		t.Errorf("expected [ 0B ] in unknown totalBytes frame, got %q", frame)
	}
}

func TestRenderFancyProgressFieldEdgeCases(t *testing.T) {
	// 0% progress
	f0 := renderFancyProgressField(0.0, "0.00%", "0B", "1.00MB", true)
	if f0 == "" {
		t.Error("expected non-empty fancy field for 0%")
	}

	// 100% progress
	f100 := renderFancyProgressField(100.0, "100.0%", "1.00MB", "1.00MB", false)
	if f100 == "" {
		t.Error("expected non-empty fancy field for 100%")
	}

	// Long text where leftPadCount < 0
	longPercentage := "100.000000000000000000000000000000%"
	longTransferred := "1000000000000000000000000000000B"
	fLong := renderFancyProgressField(100.0, longPercentage, longTransferred, longTransferred, true)
	if fLong == "" {
		t.Error("expected non-empty fancy field for long text")
	}
}

func TestFormatSpeedAndProgressFieldStyles(t *testing.T) {
	// formatSpeed
	if got := formatSpeed(0, 1000); got != "0B/s" {
		t.Errorf("formatSpeed(0) = %q, want '0B/s'", got)
	}
	if got := formatSpeed(1024*1024, 1000); !strings.Contains(got, "MB/s") {
		t.Errorf("formatSpeed(1MB) = %q, want MB/s", got)
	}

	// formatPercentage
	if got := formatPercentage(50.0); got != "50.00%" {
		t.Errorf("formatPercentage(50) = %q, want '50.00%%'", got)
	}

	// renderStyledProgressField
	_ = renderStyledProgressField(" 50.00% (500B/1.00kB) ", 5, 1, 7, 9, 21)

	// getProgressFieldStyle
	_ = getProgressFieldStyle(3, 5, 1, 7, 9, 21)
}

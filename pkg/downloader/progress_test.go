package downloader

import (
	"math"
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
	tests := []struct {
		name            string
		bytesDownloaded int64
		totalBytes      int64
		elapsedMs       int64
		useAnsi         bool
		wantEmpty       bool
		wantContains    string
	}{
		{
			name:            "less than delay -> empty",
			bytesDownloaded: 100,
			totalBytes:      1000,
			elapsedMs:       1000,
			useAnsi:         true,
			wantEmpty:       true,
		},
		{
			name:            "downloaded >= total -> empty",
			bytesDownloaded: 1000,
			totalBytes:      1000,
			elapsedMs:       3000,
			useAnsi:         true,
			wantEmpty:       true,
		},
		{
			name:            "downloaded > total -> empty",
			bytesDownloaded: 1500,
			totalBytes:      1000,
			elapsedMs:       3000,
			useAnsi:         true,
			wantEmpty:       true,
		},
		{
			name:            "downloaded <= 0 -> empty",
			bytesDownloaded: 0,
			totalBytes:      1000,
			elapsedMs:       3000,
			useAnsi:         true,
			wantEmpty:       true,
		},
		{
			name:            "negative downloaded -> empty",
			bytesDownloaded: -10,
			totalBytes:      1000,
			elapsedMs:       3000,
			useAnsi:         true,
			wantEmpty:       true,
		},
		{
			name:            "totalBytes == 0 -> empty",
			bytesDownloaded: 500,
			totalBytes:      0,
			elapsedMs:       3000,
			useAnsi:         true,
			wantEmpty:       true,
		},
		{
			name:            "negative totalBytes -> empty",
			bytesDownloaded: 500,
			totalBytes:      -1,
			elapsedMs:       3000,
			useAnsi:         true,
			wantEmpty:       true,
		},
		{
			name:            "zero elapsedMs -> empty",
			bytesDownloaded: 500,
			totalBytes:      1000,
			elapsedMs:       0,
			useAnsi:         true,
			wantEmpty:       true,
		},
		{
			name:            "active downloading > 2s with ANSI",
			bytesDownloaded: 500,
			totalBytes:      1000,
			elapsedMs:       3000,
			useAnsi:         true,
			wantContains:    "left",
		},
		{
			name:            "active downloading > 2s without ANSI",
			bytesDownloaded: 500,
			totalBytes:      1000,
			elapsedMs:       3000,
			useAnsi:         false,
			wantContains:    "left",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := formatEta(tt.bytesDownloaded, tt.totalBytes, tt.elapsedMs, tt.useAnsi)
			if tt.wantEmpty && got != "" {
				t.Fatalf("expected empty string, got %q", got)
			}
			if tt.wantContains != "" && !strings.Contains(got, tt.wantContains) {
				t.Fatalf("expected eta text to contain %q, got %q", tt.wantContains, got)
			}
		})
	}
}

func TestFormatBytes(t *testing.T) {
	tests := []struct {
		name  string
		bytes float64
		want  string
	}{
		{"zero", 0, "0B"},
		{"negative", -10, "0B"},
		{"NaN", math.NaN(), "0B"},
		{"positive Inf", math.Inf(1), "0B"},
		{"negative Inf", math.Inf(-1), "0B"},
		{"small bytes", 500, "500B"},
		{"kilobytes", 1500, "1.50kB"},
		{"megabytes", 1500000, "1.50MB"},
		{"gigabytes", 1500000000, "1.50GB"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := formatBytes(tt.bytes)
			if got != tt.want {
				t.Errorf("formatBytes(%v) = %q, want %q", tt.bytes, got, tt.want)
			}
		})
	}
}

func TestFormatPercentage(t *testing.T) {
	tests := []struct {
		name  string
		input float64
		want  string
	}{
		{"zero", 0.0, "0.000%"},
		{"normal 50%", 50.0, "50.00%"},
		{"normal 100%", 100.0, "100.0%"},
		{"greater than 100%", 150.0, "100.0%"},
		{"negative", -25.0, "0.000%"},
		{"NaN", math.NaN(), "0.000%"},
		{"positive Inf", math.Inf(1), "0.000%"},
		{"negative Inf", math.Inf(-1), "0.000%"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := formatPercentage(tt.input)
			if got != tt.want {
				t.Errorf("formatPercentage(%v) = %q, want %q", tt.input, got, tt.want)
			}
		})
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

func TestProgressBar_RenderFrameEdgeCases(t *testing.T) {
	tests := []struct {
		name            string
		totalBytes      int64
		bytesDownloaded int64
		elapsed         time.Duration
		wantContains    []string
		wantNotContains []string
	}{
		{
			name:            "nil progress bar",
			totalBytes:      0,
			bytesDownloaded: 0,
		},
		{
			name:            "zero totalBytes (chunked/unknown stream)",
			totalBytes:      0,
			bytesDownloaded: 1024,
			elapsed:         1 * time.Second,
			wantContains:    []string{"[ 1.02kB ]", "kB/s"},
			wantNotContains: []string{"NaN", "Inf", "%"},
		},
		{
			name:            "negative totalBytes (indefinite stream)",
			totalBytes:      -1,
			bytesDownloaded: 2048,
			elapsed:         2 * time.Second,
			wantContains:    []string{"[ 2.05kB ]"},
			wantNotContains: []string{"NaN", "Inf", "%"},
		},
		{
			name:            "zero bytes downloaded with positive totalBytes",
			totalBytes:      10000,
			bytesDownloaded: 0,
			elapsed:         100 * time.Millisecond,
			wantContains:    []string{"0.000%", "0B/10.00kB"},
			wantNotContains: []string{"NaN", "Inf"},
		},
		{
			name:            "bytesDownloaded exceeds totalBytes",
			totalBytes:      1000,
			bytesDownloaded: 2000,
			elapsed:         1 * time.Second,
			wantContains:    []string{"100.0%", "1.00kB/1.00kB"},
			wantNotContains: []string{"NaN", "Inf"},
		},
		{
			name:            "negative bytesDownloaded",
			totalBytes:      1000,
			bytesDownloaded: -50,
			elapsed:         1 * time.Second,
			wantContains:    []string{"0.000%", "0B/1.00kB"},
			wantNotContains: []string{"NaN", "Inf"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.name == "nil progress bar" {
				var nilBar *ProgressBar
				if got := nilBar.RenderFrame(); got != "" {
					t.Fatalf("expected empty string for nilBar.RenderFrame(), got %q", got)
				}
				return
			}

			bar := NewProgressBar(tt.totalBytes, "tool.tar.gz")
			bar.bytesDownloaded = tt.bytesDownloaded
			bar.startTime = time.Now().Add(-tt.elapsed)

			frame := bar.RenderFrame()
			for _, want := range tt.wantContains {
				if !strings.Contains(frame, want) {
					t.Errorf("RenderFrame() missing %q, got: %q", want, frame)
				}
			}
			for _, notWant := range tt.wantNotContains {
				if strings.Contains(frame, notWant) {
					t.Errorf("RenderFrame() unexpectedly contains %q, got: %q", notWant, frame)
				}
			}
		})
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

func TestProgressBar_NonTTYSuppression(t *testing.T) {
	// Verify that when isTTY is false (e.g. cat | shim, spawnChild, or piped stdio),
	// NewProgressBar constructs a bar with isTTY=false and rendering produces no output.
	bar := NewProgressBar(1000, "file.txt")
	if bar.isTTY {
		t.Errorf("expected bar.isTTY to be false when stdio is non-terminal / piped")
	}

	// Calling Start, Update, Finish on non-TTY bar must be a no-op
	bar.Start()
	bar.Update(100)
	bar.Update(500)
	bar.Finish()
}

func TestRenderFancyProgressFieldEdgeCases(t *testing.T) {
	tests := []struct {
		name            string
		percentage      float64
		percentageText  string
		transferredText string
		totalText       string
		useAnsi         bool
	}{
		{"0% with ANSI", 0.0, "0.00%", "0B", "1.00MB", true},
		{"0% without ANSI", 0.0, "0.00%", "0B", "1.00MB", false},
		{"100% with ANSI", 100.0, "100.0%", "1.00MB", "1.00MB", true},
		{"100% without ANSI", 100.0, "100.0%", "1.00MB", "1.00MB", false},
		{"Negative percentage", -10.0, "0.00%", "0B", "1.00MB", true},
		{">100% percentage", 150.0, "100.0%", "1.50MB", "1.00MB", true},
		{"NaN percentage", math.NaN(), "0.00%", "0B", "1.00MB", true},
		{"Inf percentage", math.Inf(1), "0.00%", "0B", "1.00MB", true},
		{"Long text", 100.0, "100.000000000000000000000000000000%", "1000000000000000000000000000000B", "1000000000000000000000000000000B", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := renderFancyProgressField(tt.percentage, tt.percentageText, tt.transferredText, tt.totalText, tt.useAnsi)
			if got == "" {
				t.Fatalf("renderFancyProgressField returned empty string")
			}
			if strings.Contains(got, "NaN") || strings.Contains(got, "Inf") {
				t.Fatalf("renderFancyProgressField output contains NaN/Inf: %q", got)
			}
		})
	}

	// Formatting styles helper
	style := getProgressFieldStyle(5, 10, 0, 10, 0, 10)
	if style == "" {
		t.Errorf("getProgressFieldStyle returned empty style")
	}
}

func TestFormatSpeedAndProgressFieldStyles(t *testing.T) {
	tests := []struct {
		name            string
		bytesDownloaded int64
		elapsedMs       int64
		want            string
	}{
		{"zero downloaded", 0, 1000, "0B/s"},
		{"negative downloaded", -10, 1000, "0B/s"},
		{"zero elapsed", 100, 0, "0B/s"},
		{"negative elapsed", 100, -100, "0B/s"},
		{"1MB in 1s", 1024 * 1024, 1000, "1.05MB/s"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := formatSpeed(tt.bytesDownloaded, tt.elapsedMs)
			if got != tt.want {
				t.Errorf("formatSpeed(%d, %d) = %q, want %q", tt.bytesDownloaded, tt.elapsedMs, got, tt.want)
			}
		})
	}

	// renderStyledProgressField
	_ = renderStyledProgressField(" 50.00% (500B/1.00kB) ", 5, 1, 7, 9, 21)

	// getProgressFieldStyle
	_ = getProgressFieldStyle(3, 5, 1, 7, 9, 21)
}

func TestIsInteractiveTTY(t *testing.T) {
	// In go test, standard streams are captured buffers (non-TTY)
	if isInteractiveTTY() {
		t.Errorf("expected isInteractiveTTY() to be false in go test runner environment")
	}

	// In CI environment, it should also be false
	t.Setenv("CI", "true")
	if isInteractiveTTY() {
		t.Errorf("expected isInteractiveTTY() to be false when CI is set")
	}
}

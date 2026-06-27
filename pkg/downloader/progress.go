package downloader

import (
	"fmt"
	"math"
	"os"
	"strings"
	"time"

	"github.com/mattn/go-isatty"
)

const (
	progressFieldWidth      = 40
	etaVisibilityDelay      = 2 * time.Second
	activeIcon             = "⏵"
	ansiReset              = "\u001b[0m"
	ansiBlue               = "\u001b[34m"
	ansiBold               = "\u001b[1m"
	ansiDim                = "\u001b[2m"
	ansiBlackOnWhite       = "\u001b[30;107m"
	ansiGrayOnWhite        = "\u001b[90;107m"
	ansiYellowOnGray       = "\u001b[33;100m"
	ansiWhiteOnGray        = "\u001b[37;100m"
	ansiGrayBackground     = "\u001b[100m"
)

// ProgressBar manages terminal rendering of interactive download progress.
type ProgressBar struct {
	totalBytes      int64
	bytesDownloaded int64
	startTime       time.Time
	lastUpdate      time.Time
	isTTY           bool
	filename        string
}

// NewProgressBar constructs a new ProgressBar for a given file size and name.
func NewProgressBar(totalBytes int64, filename string) *ProgressBar {
	// Only render on real TTY, not in CI or quiet mode
	isTTY := isatty.IsTerminal(os.Stderr.Fd()) && os.Getenv("CI") == ""
	return &ProgressBar{
		totalBytes: totalBytes,
		startTime:  time.Now(),
		isTTY:      isTTY,
		filename:   filename,
	}
}

// Start hides the terminal cursor if we are running in a TTY.
func (p *ProgressBar) Start() {
	if p.isTTY {
		fmt.Fprint(os.Stderr, "\x1b[?25l") // Hide cursor
	}
}

// Finish restores the cursor and writes a newline.
func (p *ProgressBar) Finish() {
	if p.isTTY {
		fmt.Fprint(os.Stderr, "\x1b[?25h\n") // Show cursor + newline
	}
}

// Update updates the progress values and prints the progress frame to stderr.
func (p *ProgressBar) Update(downloaded int64) {
	p.bytesDownloaded = downloaded
	p.lastUpdate = time.Now()

	if !p.isTTY {
		return
	}

	frame := p.RenderFrame()
	fmt.Fprintf(os.Stderr, "\r%s\x1b[K", frame)
}

// RenderFrame generates the colored, formatted progress bar string.
func (p *ProgressBar) RenderFrame() string {
	elapsed := time.Since(p.startTime)
	elapsedMs := elapsed.Milliseconds()

	speedText := formatSpeed(p.bytesDownloaded, elapsedMs)
	prefix := renderPrefix(p.filename, true)

	if p.totalBytes <= 0 {
		progressText := fmt.Sprintf("[ %s ]", formatBytes(float64(p.bytesDownloaded)))
		return fmt.Sprintf("%s %s %s", prefix, highlight(progressText, true), speedText)
	}

	transferredBytes := p.bytesDownloaded
	if transferredBytes > p.totalBytes {
		transferredBytes = p.totalBytes
	}

	var percentage float64
	if p.totalBytes > 0 {
		percentage = (float64(transferredBytes) / float64(p.totalBytes)) * 100
		if percentage > 100 {
			percentage = 100
		}
	}

	percentageText := formatPercentage(percentage)
	transferredText := formatBytes(float64(transferredBytes))
	totalText := formatBytes(float64(p.totalBytes))

	progressField := renderFancyProgressField(percentage, percentageText, transferredText, totalText, true)
	etaText := formatEta(p.bytesDownloaded, p.totalBytes, elapsedMs, true)

	return fmt.Sprintf("%s %s %s%s", prefix, progressField, speedText, etaText)
}

func highlight(text string, useAnsi bool) string {
	if !useAnsi {
		return text
	}
	return ansiBlackOnWhite + text + ansiReset
}

func renderPrefix(filename string, useAnsi bool) string {
	if !useAnsi {
		return activeIcon + " " + filename
	}
	return ansiBlue + activeIcon + ansiReset + " " + ansiBold + filename + ansiReset
}

func renderFancyProgressField(percentage float64, percentageText, transferredText, totalText string, useAnsi bool) string {
	transferSummary := fmt.Sprintf("(%s/%s)", transferredText, totalText)
	progressFieldText := fmt.Sprintf(" %s %s ", percentageText, transferSummary)

	leftPadCount := (progressFieldWidth - len(progressFieldText)) / 2
	if leftPadCount < 0 {
		leftPadCount = 0
	}
	leftPad := strings.Repeat(" ", leftPadCount)

	visibleFieldText := leftPad + progressFieldText
	if len(visibleFieldText) < progressFieldWidth {
		visibleFieldText += strings.Repeat(" ", progressFieldWidth-len(visibleFieldText))
	}

	if !useAnsi {
		return strings.TrimSpace(visibleFieldText)
	}

	percentageStart := len(leftPad) + 1
	percentageEnd := percentageStart + len(percentageText)
	transferStart := percentageEnd + 1
	transferEnd := transferStart + len(transferSummary)
	loadedChars := int(math.Floor(progressFieldWidth * (percentage / 100)))

	return renderStyledProgressField(visibleFieldText, loadedChars, percentageStart, percentageEnd, transferStart, transferEnd)
}

func renderStyledProgressField(visibleFieldText string, loadedChars, percentageStart, percentageEnd, transferStart, transferEnd int) string {
	var sb strings.Builder
	activeStyle := ""

	for index := 0; index < len(visibleFieldText); index++ {
		nextStyle := getProgressFieldStyle(index, loadedChars, percentageStart, percentageEnd, transferStart, transferEnd)

		if nextStyle != activeStyle {
			if len(activeStyle) > 0 {
				sb.WriteString(ansiReset)
			}
			sb.WriteString(nextStyle)
			activeStyle = nextStyle
		}
		sb.WriteByte(visibleFieldText[index])
	}

	sb.WriteString(ansiReset)
	return sb.String()
}

func getProgressFieldStyle(index, loadedChars, percentageStart, percentageEnd, transferStart, transferEnd int) string {
	isLoaded := index < loadedChars
	isPercentage := index >= percentageStart && index < percentageEnd
	isTransferSummary := index >= transferStart && index < transferEnd

	if isLoaded && isTransferSummary {
		return ansiGrayOnWhite
	}
	if isLoaded {
		return ansiBlackOnWhite
	}
	if isPercentage {
		return ansiYellowOnGray
	}
	if isTransferSummary {
		return ansiWhiteOnGray
	}
	return ansiGrayBackground
}

func formatSpeed(bytesDownloaded int64, elapsedMs int64) string {
	if elapsedMs <= 0 {
		return "0B/s"
	}
	speed := float64(bytesDownloaded) / (float64(elapsedMs) / 1000.0)
	return formatBytes(speed) + "/s"
}

func formatEta(bytesDownloaded, totalBytes, elapsedMs int64, useAnsi bool) string {
	elapsed := time.Duration(elapsedMs) * time.Millisecond
	if elapsed < etaVisibilityDelay || bytesDownloaded <= 0 || bytesDownloaded >= totalBytes {
		return ""
	}

	remainingBytes := totalBytes - bytesDownloaded
	bytesPerMs := float64(bytesDownloaded) / float64(elapsedMs)

	if bytesPerMs <= 0 {
		return ""
	}

	etaMs := float64(remainingBytes) / bytesPerMs
	etaDuration := time.Duration(etaMs) * time.Millisecond
	etaText := fmt.Sprintf(" | %s left", formatDuration(etaDuration))

	if useAnsi {
		return ansiDim + etaText + ansiReset
	}
	return etaText
}

func formatDuration(d time.Duration) string {
	totalSeconds := int64(math.Ceil(d.Seconds()))
	hours := totalSeconds / 3600
	minutes := (totalSeconds % 3600) / 60
	seconds := totalSeconds % 60

	if hours > 0 {
		return fmt.Sprintf("%dh %dm", hours, minutes)
	}
	if minutes > 0 {
		return fmt.Sprintf("%dm %ds", minutes, seconds)
	}
	return fmt.Sprintf("%ds", seconds)
}

func formatBytes(bytes float64) string {
	units := []string{"B", "kB", "MB", "GB", "TB"}
	if bytes < 1000 {
		return fmt.Sprintf("%.0fB", bytes)
	}

	unitIndex := 0
	value := bytes
	for value >= 1000 && unitIndex < len(units)-1 {
		value /= 1000
		unitIndex++
	}

	return fmt.Sprintf("%.2f%s", value, units[unitIndex])
}

func formatPercentage(percentage float64) string {
	s := fmt.Sprintf("%.4f", percentage)
	if len(s) > 5 {
		s = s[:5]
	}
	return s + "%"
}

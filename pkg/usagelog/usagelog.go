// Package usagelog records best-effort last-used observations from shim markers
// and migrates legacy invocation logs without accumulating invocation counts.
package usagelog

import (
	"bufio"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

const (
	dirName  = "usage"
	fileName = "shim-usage.log"

	// Version is the first field of legacy event lines. Lines
	// carrying any other version are counted as invalid and skipped.
	Version = "v1"

	// maxRotationSuffix bounds the search for a free rotated file name.
	maxRotationSuffix = 1000
)

// Dir returns the directory holding activity markers and legacy usage logs.
func Dir(generatedDir string) string {
	return filepath.Join(generatedDir, dirName)
}

// Path returns the legacy active usage log written by older generated shims.
func Path(generatedDir string) string {
	return filepath.Join(Dir(generatedDir), fileName)
}

// Entry is one shim invocation parsed from the log.
type Entry struct {
	ToolName   string
	BinaryName string
	UsedAt     time.Time
}

// ParseLine decodes one log line. ok is false for blank lines and for lines that
// do not match the format, so callers can tell a skipped line from a blank one by
// checking the trimmed line themselves.
func ParseLine(line string) (entry Entry, ok bool) {
	trimmed := strings.TrimSpace(line)
	if trimmed == "" {
		return Entry{}, false
	}

	parts := strings.Split(trimmed, "\t")
	if len(parts) != 4 {
		return Entry{}, false
	}
	version, secondsText, toolName, binaryName := parts[0], parts[1], parts[2], parts[3]
	if version != Version || toolName == "" || binaryName == "" {
		return Entry{}, false
	}

	seconds, err := strconv.ParseInt(secondsText, 10, 64)
	if err != nil || seconds < 0 {
		return Entry{}, false
	}

	return Entry{
		ToolName:   toolName,
		BinaryName: binaryName,
		UsedAt:     time.Unix(seconds, 0),
	}, true
}

// Result summarises one Import run.
type Result struct {
	// Files is how many rotated log files were folded into the registry and deleted.
	Files int
	// Events is how many valid invocation lines those files held.
	Events int
	// InvalidLines is how many non-blank lines were skipped as unparseable.
	InvalidLines int
	// Markers is how many binary timestamps were refreshed from marker metadata.
	Markers int
}

// Import refreshes configured last-used markers and migrates remaining legacy
// logs. Timestamps merge monotonically with zero count increments, so retrying
// after failed cleanup or running concurrent imports is idempotent.
func Import(ctx context.Context, fsys fs.FS, reg *registry.Registry, generatedDir string, tools ...*config.ToolConfig) (Result, error) {
	markers, markerErr := RefreshMarkers(ctx, fsys, reg, generatedDir, tools...)
	total := Result{Markers: markers}
	if err := rotateActiveLog(fsys, generatedDir, time.Now(), os.Getpid()); err != nil {
		return total, errors.Join(markerErr, err)
	}

	rotated, err := rotatedLogs(fsys, generatedDir)
	if err != nil {
		return total, errors.Join(markerErr, err)
	}

	importErr := markerErr
	for _, logPath := range rotated {
		if err := ctx.Err(); err != nil {
			return total, errors.Join(importErr, err)
		}
		res, err := importFile(ctx, fsys, reg, logPath)
		if err != nil {
			importErr = errors.Join(importErr, err)
			continue
		}
		total.Files += res.Files
		total.Events += res.Events
		total.InvalidLines += res.InvalidLines
	}
	return total, importErr
}

// rotateActiveLog isolates a legacy snapshot. A legacy writer already holding
// its descriptor can still append afterward; occasional missed observations are
// acceptable, and new shims use persistent markers instead.
func rotateActiveLog(fsys fs.FS, generatedDir string, now time.Time, pid int) error {
	active := Path(generatedDir)
	exists, err := fsys.Exists(active)
	if err != nil {
		return fmt.Errorf("checking usage log %s: %w", active, err)
	}
	if !exists {
		return nil
	}

	for suffix := 0; suffix < maxRotationSuffix; suffix++ {
		rotatedPath := filepath.Join(Dir(generatedDir), rotatedName(now, pid, suffix))
		taken, err := fsys.Exists(rotatedPath)
		if err != nil {
			return fmt.Errorf("checking rotated usage log %s: %w", rotatedPath, err)
		}
		if taken {
			continue
		}
		if err := fsys.Rename(active, rotatedPath); err != nil {
			if os.IsNotExist(err) {
				return nil // Another importer already moved the active log.
			}
			return fmt.Errorf("rotating usage log %s: %w", active, err)
		}
		return nil
	}
	return fmt.Errorf("rotating usage log %s: no free rotated name after %d attempts", active, maxRotationSuffix)
}

// rotatedName is "<fileName>.<unix ms>.<pid>", with ".<suffix>" appended when
// suffix is positive, so concurrent importers and repeated runs never collide.
func rotatedName(now time.Time, pid, suffix int) string {
	name := fmt.Sprintf("%s.%d.%d", fileName, now.UnixMilli(), pid)
	if suffix > 0 {
		name += "." + strconv.Itoa(suffix)
	}
	return name
}

func isRotatedName(name string) bool {
	return strings.HasPrefix(name, fileName+".")
}

// rotatedLogs lists the rotated logs under Dir sorted by name, which orders them
// by rotation time because the name starts with the millisecond timestamp.
func rotatedLogs(fsys fs.FS, generatedDir string) ([]string, error) {
	dir := Dir(generatedDir)
	exists, err := fsys.Exists(dir)
	if err != nil {
		return nil, fmt.Errorf("checking usage log directory %s: %w", dir, err)
	}
	if !exists {
		return nil, nil
	}

	entries, err := fsys.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("listing usage log directory %s: %w", dir, err)
	}

	var paths []string
	for _, name := range entries {
		if isRotatedName(name) {
			paths = append(paths, filepath.Join(dir, name))
		}
	}
	sort.Strings(paths)
	return paths, nil
}

// aggregate retains the latest legacy observation for each binary.
type aggregate struct {
	toolName   string
	binaryName string
	lastUsedAt time.Time
}

// importFile records one rotated log's events in a single transaction and deletes
// the file only after the transaction committed, so a failure leaves the file in
// place for the next run.
func importFile(ctx context.Context, fsys fs.FS, reg *registry.Registry, logPath string) (Result, error) {
	reader, err := fsys.Open(logPath)
	if err != nil {
		if os.IsNotExist(err) {
			return Result{}, nil // A concurrent importer completed cleanup.
		}
		return Result{}, fmt.Errorf("reading usage log %s: %w", logPath, err)
	}

	defer reader.Close()

	res := Result{Files: 1}
	aggregates := make(map[string]*aggregate)
	var order []string
	scanner := bufio.NewScanner(reader)
	// Legacy logs can be large; retain only a bounded line and the latest per binary.
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	for scanner.Scan() {
		if err := ctx.Err(); err != nil {
			return Result{}, err
		}
		line := scanner.Text()
		entry, ok := ParseLine(line)
		if !ok {
			if strings.TrimSpace(line) != "" {
				res.InvalidLines++
			}
			continue
		}
		res.Events++

		key := entry.ToolName + "\x00" + entry.BinaryName
		agg, exists := aggregates[key]
		if !exists {
			agg = &aggregate{toolName: entry.ToolName, binaryName: entry.BinaryName}
			aggregates[key] = agg
			order = append(order, key)
		}
		if entry.UsedAt.After(agg.lastUsedAt) {
			agg.lastUsedAt = entry.UsedAt
		}
	}

	if err := scanner.Err(); err != nil {
		return Result{}, fmt.Errorf("reading usage log %s: %w", logPath, err)
	}

	err = reg.WithTx(ctx, func(tx *sql.Tx) error {
		for _, key := range order {
			agg := aggregates[key]
			record := &registry.ToolUsageRecord{
				ToolName:   agg.toolName,
				BinaryName: agg.binaryName,
				UsageCount: 0,
				LastUsedAt: agg.lastUsedAt.UnixMilli(),
			}
			if err := reg.RecordToolUsage(ctx, tx, record); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return Result{}, fmt.Errorf("recording usage from %s: %w", logPath, err)
	}

	if err := fsys.Remove(logPath); err != nil && !os.IsNotExist(err) {
		return Result{}, fmt.Errorf("removing imported usage log %s: %w", logPath, err)
	}
	return res, nil
}

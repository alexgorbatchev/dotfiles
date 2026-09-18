// Package usagelog imports the append-only log that generated shims write on every
// invocation into the registry's tool_usage table.
//
// Each shim appends one tab-separated line, "v1\t<unix seconds>\t<tool>\t<binary>",
// to the active log under paths.generatedDir. Import rotates that file aside so
// shims keep appending to a fresh one, folds every rotated file into per-binary
// counters and deletes it. The dashboard runs Import when it starts, which is where
// the usage views get their data.
package usagelog

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

const (
	dirName  = "usage"
	fileName = "shim-usage.log"

	// Version is the first field of every line the shim template writes. Lines
	// carrying any other version are counted as invalid and skipped.
	Version = "v1"

	// maxRotationSuffix bounds the search for a free rotated file name.
	maxRotationSuffix = 1000
)

// Dir returns the directory holding the active and rotated usage logs.
func Dir(generatedDir string) string {
	return filepath.Join(generatedDir, dirName)
}

// Path returns the active usage log that shims append to.
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
}

// Import rotates the active usage log aside, folds every rotated log under Dir
// into the registry and deletes each file once its events are recorded. Files are
// processed oldest first by name. A missing log directory or active log is not an
// error: the result is simply empty.
func Import(ctx context.Context, fsys fs.FS, reg *registry.Registry, generatedDir string) (Result, error) {
	if err := rotateActiveLog(fsys, generatedDir, time.Now(), os.Getpid()); err != nil {
		return Result{}, err
	}

	rotated, err := rotatedLogs(fsys, generatedDir)
	if err != nil {
		return Result{}, err
	}

	var total Result
	for _, logPath := range rotated {
		res, err := importFile(ctx, fsys, reg, logPath)
		if err != nil {
			return total, err
		}
		total.Files += res.Files
		total.Events += res.Events
		total.InvalidLines += res.InvalidLines
	}
	return total, nil
}

// rotateActiveLog renames the active log to a name no shim writes to, so events
// appended while the import runs land in a fresh active log instead of being lost
// when the imported file is deleted.
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

// aggregate is the per-binary fold of one log file: how many events and the
// latest one, which is what the registry stores.
type aggregate struct {
	toolName   string
	binaryName string
	count      int
	lastUsedAt time.Time
}

// importFile records one rotated log's events in a single transaction and deletes
// the file only after the transaction committed, so a failure leaves the file in
// place for the next run.
func importFile(ctx context.Context, fsys fs.FS, reg *registry.Registry, logPath string) (Result, error) {
	content, err := fsys.ReadFile(logPath)
	if err != nil {
		return Result{}, fmt.Errorf("reading usage log %s: %w", logPath, err)
	}

	res := Result{Files: 1}
	aggregates := make(map[string]*aggregate)
	var order []string
	for _, line := range strings.Split(string(content), "\n") {
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
		agg.count++
		if entry.UsedAt.After(agg.lastUsedAt) {
			agg.lastUsedAt = entry.UsedAt
		}
	}

	err = reg.WithTx(ctx, func(tx *sql.Tx) error {
		for _, key := range order {
			agg := aggregates[key]
			record := &registry.ToolUsageRecord{
				ToolName:   agg.toolName,
				BinaryName: agg.binaryName,
				UsageCount: agg.count,
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

	if err := fsys.Remove(logPath); err != nil {
		return Result{}, fmt.Errorf("removing imported usage log %s: %w", logPath, err)
	}
	return res, nil
}

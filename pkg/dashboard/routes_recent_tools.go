package dashboard

import (
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

// GET /api/recent-tools
func (s *Server) handleRecentTools(w http.ResponseWriter, r *http.Request) {
	if s.projectConfig == nil {
		writeJSON(w, false, nil, "Project config is not initialized")
		return
	}
	limit := 10
	if lStr := r.URL.Query().Get("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 {
			limit = l
		}
	}

	tools := []map[string]any{}

	// Walk tool configs directories to find .tool.ts files
	var toolFiles []string
	seenFiles := make(map[string]bool)
	for _, resolvedDir := range s.toolConfigsDirs() {
		_ = filepath.Walk(resolvedDir, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return nil
			}
			if !info.IsDir() && strings.HasSuffix(path, ".tool.ts") {
				if !seenFiles[path] {
					seenFiles[path] = true
					toolFiles = append(toolFiles, path)
				}
			}
			return nil
		})
	}

	type recentItem struct {
		name  string
		path  string
		mtime int64
	}
	items := []recentItem{}
	for _, fp := range toolFiles {
		stat, err := os.Stat(fp)
		if err != nil {
			continue
		}
		name := filepath.Base(fp)
		name = strings.TrimSuffix(name, ".tool.ts")
		mtime := stat.ModTime().UnixMilli()
		items = append(items, recentItem{
			name:  name,
			path:  fp,
			mtime: mtime,
		})
	}

	// Sort items descending by modification time
	sort.Slice(items, func(i, j int) bool {
		return items[i].mtime > items[j].mtime
	})

	for i, item := range items {
		if i >= limit {
			break
		}
		tools = append(tools, map[string]any{
			"name":            item.name,
			"configFilePath":  item.path,
			"relativeTime":    formatRelativeTime(item.mtime),
			"timestampSource": "mtime",
		})
	}

	writeJSON(w, true, map[string]any{"tools": tools}, "")
}

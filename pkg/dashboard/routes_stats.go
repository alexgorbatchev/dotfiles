package dashboard

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

// GET /api/stats
func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if s.registry == nil {
		writeJSON(w, false, nil, "Registry is not initialized")
		return
	}
	stats, err := s.registry.GetStats(ctx)
	if err != nil {
		writeJSON(w, false, nil, "Failed to get database stats: "+err.Error())
		return
	}
	installations, err := s.registry.GetAllToolInstallations(ctx)
	if err != nil {
		writeJSON(w, false, nil, "Failed to get installations: "+err.Error())
		return
	}

	var oldestPtr *string
	if stats.OldestOperation > 0 {
		val := time.UnixMilli(stats.OldestOperation).UTC().Format(time.RFC3339)
		oldestPtr = &val
	}
	var newestPtr *string
	if stats.NewestOperation > 0 {
		val := time.UnixMilli(stats.NewestOperation).UTC().Format(time.RFC3339)
		newestPtr = &val
	}

	data := map[string]any{
		"toolsInstalled":   len(installations),
		"updatesAvailable": 0,
		"filesTracked":     stats.TotalFiles,
		"totalOperations":  stats.TotalOperations,
		"oldestOperation":  oldestPtr,
		"newestOperation":  newestPtr,
	}
	writeJSON(w, true, data, "")
}

// GET /api/health
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	checks := []map[string]any{}

	toolCount := 0
	unhealthyTools := []string{}
	orphanedRecords := []string{}
	unusedVersions := []string{}

	binariesDir := ""
	if s.projectConfig != nil {
		binariesDir = s.projectConfig.Paths.BinariesDir
	}

	installs, err := s.registry.GetAllToolInstallations(ctx)
	if err == nil {
		for _, inst := range installs {
			_, err := os.Stat(inst.InstallPath)
			if err != nil || os.IsNotExist(err) {
				orphanedRecords = append(orphanedRecords, fmt.Sprintf("Tool %s: install path %s does not exist on disk", inst.ToolName, inst.InstallPath))
			}
		}
	}

	for _, tc := range s.toolConfigs {
		inst, _ := s.registry.GetToolInstallation(ctx, tc.Name)
		if inst != nil {
			toolCount++
			binNames := []string{}
			for _, b := range tc.Binaries {
				switch val := b.(type) {
				case string:
					binNames = append(binNames, val)
				case map[string]any:
					if name, ok := val["name"].(string); ok {
						binNames = append(binNames, name)
					}
				}
			}
			if len(binNames) == 0 {
				binNames = []string{tc.Name}
			}

			if binariesDir != "" {
				currentDir := filepath.Join(binariesDir, tc.Name, "current")
				for _, name := range binNames {
					binPath := filepath.Join(currentDir, name)
					if _, err := os.Stat(binPath); err != nil {
						unhealthyTools = append(unhealthyTools, fmt.Sprintf("Tool %s: missing expected binary %s", tc.Name, binPath))
						break
					}
				}
			}
		}
	}

	if binariesDir != "" {
		if toolDirs, err := os.ReadDir(binariesDir); err == nil {
			for _, td := range toolDirs {
				if !td.IsDir() {
					continue
				}
				toolName := td.Name()
				toolDirPath := filepath.Join(binariesDir, toolName)

				var installedVer string
				inst, _ := s.registry.GetToolInstallation(ctx, toolName)
				if inst != nil {
					installedVer = inst.Version
				}

				if versionDirs, err := os.ReadDir(toolDirPath); err == nil {
					for _, vd := range versionDirs {
						if !vd.IsDir() {
							continue
						}
						vName := vd.Name()
						if vName != "current" && (installedVer == "" || vName != installedVer) {
							unusedVersions = append(unusedVersions, filepath.Join(toolDirPath, vName))
						}
					}
				}
			}
		}
	}

	// 1. Tool Installations Check
	toolInstallStatus := "pass"
	toolInstallMsg := fmt.Sprintf("%d tool(s) installed", toolCount)
	if len(unhealthyTools) > 0 {
		toolInstallStatus = "warn"
		toolInstallMsg = fmt.Sprintf("%d unhealthy tool(s) detected", len(unhealthyTools))
	} else if toolCount == 0 {
		toolInstallStatus = "warn"
		toolInstallMsg = "No tools installed"
	}
	checks = append(checks, map[string]any{
		"name":    "Tool Installations",
		"status":  toolInstallStatus,
		"message": toolInstallMsg,
		"details": unhealthyTools,
	})

	// 2. Registry Integrity Check
	registryStatus := "pass"
	registryMsg := "Registry is healthy"
	if len(orphanedRecords) > 0 {
		registryStatus = "warn"
		registryMsg = fmt.Sprintf("Registry contains %d orphaned record(s)", len(orphanedRecords))
	}
	checks = append(checks, map[string]any{
		"name":    "Registry Integrity",
		"status":  registryStatus,
		"message": registryMsg,
		"details": orphanedRecords,
	})

	// 3. Unused Binary Versions Check
	unusedStatus := "pass"
	unusedMsg := "No unused binary versions found"
	if len(unusedVersions) > 0 {
		unusedStatus = "warn"
		unusedMsg = fmt.Sprintf("Found %d unused binary version(s)", len(unusedVersions))
	}
	checks = append(checks, map[string]any{
		"name":    "Unused Binary Versions",
		"status":  unusedStatus,
		"message": unusedMsg,
		"details": unusedVersions,
	})

	overall := "healthy"
	for _, c := range checks {
		if c["status"] == "warn" {
			overall = "warning"
		} else if c["status"] == "fail" {
			overall = "unhealthy"
		}
	}

	data := map[string]any{
		"overall":   overall,
		"checks":    checks,
		"lastCheck": time.Now().UTC().Format(time.RFC3339),
	}
	writeJSON(w, true, data, "")
}

// GET /api/activity
func (s *Server) handleActivity(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if s.registry == nil {
		writeJSON(w, false, nil, "Registry is not initialized")
		return
	}

	limit := 20
	if lStr := r.URL.Query().Get("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 {
			limit = l
		}
	}

	ops, err := s.registry.GetFileOperations(ctx, registry.FileOperationFilter{})
	if err != nil {
		writeJSON(w, false, nil, "Failed to get operations: "+err.Error())
		return
	}

	activities := []map[string]any{}
	for i, op := range ops {
		if i >= limit {
			break
		}
		activities = append(activities, map[string]any{
			"id":           op.ID,
			"toolName":     op.ToolName,
			"action":       op.OperationType,
			"description":  fmt.Sprintf("%s %s: %s", op.OperationType, op.FileType, op.FilePath),
			"timestamp":    time.UnixMilli(op.CreatedAt).UTC().Format(time.RFC3339),
			"relativeTime": formatRelativeTime(op.CreatedAt),
		})
	}

	data := map[string]any{
		"activities": activities,
		"totalCount": len(ops),
	}
	writeJSON(w, true, data, "")
}

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

	toolConfigsDir := s.projectConfig.Paths.ToolConfigsDir
	tools := []map[string]any{}

	// Walk tool configs directory to find .tool.ts files
	var toolFiles []string
	_ = filepath.Walk(toolConfigsDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() && strings.HasSuffix(path, ".tool.ts") {
			toolFiles = append(toolFiles, path)
		}
		return nil
	})

	type recentItem struct {
		name      string
		path      string
		mtime     int64
		createdAt string
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
			name:      name,
			path:      fp,
			mtime:     mtime,
			createdAt: stat.ModTime().UTC().Format(time.RFC3339),
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
			"createdAt":       item.createdAt,
			"relativeTime":    formatRelativeTime(item.mtime),
			"timestampSource": "mtime",
		})
	}

	writeJSON(w, true, map[string]any{"tools": tools}, "")
}

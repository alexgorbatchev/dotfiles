package dashboard

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/features"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

// writeJSON writes a structured JSON response to the client.
func writeJSON(w http.ResponseWriter, success bool, data any, errMsg string) {
	w.Header().Set("Content-Type", "application/json")
	var res map[string]any
	if success {
		res = map[string]any{
			"success": true,
			"data":    data,
		}
	} else {
		res = map[string]any{
			"success": false,
			"error":   errMsg,
		}
	}
	_ = json.NewEncoder(w).Encode(res)
}

// formatRelativeTime converts millisecond timestamp difference to human-readable strings.
func formatRelativeTime(timestamp int64) string {
	diff := time.Now().UnixMilli() - timestamp
	if diff < 0 {
		diff = 0
	}
	seconds := diff / 1000
	if seconds < 60 {
		return "just now"
	}
	minutes := seconds / 60
	if minutes < 60 {
		if minutes == 1 {
			return "1 minute ago"
		}
		return fmt.Sprintf("%d minutes ago", minutes)
	}
	hours := minutes / 60
	if hours < 24 {
		if hours == 1 {
			return "1 hour ago"
		}
		return fmt.Sprintf("%d hours ago", hours)
	}
	days := hours / 24
	if days < 30 {
		if days == 1 {
			return "1 day ago"
		}
		return fmt.Sprintf("%d days ago", days)
	}
	months := days / 30
	if months == 1 {
		return "1 month ago"
	}
	return fmt.Sprintf("%d months ago", months)
}

// RegisterRoutes sets up all API handlers inside Server.
func (s *Server) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/stats", s.handleStats)
	mux.HandleFunc("/api/config", s.handleConfig)
	mux.HandleFunc("/api/health", s.handleHealth)
	mux.HandleFunc("/api/activity", s.handleActivity)
	mux.HandleFunc("/api/recent-tools", s.handleRecentTools)
	mux.HandleFunc("/api/tools", s.handleToolsRouter)
	mux.HandleFunc("/api/tools/", s.handleToolsRouter)
	mux.HandleFunc("/api/tool-configs-tree", s.handleToolConfigsTree)
	mux.HandleFunc("/api/shell", s.handleShellIntegration)
}

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

// GET /api/config
func (s *Server) handleConfig(w http.ResponseWriter, r *http.Request) {
	if s.projectConfig == nil {
		writeJSON(w, false, nil, "Project configuration is not initialized")
		return
	}
	paths := s.projectConfig.Paths
	data := map[string]string{
		"dotfilesDir":    paths.DotfilesDir,
		"generatedDir":   paths.GeneratedDir,
		"binariesDir":    paths.BinariesDir,
		"targetDir":      paths.TargetDir,
		"toolConfigsDir": paths.ToolConfigsDir,
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

// GET /api/shell
func (s *Server) handleShellIntegration(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if s.registry == nil {
		writeJSON(w, false, nil, "Registry is not initialized")
		return
	}

	completionOps, _ := s.registry.GetFileOperations(ctx, registry.FileOperationFilter{FileType: "completion"})
	initOps, _ := s.registry.GetFileOperations(ctx, registry.FileOperationFilter{FileType: "init"})

	completions := []map[string]any{}
	completionMap := make(map[string]bool)
	for _, op := range completionOps {
		if op.OperationType != "rm" && !completionMap[op.FilePath] {
			completionMap[op.FilePath] = true
			completions = append(completions, map[string]any{
				"toolName":     op.ToolName,
				"filePath":     op.FilePath,
				"fileType":     "completion",
				"lastModified": time.UnixMilli(op.CreatedAt).UTC().Format(time.RFC3339),
			})
		}
	}

	initScripts := []map[string]any{}
	initMap := make(map[string]bool)
	for _, op := range initOps {
		if op.OperationType != "rm" && !initMap[op.FilePath] {
			initMap[op.FilePath] = true
			initScripts = append(initScripts, map[string]any{
				"toolName":     op.ToolName,
				"filePath":     op.FilePath,
				"fileType":     "init",
				"lastModified": time.UnixMilli(op.CreatedAt).UTC().Format(time.RFC3339),
			})
		}
	}

	writeJSON(w, true, map[string]any{
		"completions": completions,
		"initScripts": initScripts,
		"totalFiles":  len(completions) + len(initScripts),
	}, "")
}

// GET /api/tool-configs-tree
func (s *Server) handleToolConfigsTree(w http.ResponseWriter, r *http.Request) {
	if s.projectConfig == nil {
		writeJSON(w, false, nil, "Project config is not initialized")
		return
	}
	toolConfigsDir := s.projectConfig.Paths.ToolConfigsDir

	type treeNode struct {
		Name     string      `json:"name"`
		Path     string      `json:"path"`
		Type     string      `json:"type"` // "file" or "directory"
		Children []*treeNode `json:"children,omitempty"`
		ToolName string      `json:"toolName,omitempty"`
	}

	var buildNode func(dirPath string) ([]*treeNode, error)
	buildNode = func(dirPath string) ([]*treeNode, error) {
		entries, err := os.ReadDir(dirPath)
		if err != nil {
			return nil, err
		}
		var nodes []*treeNode
		for _, entry := range entries {
			fullPath := filepath.Join(dirPath, entry.Name())
			if entry.IsDir() {
				children, err := buildNode(fullPath)
				if err == nil && len(children) > 0 {
					nodes = append(nodes, &treeNode{
						Name:     entry.Name(),
						Path:     fullPath,
						Type:     "directory",
						Children: children,
					})
				}
			} else if strings.HasSuffix(entry.Name(), ".tool.ts") {
				toolName := strings.TrimSuffix(entry.Name(), ".tool.ts")
				nodes = append(nodes, &treeNode{
					Name:     entry.Name(),
					Path:     fullPath,
					Type:     "file",
					ToolName: toolName,
				})
			}
		}
		sort.Slice(nodes, func(i, j int) bool {
			if nodes[i].Type != nodes[j].Type {
				return nodes[i].Type == "directory"
			}
			return nodes[i].Name < nodes[j].Name
		})
		return nodes, nil
	}

	nodes, _ := buildNode(toolConfigsDir)
	if nodes == nil {
		nodes = []*treeNode{}
	}

	writeJSON(w, true, map[string]any{
		"rootPath": toolConfigsDir,
		"entries":  nodes,
	}, "")
}

// handleToolsRouter dispatches GET /api/tools or GET /api/tools/:name/...
func (s *Server) handleToolsRouter(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/tools")
	if path == "" || path == "/" {
		s.handleGetTools(w, r)
		return
	}

	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 {
		s.handleGetTools(w, r)
		return
	}

	toolName := parts[0]
	if len(parts) == 1 {
		// GET /api/tools/:name -> return full tool detail
		s.handleGetToolDetail(w, r, toolName)
		return
	}

	subRoute := parts[1]
	switch subRoute {
	case "history":
		s.handleToolHistory(w, r, toolName)
	case "readme":
		s.handleToolReadme(w, r, toolName)
	case "logs", "stream":
		s.handleToolLogsStream(w, r, toolName)
	case "source":
		s.handleToolSource(w, r, toolName)
	case "install":
		if r.Method != "POST" {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		s.handleToolInstall(w, r, toolName)
	case "check-update":
		if r.Method != "POST" {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		s.handleToolCheckUpdate(w, r, toolName)
	case "update":
		if r.Method != "POST" {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		s.handleToolUpdate(w, r, toolName)
	default:
		w.WriteHeader(http.StatusNotFound)
	}
}

// platformBitmaskToNames converts a platform bitmask integer to a slice of platform display names.
func platformBitmaskToNames(platforms int) []string {
	names := []string{}
	if platforms&1 != 0 {
		names = append(names, "Linux")
	}
	if platforms&2 != 0 {
		names = append(names, "macOS")
	}
	if platforms&4 != 0 {
		names = append(names, "Windows")
	}
	return names
}

// architectureBitmaskToNames converts an architecture bitmask integer to a slice of architecture display names.
func architectureBitmaskToNames(arch int) []string {
	names := []string{}
	if arch&1 != 0 {
		names = append(names, "x86_64")
	}
	if arch&2 != 0 {
		names = append(names, "arm64")
	}
	return names
}

// formatToolConfigForDashboard formats a ToolConfig into a map suitable for JSON serialization
// in the dashboard API, converting platform/architecture bitmasks into string arrays.
func formatToolConfigForDashboard(tc *config.ToolConfig) map[string]any {
	if tc == nil {
		return nil
	}
	data, err := json.Marshal(tc)
	if err != nil {
		return nil
	}
	var res map[string]any
	if err := json.Unmarshal(data, &res); err != nil {
		return nil
	}

	if len(tc.PlatformConfigs) > 0 {
		platformConfigs := make([]map[string]any, 0, len(tc.PlatformConfigs))
		for _, entry := range tc.PlatformConfigs {
			serializedEntry := make(map[string]any)

			if entry.Config != nil {
				if cfgBytes, err := json.Marshal(entry.Config); err == nil {
					var cfgMap map[string]any
					if err := json.Unmarshal(cfgBytes, &cfgMap); err == nil {
						for k, v := range cfgMap {
							serializedEntry[k] = v
						}
					}
				}
			}

			serializedEntry["platforms"] = platformBitmaskToNames(entry.Platforms)
			if entry.Architectures != nil {
				serializedEntry["architectures"] = architectureBitmaskToNames(*entry.Architectures)
			}

			platformConfigs = append(platformConfigs, serializedEntry)
		}
		res["platformConfigs"] = platformConfigs
	}

	return res
}

func (s *Server) getToolDetail(ctx context.Context, targetTool *config.ToolConfig) (map[string]any, error) {
	installRecord, _ := s.registry.GetToolInstallation(ctx, targetTool.Name)
	files, _ := s.registry.GetFileStatesForTool(ctx, targetTool.Name)
	if files == nil {
		files = []*registry.FileState{}
	}
	usages, _ := s.registry.GetToolUsagesForTool(ctx, targetTool.Name)

	status := "not-installed"
	var instVer *string
	var instAt *string
	var instPath *string
	binPaths := []string{}
	if installRecord != nil {
		status = "installed"
		instVer = &installRecord.Version
		val := time.UnixMilli(installRecord.InstalledAt).UTC().Format(time.RFC3339)
		instAt = &val
		instPath = &installRecord.InstallPath
		_ = json.Unmarshal([]byte(installRecord.BinaryPaths), &binPaths)
	}

	binNames := []string{}
	for _, b := range targetTool.Binaries {
		switch val := b.(type) {
		case string:
			binNames = append(binNames, val)
		case map[string]any:
			if name, ok := val["name"].(string); ok {
				binNames = append(binNames, name)
			}
		}
	}

	binUsages := []map[string]any{}
	totalUsage := 0
	usageMap := make(map[string]*registry.ToolUsageRecord)
	for _, u := range usages {
		usageMap[u.BinaryName] = u
	}

	for _, name := range binNames {
		count := 0
		var lastUsed *string
		if u, exists := usageMap[name]; exists {
			count = u.UsageCount
			totalUsage += u.UsageCount
			val := time.UnixMilli(u.LastUsedAt).UTC().Format(time.RFC3339)
			lastUsed = &val
		}
		binUsages = append(binUsages, map[string]any{
			"binaryName": name,
			"count":      count,
			"lastUsedAt": lastUsed,
		})
	}

	var diskSize int64 = 0
	for _, f := range files {
		if f.SizeBytes != nil {
			diskSize += *f.SizeBytes
		}
	}

	runtimeState := map[string]any{
		"status":           status,
		"installedVersion": instVer,
		"installedAt":      instAt,
		"installPath":      instPath,
		"binaryPaths":      binPaths,
		"hasUpdate":        false,
	}

	return map[string]any{
		"config":         formatToolConfigForDashboard(targetTool),
		"runtime":        runtimeState,
		"files":          files,
		"binaryDiskSize": diskSize,
		"usage": map[string]any{
			"totalCount": totalUsage,
			"binaries":   binUsages,
		},
	}, nil
}

// GET /api/tools
func (s *Server) handleGetTools(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if s.registry == nil {
		writeJSON(w, false, nil, "Registry is not initialized")
		return
	}

	tools := []map[string]any{}
	for _, tc := range s.toolConfigs {
		detail, _ := s.getToolDetail(ctx, tc)
		tools = append(tools, detail)
	}

	writeJSON(w, true, tools, "")
}

// GET /api/tools/:name
func (s *Server) handleGetToolDetail(w http.ResponseWriter, r *http.Request, toolName string) {
	ctx := r.Context()
	if s.registry == nil {
		writeJSON(w, false, nil, "Registry is not initialized")
		return
	}

	var targetTool *config.ToolConfig
	for _, tc := range s.toolConfigs {
		if tc.Name == toolName {
			targetTool = tc
			break
		}
	}

	if targetTool == nil {
		writeJSON(w, false, nil, "Tool not found")
		return
	}

	detail, _ := s.getToolDetail(ctx, targetTool)
	writeJSON(w, true, detail, "")
}

// GET /api/tools/:name/history
func (s *Server) handleToolHistory(w http.ResponseWriter, r *http.Request, toolName string) {
	ctx := r.Context()
	if s.registry == nil {
		writeJSON(w, false, nil, "Registry is not initialized")
		return
	}

	ops, err := s.registry.GetFileOperations(ctx, registry.FileOperationFilter{ToolName: toolName})
	if err != nil {
		writeJSON(w, false, nil, "Failed to get history: "+err.Error())
		return
	}

	entries := []map[string]any{}
	for _, op := range ops {
		entries = append(entries, map[string]any{
			"id":            op.ID,
			"operationType": op.OperationType,
			"fileType":      op.FileType,
			"filePath":      op.FilePath,
			"timestamp":     time.UnixMilli(op.CreatedAt).UTC().Format(time.RFC3339),
			"relativeTime":  formatRelativeTime(op.CreatedAt),
		})
	}

	installRecord, _ := s.registry.GetToolInstallation(ctx, toolName)
	var instAt *string
	if installRecord != nil {
		val := time.UnixMilli(installRecord.InstalledAt).UTC().Format(time.RFC3339)
		instAt = &val
	}

	dotfilesDir := ""
	if s.projectConfig != nil {
		dotfilesDir = s.projectConfig.Paths.DotfilesDir
	}

	data := map[string]any{
		"entries":     entries,
		"totalCount":  len(entries),
		"installedAt": instAt,
		"dotfilesDir": dotfilesDir,
	}

	writeJSON(w, true, data, "")
}

// GET /api/tools/:name/readme
func (s *Server) handleToolReadme(w http.ResponseWriter, r *http.Request, toolName string) {
	var targetTool *config.ToolConfig
	for _, tc := range s.toolConfigs {
		if tc.Name == toolName {
			targetTool = tc
			break
		}
	}

	if targetTool == nil {
		writeJSON(w, false, nil, "Tool not found")
		return
	}

	// 1. Try local README lookup
	if content, err := findLocalReadme(targetTool); err == nil && content != "" {
		writeJSON(w, true, map[string]string{"content": content}, "")
		return
	}

	// 2. Try remote repository README lookup
	repo := getRepoFromToolConfig(targetTool)
	if repo != "" {
		var cacheDir string
		if s.projectConfig != nil && s.projectConfig.Paths.GeneratedDir != "" {
			cacheDir = filepath.Join(s.projectConfig.Paths.GeneratedDir, "cache", "readmes")
		} else {
			cacheDir = filepath.Join(os.TempDir(), "dotfiles-readmes")
		}

		cache := features.NewReadmeCache(fs.NewOSFS(), cacheDir)
		if item, err := cache.Get(toolName, 24*time.Hour); err == nil && item != nil && item.Readme != "" {
			writeJSON(w, true, map[string]string{"content": item.Readme}, "")
			return
		}

		fetchedContent, fetchErr := s.fetchRemoteReadme(r.Context(), repo)
		if fetchErr == nil && fetchedContent != "" {
			meta, _ := features.ParseReadme(fetchedContent)
			_ = cache.Put(toolName, &features.CacheItem{
				ToolName:  toolName,
				Readme:    fetchedContent,
				Metadata:  meta,
				Timestamp: time.Now().Unix(),
			})
			writeJSON(w, true, map[string]string{"content": fetchedContent}, "")
			return
		}
	}

	writeJSON(w, false, nil, fmt.Sprintf("No README.md or Markdown documentation found for tool %q", toolName))
}

func findLocalReadme(targetTool *config.ToolConfig) (string, error) {
	if targetTool == nil || targetTool.ConfigFilePath == "" {
		return "", fmt.Errorf("config file path not available")
	}

	dir := filepath.Dir(targetTool.ConfigFilePath)
	toolName := targetTool.Name

	candidates := []string{
		filepath.Join(dir, toolName+".md"),
		filepath.Join(dir, toolName+".README.md"),
		filepath.Join(dir, toolName+"-README.md"),
		filepath.Join(dir, "README-"+toolName+".md"),
		filepath.Join(dir, "README."+toolName+".md"),
		filepath.Join(dir, toolName, "README.md"),
		filepath.Join(dir, toolName, "readme.md"),
		filepath.Join(dir, toolName, toolName+".md"),
	}

	baseName := filepath.Base(targetTool.ConfigFilePath)
	ext := filepath.Ext(baseName)
	baseNoExt := strings.TrimSuffix(baseName, ext)
	if baseNoExt != "" && baseNoExt != toolName {
		candidates = append(candidates,
			filepath.Join(dir, baseNoExt+".md"),
			filepath.Join(dir, baseNoExt+".README.md"),
			filepath.Join(dir, baseNoExt+"-README.md"),
		)
	}

	for _, cand := range candidates {
		if info, err := os.Stat(cand); err == nil && !info.IsDir() {
			content, err := os.ReadFile(cand)
			if err == nil {
				return string(content), nil
			}
		}
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", fmt.Errorf("failed to read directory %s: %w", dir, err)
	}

	isDedicatedDir := strings.EqualFold(filepath.Base(dir), toolName)
	if isDedicatedDir {
		for _, entry := range entries {
			if !entry.IsDir() && strings.HasSuffix(strings.ToLower(entry.Name()), ".md") {
				content, err := os.ReadFile(filepath.Join(dir, entry.Name()))
				if err == nil {
					return string(content), nil
				}
			}
		}
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		nameLower := strings.ToLower(entry.Name())
		if strings.HasSuffix(nameLower, ".md") {
			nameNoExt := strings.TrimSuffix(nameLower, ".md")
			if nameNoExt == strings.ToLower(toolName) || nameNoExt == strings.ToLower(baseNoExt) {
				content, err := os.ReadFile(filepath.Join(dir, entry.Name()))
				if err == nil {
					return string(content), nil
				}
			}
		}
	}

	var mdFiles []string
	var toolConfigFiles []string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		nameLower := strings.ToLower(entry.Name())
		if strings.HasSuffix(nameLower, ".md") {
			mdFiles = append(mdFiles, entry.Name())
		}
		if strings.HasSuffix(nameLower, ".tool.ts") || strings.HasSuffix(nameLower, ".ts") {
			toolConfigFiles = append(toolConfigFiles, entry.Name())
		}
	}

	if len(mdFiles) == 1 && len(toolConfigFiles) <= 1 {
		content, err := os.ReadFile(filepath.Join(dir, mdFiles[0]))
		if err == nil {
			return string(content), nil
		}
	}

	return "", fmt.Errorf("no local README found for tool %s in %s", toolName, dir)
}

func getRepoFromToolConfig(tc *config.ToolConfig) string {
	if tc == nil {
		return ""
	}
	if repo := getStringParam(tc.InstallParams, "repo", ""); repo != "" {
		return repo
	}
	if repo := getStringParam(tc.InstallParams, "githubRepo", ""); repo != "" {
		return repo
	}

	goos := runtime.GOOS
	goarch := runtime.GOARCH

	for _, pc := range tc.PlatformConfigs {
		if config.MatchesPlatform(pc.Platforms, goos) {
			if pc.Architectures != nil && !config.MatchesArch(*pc.Architectures, goarch) {
				continue
			}
			if repo := extractRepoFromPlatformConfig(pc); repo != "" {
				return repo
			}
		}
	}

	for _, pc := range tc.PlatformConfigs {
		if repo := extractRepoFromPlatformConfig(pc); repo != "" {
			return repo
		}
	}

	return ""
}

func extractRepoFromPlatformConfig(pc config.PlatformConfigEntry) string {
	if cfgMap, ok := pc.Config.(map[string]interface{}); ok {
		return getRepoFromConfigMap(cfgMap)
	}
	if pc.Config != nil {
		jsonBytes, err := json.Marshal(pc.Config)
		if err == nil {
			var cfgMap map[string]interface{}
			if err := json.Unmarshal(jsonBytes, &cfgMap); err == nil {
				return getRepoFromConfigMap(cfgMap)
			}
		}
	}
	return ""
}

func getRepoFromConfigMap(cfgMap map[string]interface{}) string {
	if cfgMap == nil {
		return ""
	}
	if installParams, ok := cfgMap["installParams"].(map[string]interface{}); ok {
		if r := getStringParam(installParams, "repo", ""); r != "" {
			return r
		}
		if r := getStringParam(installParams, "githubRepo", ""); r != "" {
			return r
		}
	}
	return ""
}

func (s *Server) fetchRemoteReadme(ctx context.Context, repo string) (string, error) {
	client := &http.Client{Timeout: 10 * time.Second}

	apiBase := s.githubBaseURL
	if apiBase == "" {
		apiBase = "https://api.github.com"
	}

	rawBase := s.githubRawBaseURL
	if rawBase == "" {
		rawBase = "https://raw.githubusercontent.com"
	}

	apiURL := fmt.Sprintf("%s/repos/%s/readme", apiBase, repo)
	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err == nil {
		req.Header.Set("Accept", "application/vnd.github.raw+json")
		req.Header.Set("User-Agent", "dotfiles-dashboard/1.0")
		if token := os.Getenv("GITHUB_TOKEN"); token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		resp, err := client.Do(req)
		if err == nil {
			defer resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				bodyBytes, err := io.ReadAll(resp.Body)
				if err == nil && len(bodyBytes) > 0 {
					return string(bodyBytes), nil
				}
			}
		}
	}

	rawURLs := []string{
		fmt.Sprintf("%s/%s/HEAD/README.md", rawBase, repo),
		fmt.Sprintf("%s/%s/main/README.md", rawBase, repo),
		fmt.Sprintf("%s/%s/master/README.md", rawBase, repo),
	}

	for _, rawURL := range rawURLs {
		req, err := http.NewRequestWithContext(ctx, "GET", rawURL, nil)
		if err != nil {
			continue
		}
		req.Header.Set("User-Agent", "dotfiles-dashboard/1.0")
		resp, err := client.Do(req)
		if err != nil {
			continue
		}
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusOK {
			bodyBytes, err := io.ReadAll(resp.Body)
			if err == nil && len(bodyBytes) > 0 {
				return string(bodyBytes), nil
			}
		}
	}

	return "", fmt.Errorf("failed to fetch README for repo %s from GitHub", repo)
}

func getStringParam(params map[string]interface{}, key string, defaultValue string) string {
	if params == nil {
		return defaultValue
	}
	if v, ok := params[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return defaultValue
}

// handleToolLogsStream handles SSE connections for live logs stream of a tool.
func (s *Server) handleToolLogsStream(w http.ResponseWriter, r *http.Request, toolName string) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	ch := make(chan string, 100)
	s.broadcaster.Subscribe(toolName, ch)
	defer s.broadcaster.Unsubscribe(toolName, ch)

	flusher, ok := w.(http.Flusher)
	if ok {
		flusher.Flush()
	}

	for {
		select {
		case <-r.Context().Done():
			return
		case msg, open := <-ch:
			if !open {
				return
			}
			lines := strings.Split(msg, "\n")
			for _, line := range lines {
				if line != "" {
					_, _ = fmt.Fprintf(w, "data: %s\n", line)
				}
			}
			_, _ = fmt.Fprint(w, "\n")
			if flusher != nil {
				flusher.Flush()
			}
		}
	}
}

// GET /api/tools/:name/source
func (s *Server) handleToolSource(w http.ResponseWriter, r *http.Request, toolName string) {
	var targetTool *config.ToolConfig
	for _, tc := range s.toolConfigs {
		if tc.Name == toolName {
			targetTool = tc
			break
		}
	}

	if targetTool == nil {
		writeJSON(w, false, nil, "Tool not found")
		return
	}

	if targetTool.ConfigFilePath == "" {
		writeJSON(w, false, nil, "Tool configuration file path not available")
		return
	}

	contentBytes, err := os.ReadFile(targetTool.ConfigFilePath)
	if err != nil {
		writeJSON(w, false, nil, "Failed to read configuration file: "+err.Error())
		return
	}

	writeJSON(w, true, map[string]string{
		"content":  string(contentBytes),
		"filePath": targetTool.ConfigFilePath,
	}, "")
}

// POST /api/tools/:name/install
func (s *Server) handleToolInstall(w http.ResponseWriter, r *http.Request, toolName string) {
	var targetTool *config.ToolConfig
	for _, tc := range s.toolConfigs {
		if tc.Name == toolName {
			targetTool = tc
			break
		}
	}

	if targetTool == nil {
		writeJSON(w, false, nil, "Tool not found")
		return
	}

	var req struct {
		Force bool `json:"force"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	if s.orchestrator == nil {
		writeJSON(w, false, nil, "Orchestrator not initialized")
		return
	}

	ctx := context.Background()
	if req.Force {
		ctx = config.WithOverwrite(ctx, true)
	}
	s.broadcaster.Broadcast(toolName, fmt.Sprintf("INFO\t[%s] Starting installation...\n", toolName))
	err := s.orchestrator.InstallTool(ctx, targetTool, s.projectConfig)
	if err != nil {
		s.logger.Error(logger.Message(fmt.Sprintf("Installation failed for %s: %v", toolName, err)))
		s.broadcaster.Broadcast(toolName, fmt.Sprintf("ERROR\t[%s] Installation failed: %v\n", toolName, err))
		writeJSON(w, false, nil, fmt.Sprintf("Installation failed: %v", err))
		return
	}
	s.broadcaster.Broadcast(toolName, fmt.Sprintf("INFO\t[%s] Installation completed successfully\n", toolName))

	var toolVer string
	if targetTool.Version != nil {
		toolVer = *targetTool.Version
	} else {
		toolVer = "latest"
	}

	writeJSON(w, true, map[string]any{
		"installed":        true,
		"version":          toolVer,
		"alreadyInstalled": false,
	}, "")
}

// POST /api/tools/:name/check-update
func (s *Server) handleToolCheckUpdate(w http.ResponseWriter, r *http.Request, toolName string) {
	ctx := r.Context()

	var targetTool *config.ToolConfig
	for _, tc := range s.toolConfigs {
		if tc.Name == toolName {
			targetTool = tc
			break
		}
	}

	if targetTool == nil {
		writeJSON(w, false, nil, "Tool not found")
		return
	}

	if targetTool.InstallationMethod == "" {
		writeJSON(w, true, map[string]any{
			"hasUpdate":      false,
			"currentVersion": "unknown",
			"latestVersion":  "unknown",
			"supported":      false,
		}, "")
		return
	}

	inst, err := installer.Get(targetTool.InstallationMethod)
	if err != nil {
		writeJSON(w, false, nil, fmt.Sprintf("Installer %q not found: %v", targetTool.InstallationMethod, err))
		return
	}

	res, err := inst.CheckUpdate(ctx, targetTool)
	if err != nil {
		writeJSON(w, false, nil, fmt.Sprintf("Failed to check update for %s: %v", toolName, err))
		return
	}

	currentVer := res.LocalVersion
	if currentVer == "" {
		if targetTool.Version != nil && *targetTool.Version != "" {
			currentVer = *targetTool.Version
		} else {
			currentVer = "unknown"
		}
	}

	latestVer := res.LatestVersion
	if latestVer == "" {
		latestVer = "unknown"
	}

	writeJSON(w, true, map[string]any{
		"hasUpdate":      res.HasUpdate,
		"currentVersion": currentVer,
		"latestVersion":  latestVer,
		"supported":      true,
	}, "")
}

// POST /api/tools/:name/update
func (s *Server) handleToolUpdate(w http.ResponseWriter, r *http.Request, toolName string) {
	var targetTool *config.ToolConfig
	for _, tc := range s.toolConfigs {
		if tc.Name == toolName {
			targetTool = tc
			break
		}
	}

	if targetTool == nil {
		writeJSON(w, false, nil, "Tool not found")
		return
	}

	if s.orchestrator == nil {
		writeJSON(w, false, nil, "Orchestrator not initialized")
		return
	}

	ctx := context.Background()
	s.broadcaster.Broadcast(toolName, fmt.Sprintf("INFO\t[%s] Starting update...\n", toolName))
	err := s.orchestrator.InstallTool(ctx, targetTool, s.projectConfig)
	if err != nil {
		s.logger.Error(logger.Message(fmt.Sprintf("Update failed for %s: %v", toolName, err)))
		s.broadcaster.Broadcast(toolName, fmt.Sprintf("ERROR\t[%s] Update failed: %v\n", toolName, err))
		writeJSON(w, false, nil, fmt.Sprintf("Update failed: %v", err))
		return
	}
	s.broadcaster.Broadcast(toolName, fmt.Sprintf("INFO\t[%s] Update completed successfully\n", toolName))

	writeJSON(w, true, map[string]any{
		"updated":   true,
		"supported": true,
	}, "")
}

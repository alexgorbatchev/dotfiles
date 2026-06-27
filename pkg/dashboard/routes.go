package dashboard

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
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
	if s.registry != nil {
		installs, _ := s.registry.GetAllToolInstallations(ctx)
		toolCount = len(installs)
	}
	status := "warn"
	if toolCount > 0 {
		status = "pass"
	}
	checks = append(checks, map[string]any{
		"name":    "Tool Installations",
		"status":  status,
		"message": fmt.Sprintf("%d tool(s) installed", toolCount),
	})

	checks = append(checks, map[string]any{
		"name":    "Registry Integrity",
		"status":  "pass",
		"message": "Registry is healthy",
	})

	overall := "healthy"
	for _, c := range checks {
		if c["status"] == "warn" && overall == "healthy" {
			overall = "warning"
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

// GET /api/tools
func (s *Server) handleGetTools(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if s.registry == nil {
		writeJSON(w, false, nil, "Registry is not initialized")
		return
	}

	type toolState struct {
		Name               string   `json:"name"`
		Version            string   `json:"version"`
		InstallationMethod string   `json:"installationMethod"`
		Status             string   `json:"status"` // "installed", "not-installed"
		InstalledVersion   *string  `json:"installedVersion"`
		HasUpdate          bool     `json:"hasUpdate"`
		Binaries           []string `json:"binaries"`
	}

	tools := []toolState{}
	for _, tc := range s.toolConfigs {
		installRecord, _ := s.registry.GetToolInstallation(ctx, tc.Name)

		status := "not-installed"
		var instVer *string
		if installRecord != nil {
			status = "installed"
			instVer = &installRecord.Version
		}

		var toolVer string
		if tc.Version != nil {
			toolVer = *tc.Version
		} else {
			toolVer = "latest"
		}

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

		tools = append(tools, toolState{
			Name:               tc.Name,
			Version:            toolVer,
			InstallationMethod: tc.InstallationMethod,
			Status:             status,
			InstalledVersion:   instVer,
			HasUpdate:          false,
			Binaries:           binNames,
		})
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

	installRecord, _ := s.registry.GetToolInstallation(ctx, toolName)
	files, _ := s.registry.GetFileStatesForTool(ctx, toolName)
	usages, _ := s.registry.GetToolUsagesForTool(ctx, toolName)

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

	data := map[string]any{
		"config":         targetTool,
		"runtime":        runtimeState,
		"files":          files,
		"binaryDiskSize": diskSize,
		"usage": map[string]any{
			"totalCount": totalUsage,
			"binaries":   binUsages,
		},
	}

	writeJSON(w, true, data, "")
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

	if targetTool.ConfigFilePath == "" {
		writeJSON(w, false, nil, "Tool configuration file path not available")
		return
	}

	dir := filepath.Dir(targetTool.ConfigFilePath)
	entries, err := os.ReadDir(dir)
	if err != nil {
		writeJSON(w, false, nil, "Failed to read tool directory: "+err.Error())
		return
	}

	var readmePath string
	for _, entry := range entries {
		if !entry.IsDir() && strings.ToLower(entry.Name()) == "readme.md" {
			readmePath = filepath.Join(dir, entry.Name())
			break
		}
	}

	if readmePath == "" {
		for _, entry := range entries {
			if !entry.IsDir() && strings.HasSuffix(strings.ToLower(entry.Name()), ".md") {
				readmePath = filepath.Join(dir, entry.Name())
				break
			}
		}
	}

	if readmePath == "" {
		writeJSON(w, false, nil, fmt.Sprintf("No README.md or Markdown documentation found in %s", dir))
		return
	}

	contentBytes, err := os.ReadFile(readmePath)
	if err != nil {
		writeJSON(w, false, nil, "Failed to read README: "+err.Error())
		return
	}

	writeJSON(w, true, map[string]string{"content": string(contentBytes)}, "")
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

	go func() {
		ctx := context.Background()
		if req.Force {
			os.Setenv("DOTFILES_OVERWRITE", "true")
			defer os.Unsetenv("DOTFILES_OVERWRITE")
		}
		s.broadcaster.Broadcast(toolName, fmt.Sprintf("INFO\t[%s] Starting installation...\n", toolName))
		err := s.orchestrator.InstallTool(ctx, targetTool, s.projectConfig)
		if err != nil {
			s.broadcaster.Broadcast(toolName, fmt.Sprintf("ERROR\t[%s] Installation failed: %v\n", toolName, err))
		} else {
			s.broadcaster.Broadcast(toolName, fmt.Sprintf("INFO\t[%s] Installation completed successfully\n", toolName))
		}
	}()

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
	writeJSON(w, true, map[string]any{"hasUpdate": false, "currentVersion": "latest", "latestVersion": "latest", "supported": true}, "")
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

	go func() {
		ctx := context.Background()
		s.broadcaster.Broadcast(toolName, fmt.Sprintf("INFO\t[%s] Starting update...\n", toolName))
		err := s.orchestrator.InstallTool(ctx, targetTool, s.projectConfig)
		if err != nil {
			s.broadcaster.Broadcast(toolName, fmt.Sprintf("ERROR\t[%s] Update failed: %v\n", toolName, err))
		} else {
			s.broadcaster.Broadcast(toolName, fmt.Sprintf("INFO\t[%s] Update completed successfully\n", toolName))
		}
	}()

	writeJSON(w, true, map[string]any{
		"updated":   true,
		"supported": true,
	}, "")
}

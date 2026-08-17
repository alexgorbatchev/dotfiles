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
	"strings"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/features"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

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

	if content, err := findLocalReadme(targetTool); err == nil && content != "" {
		writeJSON(w, true, map[string]string{"content": content}, "")
		return
	}

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

	if targetTool.InstallationMethod != "" {
		if inst, err := installer.Get(targetTool.InstallationMethod); err == nil {
			toolDestDir := filepath.Join(s.projectConfig.Paths.BinariesDir, targetTool.Name, "current")
			switch instInstance := inst.(type) {
			case *installer.GitHubInstaller:
				instInstance.BinDir = toolDestDir
				if s.projectConfig.Github.Host != "" {
					instInstance.BaseURL = s.projectConfig.Github.Host
				}
			}
			if res, err := inst.CheckUpdate(ctx, targetTool); err == nil && res != nil && res.LatestVersion != "" {
				targetTool.Version = &res.LatestVersion
			}
		}
	}

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

package dashboard

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/drift"
	"github.com/alexgorbatchev/dotfiles/pkg/features"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/github"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/alexgorbatchev/dotfiles/pkg/version"
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
	case "drift":
		s.handleToolDrift(w, r, toolName)
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

	return res
}

func calculateDirSize(dir string) int64 {
	var size int64
	_ = filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() {
			size += info.Size()
		}
		return nil
	})
	return size
}

// toolFile is the tool-detail view of a tracked file. It mirrors IFileState in
// packages/dashboard/src/shared/types.ts; the registry's own FileState carries
// cleanup bookkeeping the client never reads, so it is not serialized directly.
type toolFile struct {
	FilePath string `json:"filePath"`
	ToolName string `json:"toolName"`
	FileType string `json:"fileType"`
}

func toolFilesFromStates(states []*registry.FileState) []toolFile {
	files := make([]toolFile, 0, len(states))
	for _, state := range states {
		files = append(files, toolFile{
			FilePath: state.FilePath,
			ToolName: state.ToolName,
			FileType: state.FileType,
		})
	}
	return files
}

func (s *Server) getToolDetail(ctx context.Context, targetTool *config.ToolConfig) (map[string]any, error) {
	installRecord, _ := s.registry.GetToolInstallation(ctx, targetTool.Name)
	fileStates, _ := s.registry.GetFileStatesForTool(ctx, targetTool.Name)
	files := toolFilesFromStates(fileStates)
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
		if val, ok := b.(map[string]any); ok {
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
	if status == "installed" && s.projectConfig != nil {
		toolBinDir := filepath.Join(s.projectConfig.Paths.BinariesDir, targetTool.Name)
		diskSize = calculateDirSize(toolBinDir)
	}

	runtimeState := map[string]any{
		"status":           status,
		"installedVersion": instVer,
		"installedAt":      instAt,
		"installPath":      instPath,
		"binaryPaths":      binPaths,
		"hasUpdate":        false,
	}

	inspector := drift.NewInspector(s.fsys, s.registry, s.projectConfig)
	driftItems, _ := inspector.InspectTool(ctx, targetTool)
	if driftItems == nil {
		driftItems = []drift.Item{}
	}

	return map[string]any{
		"config":         formatToolConfigForDashboard(targetTool),
		"runtime":        runtimeState,
		"files":          files,
		"drift":          driftItems,
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

	return ""
}

func (s *Server) fetchRemoteReadme(ctx context.Context, repo string) (string, error) {
	client := s.outboundClient()

	apiBase := s.githubBaseURL
	if apiBase == "" {
		apiBase = "https://api.github.com"
	}

	rawBase := s.githubRawBaseURL
	if rawBase == "" {
		rawBase = "https://raw.githubusercontent.com"
	}

	var projectToken string
	if s.projectConfig != nil {
		projectToken = s.projectConfig.Github.Token
	}

	apiURL := fmt.Sprintf("%s/repos/%s/readme", apiBase, repo)
	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err == nil {
		req.Header.Set("Accept", "application/vnd.github.raw+json")
		req.Header.Set("User-Agent", "dotfiles-dashboard/1.0")
		if token := github.Token(projectToken); token != "" {
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
		ctx = config.WithForce(ctx, true)
		ctx = config.WithOverwrite(ctx, true)
	}
	s.broadcaster.Broadcast(toolName, fmt.Sprintf("INFO\t[%s] Starting installation...\n", toolName))
	err := s.orchestrator.InstallTool(ctx, targetTool, s.projectConfig)
	if err != nil {
		s.logger.WithTag(toolName).Error("Installation failed", err)
		s.broadcaster.Broadcast(toolName, fmt.Sprintf("ERROR\t[%s] Installation failed: %v\n", toolName, err))
		writeJSON(w, false, nil, fmt.Sprintf("Installation failed: %v", err))
		return
	}
	s.broadcaster.Broadcast(toolName, fmt.Sprintf("INFO\t[%s] Installation completed successfully\n", toolName))

	// The version the installation recorded, as v1 answered with the installed
	// version; the configuration's .version() may be overridden by an install
	// parameter, or say only "latest".
	toolVer := "latest"
	if rec, err := s.registry.GetToolInstallation(ctx, targetTool.Name); err == nil && rec != nil && rec.Version != "" {
		toolVer = rec.Version
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

	// A tool with no installation method has nothing upstream to compare against, and one
	// that turned update checks off with .updateCheck({ enabled: false }) asked not to be
	// asked. Neither reaches the installer.
	if targetTool.InstallationMethod == "" {
		writeJSON(w, true, unsupportedCheckUpdate("unknown", "Update checking is not supported for a tool without an installation method"), "")
		return
	}
	if !targetTool.UpdateCheckEnabled() {
		writeJSON(w, true, unsupportedCheckUpdate("unknown", "Update checking is disabled by updateCheck.enabled"), "")
		return
	}

	inst, err := installer.Get(targetTool.InstallationMethod)
	if err != nil {
		writeJSON(w, false, nil, fmt.Sprintf("Installer %q not found: %v", targetTool.InstallationMethod, err))
		return
	}

	res, err := inst.CheckUpdate(ctx, targetTool)
	if errors.Is(err, installer.ErrUpdateCheckUnsupported) {
		reason := fmt.Sprintf("Update checking is not supported for installation method %q", targetTool.InstallationMethod)
		writeJSON(w, true, unsupportedCheckUpdate(orUnknown(s.installedVersion(ctx, toolName)), reason), "")
		return
	}
	if err != nil {
		writeJSON(w, false, nil, fmt.Sprintf("Failed to check update for %s: %v", toolName, err))
		return
	}

	// Only installers that query the system populate LocalVersion; for the rest the registry is
	// the only record of what is actually on disk. The configured version is deliberately not a
	// fallback, because "latest" is a resolution strategy rather than an installed version.
	currentVer := res.LocalVersion
	if currentVer == "" {
		currentVer = s.installedVersion(ctx, toolName)
	}

	// The same comparison check-updates makes, so the two cannot disagree about a tool.
	hasUpdate := version.UpdateAvailable(version.UpdateQuery{
		Installed:  currentVer,
		Latest:     res.LatestVersion,
		Constraint: targetTool.UpdateCheckConstraint(),
		Outdated:   res.Outdated,
	})

	writeJSON(w, true, map[string]any{
		"hasUpdate":      hasUpdate,
		"currentVersion": orUnknown(currentVer),
		"latestVersion":  orUnknown(res.LatestVersion),
		"supported":      true,
	}, "")
}

// configureInstallers applies the project's github and cargo sections to every
// registered installer, as tool check and tool update do, so the dashboard's update
// checks address the hosts the configuration names with its credentials. It runs once,
// when the server starts, so the update-check handlers never write installer settings
// themselves; the installers are shared by every request.
func (s *Server) configureInstallers() {
	if s.projectConfig == nil {
		return
	}
	github := installer.GitHubSettings{
		Host:         s.projectConfig.Github.Host,
		Token:        s.projectConfig.Github.Token,
		UserAgent:    s.projectConfig.Github.UserAgent,
		CacheEnabled: s.projectConfig.Github.Cache.IsEnabled(),
	}
	cargo := installer.NewCargoSettings(s.projectConfig)
	for _, name := range installer.DefaultRegistry().List() {
		inst, err := installer.Get(name)
		if err != nil {
			continue
		}
		installer.SetGitHubSettings(inst, github)
		installer.SetCargoSettings(inst, cargo)
	}
}

// unsupportedCheckUpdate is the check-update answer for a tool nothing upstream was asked
// about, in the shape v1's route used: hasUpdate false says nothing, so supported is
// false and error says why.
func unsupportedCheckUpdate(currentVersion, reason string) map[string]any {
	return map[string]any{
		"hasUpdate":      false,
		"currentVersion": currentVersion,
		"latestVersion":  "unknown",
		"supported":      false,
		"error":          reason,
	}
}

// installedVersion is the version the registry recorded for toolName, or "" when it
// has none.
func (s *Server) installedVersion(ctx context.Context, toolName string) string {
	installRecord, err := s.registry.GetToolInstallation(ctx, toolName)
	if err != nil || installRecord == nil {
		return ""
	}
	return installRecord.Version
}

// orUnknown renders a version the dashboard could not determine as the client's
// "unknown" placeholder. It is applied after the comparison, never before it.
func orUnknown(v string) string {
	if v == "" {
		return "unknown"
	}
	return v
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

	// A pinned tool is refused before its installer is asked anything, as the CLI's
	// update refuses it, so the latest release never replaces the pin.
	if reason, refused := targetTool.UpdateRefusal(); refused {
		writeJSON(w, false, nil, reason)
		return
	}

	if s.orchestrator == nil {
		writeJSON(w, false, nil, "Orchestrator not initialized")
		return
	}

	ctx := context.Background()
	s.broadcaster.Broadcast(toolName, fmt.Sprintf("INFO\t[%s] Starting update...\n", toolName))

	// The release this picks is set on a copy (WithRequestedVersion): the server keeps
	// the configuration for its lifetime, and a version written into it would read as a
	// pin to the next update.
	updateTarget := targetTool
	if targetTool.InstallationMethod != "" {
		if inst, err := installer.Get(targetTool.InstallationMethod); err == nil {
			// Only the update check runs here, with the settings configureInstallers
			// applied at start; the install directory is set by the orchestrator when it
			// installs the release this picks.
			// A release the tool's updateCheck.constraint excludes is not one this
			// endpoint may install, however new it is.
			if res, err := inst.CheckUpdate(ctx, targetTool); err == nil && res != nil && res.LatestVersion != "" &&
				version.MatchesConstraint(res.LatestVersion, targetTool.UpdateCheckConstraint()) {
				updateTarget = targetTool.WithRequestedVersion(res.LatestVersion)
			}
		}
	}

	err := s.orchestrator.InstallTool(ctx, updateTarget, s.projectConfig)
	if err != nil {
		s.logger.WithTag(toolName).Error("Update failed", err)
		s.broadcaster.Broadcast(toolName, fmt.Sprintf("ERROR\t[%s] Update failed: %v\n", toolName, err))
		writeJSON(w, false, nil, fmt.Sprintf("Update failed: %v", err))
		return
	}
	s.broadcaster.Broadcast(toolName, fmt.Sprintf("INFO\t[%s] Update completed successfully\n", toolName))

	writeJSON(w, true, map[string]any{
		"updated": true,
	}, "")
}

// GET /api/drift
func (s *Server) handleDrift(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if s.registry == nil {
		writeJSON(w, false, nil, "Registry is not initialized")
		return
	}

	inspector := drift.NewInspector(s.fsys, s.registry, s.projectConfig)
	items, err := inspector.InspectAll(ctx, s.toolConfigs)
	if err != nil {
		writeJSON(w, false, nil, "Failed to inspect drift: "+err.Error())
		return
	}
	if items == nil {
		items = []drift.Item{}
	}

	writeJSON(w, true, items, "")
}

// GET /api/tools/:name/drift
func (s *Server) handleToolDrift(w http.ResponseWriter, r *http.Request, toolName string) {
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

	inspector := drift.NewInspector(s.fsys, s.registry, s.projectConfig)
	items, err := inspector.InspectTool(ctx, targetTool)
	if err != nil {
		writeJSON(w, false, nil, "Failed to inspect tool drift: "+err.Error())
		return
	}
	if items == nil {
		items = []drift.Item{}
	}

	writeJSON(w, true, items, "")
}

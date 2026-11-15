package dashboard

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

type healthCheck struct {
	Name    string   `json:"name"`
	Status  string   `json:"status"`
	Message string   `json:"message"`
	Details []string `json:"details"`
}

// GET /api/health
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	installs, err := s.registry.GetAllToolInstallations(r.Context())
	if err != nil {
		writeJSONWithStatus(w, http.StatusInternalServerError, false, nil, fmt.Sprintf("Reading health registry: %v", err))
		return
	}
	checks, err := s.checkInstallations(installs)
	if err != nil {
		writeJSONWithStatus(w, http.StatusInternalServerError, false, nil, fmt.Sprintf("Checking health: %v", err))
		return
	}
	overall := "healthy"
	for _, check := range checks {
		if check.Status == "warn" {
			overall = "warning"
		}
	}
	writeJSON(w, true, map[string]any{"overall": overall, "checks": checks, "lastCheck": time.Now().UTC().Format(time.RFC3339)}, "")
}

func (s *Server) checkInstallations(installs []*registry.ToolInstallationRecord) ([]healthCheck, error) {
	installed := make(map[string]*registry.ToolInstallationRecord, len(installs))
	unhealthyTools := []string{}
	orphanedRecords := []string{}
	for _, inst := range installs {
		installed[inst.ToolName] = inst
		if inst.InstallPath != "" {
			missing, err := s.healthPathMissing(inst.InstallPath)
			if err != nil {
				return nil, err
			}
			if missing {
				orphanedRecords = append(orphanedRecords, fmt.Sprintf("Tool %s: install path %s does not exist on disk", inst.ToolName, inst.InstallPath))
			}
		}
		// Receipts describe the actual installation, including external package-manager
		// paths and tools with no executable at all.
		var binaries []string
		if inst.BinaryPaths != "" {
			if err := json.Unmarshal([]byte(inst.BinaryPaths), &binaries); err != nil {
				return nil, fmt.Errorf("reading binary paths for %s: %w", inst.ToolName, err)
			}
		}
		for _, path := range binaries {
			missing, err := s.healthPathMissing(path)
			if err != nil {
				return nil, err
			}
			if missing {
				unhealthyTools = append(unhealthyTools, fmt.Sprintf("Tool %s: missing installed binary %s", inst.ToolName, path))
			}
		}
	}
	unusedVersions, err := s.unusedBinaryVersions(installed)
	if err != nil {
		return nil, err
	}
	toolCount := 0
	for _, tool := range s.toolConfigs {
		if installed[tool.Name] != nil {
			toolCount++
		}
	}
	installCheck := healthCheck{Name: "Tool Installations", Status: "pass", Message: fmt.Sprintf("%d tool(s) installed", toolCount), Details: unhealthyTools}
	if len(unhealthyTools) > 0 {
		installCheck.Status = "warn"
		installCheck.Message = fmt.Sprintf("%d missing installed binary path(s)", len(unhealthyTools))
	} else if toolCount == 0 {
		installCheck.Status = "warn"
		installCheck.Message = "No tools installed"
	}
	registryCheck := healthCheck{Name: "Registry Integrity", Status: "pass", Message: "Registry is healthy", Details: orphanedRecords}
	if len(orphanedRecords) > 0 {
		registryCheck.Status = "warn"
		registryCheck.Message = fmt.Sprintf("Registry contains %d orphaned record(s)", len(orphanedRecords))
	}
	unusedCheck := healthCheck{Name: "Unused Binary Versions", Status: "pass", Message: "No unused binary versions found", Details: unusedVersions}
	if len(unusedVersions) > 0 {
		unusedCheck.Status = "warn"
		unusedCheck.Message = fmt.Sprintf("Found %d unused binary version(s)", len(unusedVersions))
	}
	return []healthCheck{installCheck, registryCheck, unusedCheck}, nil
}

func (s *Server) healthPathMissing(path string) (bool, error) {
	_, err := s.fsys.Stat(path)
	if os.IsNotExist(err) {
		return true, nil
	}
	if err != nil {
		return false, fmt.Errorf("inspecting %s: %w", path, err)
	}
	return false, nil
}

func (s *Server) unusedBinaryVersions(installed map[string]*registry.ToolInstallationRecord) ([]string, error) {
	unused := []string{}
	if s.projectConfig == nil || s.projectConfig.Paths.BinariesDir == "" {
		return unused, nil
	}
	binariesDir := s.projectConfig.Paths.BinariesDir
	tools, err := s.healthDirectories(binariesDir)
	if err != nil {
		return nil, err
	}
	for _, tool := range tools {
		toolDir := filepath.Join(binariesDir, tool)
		versions, err := s.healthDirectories(toolDir)
		if err != nil {
			return nil, err
		}
		for _, version := range versions {
			if version == "current" {
				continue
			}
			path := filepath.Join(toolDir, version)
			if inst := installed[tool]; inst != nil && (inst.Version == version || filepath.Clean(inst.InstallPath) == path) {
				continue
			}
			unused = append(unused, path)
		}
	}
	return unused, nil
}

func (s *Server) healthDirectories(path string) ([]string, error) {
	names, err := s.fsys.ReadDir(path)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("reading %s: %w", path, err)
	}
	directories := make([]string, 0, len(names))
	for _, name := range names {
		info, err := s.fsys.Lstat(filepath.Join(path, name))
		if err != nil {
			return nil, fmt.Errorf("inspecting directory entry %s: %w", filepath.Join(path, name), err)
		}
		if info.IsDir() {
			directories = append(directories, name)
		}
	}
	return directories, nil
}

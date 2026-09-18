package dashboard

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

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

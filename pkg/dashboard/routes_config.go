package dashboard

import (
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

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

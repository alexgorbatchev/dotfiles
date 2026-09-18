package dashboard

import (
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/utils"
)

// GET /api/config
func (s *Server) handleConfig(w http.ResponseWriter, r *http.Request) {
	if s.projectConfig == nil {
		writeJSON(w, false, nil, "Project configuration is not initialized")
		return
	}
	paths := s.projectConfig.Paths
	data := map[string]any{
		"dotfilesDir":    paths.DotfilesDir,
		"generatedDir":   paths.GeneratedDir,
		"binariesDir":    paths.BinariesDir,
		"targetDir":      paths.TargetDir,
		"toolConfigsDir": paths.ToolConfigsDir,
	}
	writeJSON(w, true, data, "")
}

// GET /api/tool-configs-tree
func (s *Server) handleToolConfigsTree(w http.ResponseWriter, r *http.Request) {
	if s.projectConfig == nil {
		writeJSON(w, false, nil, "Project config is not initialized")
		return
	}
	toolConfigsDirs := s.toolConfigsDirs()

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

	type toolConfigsRoot struct {
		Label   string      `json:"label"`
		Path    string      `json:"path"`
		Entries []*treeNode `json:"entries"`
	}

	homeDir, _ := os.UserHomeDir()

	roots := []toolConfigsRoot{}
	for _, resolvedDir := range toolConfigsDirs {
		nodes, _ := buildNode(resolvedDir)
		if len(nodes) == 0 {
			continue
		}
		roots = append(roots, toolConfigsRoot{
			Label:   utils.ContractHomePath(homeDir, resolvedDir),
			Path:    resolvedDir,
			Entries: nodes,
		})
	}

	writeJSON(w, true, map[string]any{
		"roots": roots,
	}, "")
}

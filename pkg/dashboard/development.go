package dashboard

import (
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/devtools"
)

func (s *Server) developmentOverride(tool string) (*devtools.Record, error) {
	if s.projectConfig == nil || s.fsys == nil {
		return nil, nil
	}
	dir := s.projectConfig.Paths.DevToolsDir
	if dir == "" {
		dir = filepath.Join(s.projectConfig.Paths.GeneratedDir, "dev-tools")
	}
	return devtools.New(s.fsys, dir).Lookup(tool)
}

package dashboard

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
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

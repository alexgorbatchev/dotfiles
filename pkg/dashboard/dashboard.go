package dashboard

import (
	"context"
	"embed"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/orchestrator"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

//go:embed all:dist
var assets embed.FS

// LogBroadcaster manages active log subscriptions.
type LogBroadcaster struct {
	mu          sync.RWMutex
	subscribers map[string][]chan string
}

// NewLogBroadcaster creates a new LogBroadcaster instance.
func NewLogBroadcaster() *LogBroadcaster {
	return &LogBroadcaster{
		subscribers: make(map[string][]chan string),
	}
}

// Subscribe registers a channel for a specific tool.
func (lb *LogBroadcaster) Subscribe(toolName string, ch chan string) {
	lb.mu.Lock()
	defer lb.mu.Unlock()
	lb.subscribers[toolName] = append(lb.subscribers[toolName], ch)
}

// Unsubscribe removes a registered channel for a tool.
func (lb *LogBroadcaster) Unsubscribe(toolName string, ch chan string) {
	lb.mu.Lock()
	defer lb.mu.Unlock()
	subs := lb.subscribers[toolName]
	for i, sub := range subs {
		if sub == ch {
			lb.subscribers[toolName] = append(subs[:i], subs[i+1:]...)
			break
		}
	}
}

// Broadcast sends a message directly to any subscribers of a specific tool.
func (lb *LogBroadcaster) Broadcast(toolName string, message string) {
	lb.mu.RLock()
	defer lb.mu.RUnlock()
	for _, ch := range lb.subscribers[toolName] {
		select {
		case ch <- message:
		default:
		}
	}
}

// Write broadcasts log bytes to any subscribers of the tool being logged.
func (lb *LogBroadcaster) Write(p []byte) (n int, err error) {
	msg := string(p)
	lb.mu.RLock()
	defer lb.mu.RUnlock()
	for toolName, channels := range lb.subscribers {
		hasToolTag := strings.Contains(strings.ToLower(msg), "["+strings.ToLower(toolName)+"]")
		if hasToolTag {
			for _, ch := range channels {
				select {
				case ch <- msg:
				default:
				}
			}
		}
	}
	return len(p), nil
}

// Server hosts the static visualization dashboard.
type Server struct {
	logger        *logger.Logger
	port          int
	server        *http.Server
	ln            net.Listener
	wg            sync.WaitGroup
	registry      *registry.Registry
	projectConfig *config.ProjectConfig
	toolConfigs   []*config.ToolConfig
	orchestrator  *orchestrator.Orchestrator
	broadcaster   *LogBroadcaster
}

// NewServer constructs a new dashboard server.
func NewServer(log *logger.Logger, port int, reg *registry.Registry, projCfg *config.ProjectConfig, toolConfigs []*config.ToolConfig, orch *orchestrator.Orchestrator) *Server {
	s := &Server{
		logger:        log.GetSubLogger("DashboardServer"),
		port:          port,
		registry:      reg,
		projectConfig: projCfg,
		toolConfigs:   toolConfigs,
		orchestrator:  orch,
		broadcaster:   NewLogBroadcaster(),
	}

	if orch != nil && log != nil {
		mw := io.MultiWriter(log.Writer(), s.broadcaster)
		orchLog := logger.New(logger.Config{
			Name:   "orchestrator",
			Level:  log.Level(),
			Trace:  log.TraceMode(),
			Writer: mw,
		})
		orch.SetLogger(orchLog)
	}

	return s
}

// Port returns the actual port the server is listening on.
func (s *Server) Port() int {
	return s.port
}

// Start launches the HTTP server for serving the dashboard.
func (s *Server) Start() error {
	subFS, err := fs.Sub(assets, "dist")
	if err != nil {
		return fmt.Errorf("failed to locate embedded dashboard assets: %w", err)
	}

	mux := http.NewServeMux()
	s.RegisterRoutes(mux)
	mux.Handle("/", http.FileServer(http.FS(subFS)))

	s.server = &http.Server{
		Handler: mux,
	}

	// Synchronously bind the listener to guarantee the port is open and active before returning.
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", s.port))
	if err != nil {
		return fmt.Errorf("failed to bind listener on port %d: %w", s.port, err)
	}
	s.ln = ln
	s.port = ln.Addr().(*net.TCPAddr).Port

	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.logger.Info(logger.Message(fmt.Sprintf("Starting dashboard server on http://127.0.0.1:%d", s.port)))
		if err := s.server.Serve(s.ln); err != nil && err != http.ErrServerClosed {
			s.logger.Error(logger.Message(fmt.Sprintf("Dashboard server failed: %v", err)))
		}
	}()

	return nil
}

// Stop shuts down the running dashboard server.
func (s *Server) Stop() error {
	if s.server != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := s.server.Shutdown(ctx); err != nil {
			return fmt.Errorf("dashboard server shutdown failed: %w", err)
		}
	}
	if s.ln != nil {
		_ = s.ln.Close()
	}
	s.wg.Wait()
	return nil
}

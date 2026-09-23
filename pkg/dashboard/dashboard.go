package dashboard

import (
	"context"
	"embed"
	"fmt"
	"io"
	iofs "io/fs"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/orchestrator"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/alexgorbatchev/dotfiles/pkg/usagelog"
)

//go:embed all:dist
var assets embed.FS

// toolConfigsDirs returns the tool-config directories of the loaded configuration. The
// loader resolved placeholders, tilde paths and directories given relative to the config
// file before handing the configuration over, so the dashboard reads the same absolute
// directories the CLI scans.
func (s *Server) toolConfigsDirs() []string {
	if s.projectConfig == nil {
		return nil
	}
	return s.projectConfig.Paths.GetToolConfigsDirs()
}

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
	host          string
	port          int
	server        *http.Server
	ln            net.Listener
	wg            sync.WaitGroup
	registry      *registry.Registry
	fsys          fs.FS
	configPath    string
	projectConfig *config.ProjectConfig
	toolConfigs   []*config.ToolConfig
	orchestrator  *orchestrator.Orchestrator
	broadcaster   *LogBroadcaster
	// githubBaseURL is the GitHub API root the README lookup addresses; it carries
	// the project configuration's github.host. Empty selects api.github.com.
	githubBaseURL    string
	githubRawBaseURL string
	// httpClient fetches remote READMEs; nil means the default client with readmeFetchTimeout.
	httpClient *http.Client
	version    string
}

const readmeFetchTimeout = 10 * time.Second

// SetVersion sets the release version reported by the dashboard server.
func (s *Server) SetVersion(v string) {
	s.version = v
}

// SetHTTPClient routes the dashboard's outbound GitHub requests through client.
func (s *Server) SetHTTPClient(client *http.Client) {
	s.httpClient = client
}

func (s *Server) outboundClient() *http.Client {
	if s.httpClient != nil {
		return s.httpClient
	}
	return &http.Client{Timeout: readmeFetchTimeout}
}

// NewServer constructs a new dashboard server.
func NewServer(log *logger.Logger, host string, port int, reg *registry.Registry, fsys fs.FS, configPath string, projCfg *config.ProjectConfig, toolConfigs []*config.ToolConfig, orch *orchestrator.Orchestrator) *Server {
	if host == "" {
		host = "127.0.0.1"
	}
	var dashboardLog *logger.Logger
	if log != nil {
		dashboardLog = log.WithTag("DashboardServer")
	}
	s := &Server{
		logger:        dashboardLog,
		host:          host,
		port:          port,
		registry:      reg,
		fsys:          fsys,
		configPath:    configPath,
		projectConfig: projCfg,
		toolConfigs:   toolConfigs,
		orchestrator:  orch,
		broadcaster:   NewLogBroadcaster(),
	}
	if projCfg != nil {
		s.githubBaseURL = projCfg.Github.Host
	}

	if orch != nil && log != nil {
		mw := io.MultiWriter(log.Writer(), s.broadcaster)
		orchLog := logger.New(logger.Config{
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

// Host returns the host address the server is bound to.
func (s *Server) Host() string {
	return s.host
}

// Start imports the shim usage log and launches the HTTP server for serving the dashboard.
func (s *Server) Start() error {
	s.importShimUsage()
	s.configureInstallers()

	subFS, err := iofs.Sub(assets, "dist")
	if err != nil {
		return fmt.Errorf("failed to locate embedded dashboard assets: %w", err)
	}

	mux := http.NewServeMux()
	s.RegisterRoutes(mux)

	fileServer := http.FileServer(http.FS(subFS))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(r.URL.Path, "/")
		if p == "" {
			fileServer.ServeHTTP(w, r)
			return
		}
		if f, err := subFS.Open(p); err == nil {
			_ = f.Close()
			fileServer.ServeHTTP(w, r)
			return
		}
		// Fallback to index.html for SPA client-side routing
		r.URL.Path = "/"
		fileServer.ServeHTTP(w, r)
	})

	s.server = &http.Server{
		Handler: mux,
	}

	// Synchronously bind the listener to guarantee the port is open and active before returning.
	ln, err := net.Listen("tcp", fmt.Sprintf("%s:%d", s.host, s.port))
	if err != nil {
		return fmt.Errorf("failed to bind listener on %s:%d: %w", s.host, s.port, err)
	}
	s.ln = ln
	s.port = ln.Addr().(*net.TCPAddr).Port

	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.logger.Info(logger.Message(fmt.Sprintf("Starting dashboard server on http://%s:%d", s.host, s.port)))
		if err := s.server.Serve(s.ln); err != nil && err != http.ErrServerClosed {
			s.logger.Error(logger.Message(fmt.Sprintf("Dashboard server failed: %v", err)))
		}
	}()

	return nil
}

// importShimUsage folds the log that shims append to into the registry so the
// usage views serve data from invocations made while no dashboard was running.
// The import is best-effort: a failure is reported and the dashboard still starts.
func (s *Server) importShimUsage() {
	if s.registry == nil || s.fsys == nil || s.projectConfig == nil {
		return
	}
	res, err := usagelog.Import(context.Background(), s.fsys, s.registry, s.projectConfig.Paths.GeneratedDir)
	if err != nil {
		s.logger.Warn(logger.Message(fmt.Sprintf("Failed to import shim usage log: %v", err)))
		return
	}
	s.logger.Debug(logger.Message(fmt.Sprintf("Imported shim usage log: files=%d events=%d invalid=%d", res.Files, res.Events, res.InvalidLines)))
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

package dashboard

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

//go:embed all:dist
var assets embed.FS

// Server hosts the static visualization dashboard.
type Server struct {
	logger *logger.Logger
	port   int
	server *http.Server
	ln     net.Listener
	wg     sync.WaitGroup
}

// NewServer constructs a new dashboard server.
func NewServer(log *logger.Logger, port int) *Server {
	return &Server{
		logger: log.GetSubLogger("DashboardServer"),
		port:   port,
	}
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

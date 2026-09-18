package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/proxy"
)

// The development proxy keeps v1's contract: DEV_PROXY names the port, the
// cache lives in .tmp/http-proxy-cache under the working directory and entries
// live for a day. The one difference is that the Go CLI starts the proxy itself
// instead of expecting a separately started `bun proxy` process.
const (
	devProxyEnv      = "DEV_PROXY"
	devProxyCacheTTL = 24 * time.Hour
	minPort, maxPort = 1, 65535
)

var devProxyCacheDir = filepath.Join(".tmp", "http-proxy-cache")

// parseDevProxyPort validates a DEV_PROXY value the way v1 did: surrounding
// whitespace is tolerated, anything but an integer in the TCP port range is not.
func parseDevProxyPort(raw string) (int, error) {
	invalid := fmt.Errorf("Invalid %s: %q (expected an integer between %d and %d)", devProxyEnv, raw, minPort, maxPort)
	port, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || port < minPort || port > maxPort {
		return 0, invalid
	}
	return port, nil
}

// startDevProxy starts the caching proxy when DEV_PROXY is set and returns nil
// when it is not. An invalid value or an unbindable port is a hard error, so a
// developer who asked for the proxy never silently runs without it.
func startDevProxy(log *logger.Logger) (*proxy.Server, error) {
	raw, set := os.LookupEnv(devProxyEnv)
	if !set {
		return nil, nil
	}
	port, err := parseDevProxyPort(raw)
	if err != nil {
		return nil, err
	}

	srv := proxy.NewServer(log, port, devProxyCacheDir, devProxyCacheTTL.Milliseconds())
	if err := srv.Start(); err != nil {
		return nil, fmt.Errorf("starting the development HTTP proxy: %w", err)
	}
	log.Warn(logger.Message(fmt.Sprintf("Routing requests through HTTP proxy on port %d", port)))
	return srv, nil
}

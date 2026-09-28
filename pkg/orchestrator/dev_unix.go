//go:build !windows

package orchestrator

import (
	"os"
	"syscall"
)

func fileDev(info os.FileInfo) (uint64, bool) {
	if info == nil {
		return 0, false
	}
	if stat, ok := info.Sys().(*syscall.Stat_t); ok {
		return uint64(stat.Dev), true
	}
	return 0, false
}

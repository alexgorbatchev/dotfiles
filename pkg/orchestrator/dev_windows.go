//go:build windows

package orchestrator

import "os"

func fileDev(info os.FileInfo) (uint64, bool) {
	return 0, false
}

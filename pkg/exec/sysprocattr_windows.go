//go:build windows

package exec

import (
	"os/exec"
)

func setProcessGroup(cmd *exec.Cmd) {
	// Process group configuration on Windows if applicable
}

func killProcessGroup(cmd *exec.Cmd) error {
	if cmd == nil || cmd.Process == nil {
		return nil
	}
	return cmd.Process.Kill()
}

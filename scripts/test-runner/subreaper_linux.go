package main

import (
	"fmt"
	"syscall"
)

func enableSubreaper() error {
	// PR_SET_CHILD_SUBREAPER is Linux prctl option 36. Orphaned grandchildren
	// become our children so group completion never depends on PID 1 reaping.
	const prSetChildSubreaper = 36
	_, _, errno := syscall.Syscall6(syscall.SYS_PRCTL, prSetChildSubreaper, 1, 0, 0, 0, 0)
	if errno != 0 {
		return fmt.Errorf("enabling child subreaper: %w", errno)
	}
	return nil
}

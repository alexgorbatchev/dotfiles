//go:build !windows

package devtools

import (
	"errors"
	"os"
	"syscall"
)

func executableMode(mode os.FileMode) bool { return mode&0111 != 0 }

func tryFileLock(fd uintptr) (bool, error) {
	err := syscall.Flock(int(fd), syscall.LOCK_EX|syscall.LOCK_NB)
	if errors.Is(err, syscall.EWOULDBLOCK) || errors.Is(err, syscall.EAGAIN) {
		return false, nil
	}
	return err == nil, err
}

func unlockFile(fd uintptr) error { return syscall.Flock(int(fd), syscall.LOCK_UN) }

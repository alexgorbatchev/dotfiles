package devtools

import (
	"errors"
	"os"
	"syscall"
	"unsafe"
)

var (
	kernel32     = syscall.NewLazyDLL("kernel32.dll")
	lockFileEx   = kernel32.NewProc("LockFileEx")
	unlockFileEx = kernel32.NewProc("UnlockFileEx")
)

func executableMode(os.FileMode) bool { return true }

func tryFileLock(fd uintptr) (bool, error) {
	var overlap syscall.Overlapped
	// Exclusive, nonblocking lock of the first byte; the file may be empty.
	result, _, err := lockFileEx.Call(fd, 3, 0, 1, 0, uintptr(unsafe.Pointer(&overlap)))
	if result != 0 {
		return true, nil
	}
	if errors.Is(err, syscall.Errno(33)) { // ERROR_LOCK_VIOLATION
		return false, nil
	}
	return false, err
}

func unlockFile(fd uintptr) error {
	var overlap syscall.Overlapped
	result, _, err := unlockFileEx.Call(fd, 0, 1, 0, uintptr(unsafe.Pointer(&overlap)))
	if result != 0 {
		return nil
	}
	return err
}

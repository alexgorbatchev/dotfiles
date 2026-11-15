package installer

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

type appBundleIdentity struct {
	identifier string
	hash       string
}

// readAppBundleIdentity parses the same bytes it hashes. Passing them on stdin keeps
// plutil within the injected filesystem, including when tests use an in-memory tree.
func readAppBundleIdentity(ctx context.Context, fsys fs.FS, runner exec.CommandRunner, bundle string) (appBundleIdentity, error) {
	contents := filepath.Join(bundle, "Contents")
	info, err := fsys.Lstat(contents)
	if err != nil {
		return appBundleIdentity{}, fmt.Errorf("inspecting %s: %w", contents, err)
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return appBundleIdentity{}, fmt.Errorf("%s is not a real directory", contents)
	}
	plist := filepath.Join(contents, "Info.plist")
	info, err = fsys.Lstat(plist)
	if err != nil {
		return appBundleIdentity{}, fmt.Errorf("inspecting %s: %w", plist, err)
	}
	if !info.Mode().IsRegular() {
		return appBundleIdentity{}, fmt.Errorf("%s is not a regular file", plist)
	}
	data, err := fsys.ReadFile(plist)
	if err != nil {
		return appBundleIdentity{}, fmt.Errorf("reading %s: %w", plist, err)
	}
	args := []string{"-extract", "CFBundleIdentifier", "raw", "-expect", "string", "-o", "-", "--", "-"}
	cmd := runner.CommandContext(ctx, "plutil", args...)
	cmd.SetStdin(bytes.NewReader(data))
	result := runQuery(cmd, "plutil", args...)
	if result.err != nil {
		return appBundleIdentity{}, result.fail(result.err)
	}
	identifier := strings.TrimSpace(result.stdout)
	if identifier == "" {
		return appBundleIdentity{}, fmt.Errorf("%s has no CFBundleIdentifier", plist)
	}
	return appBundleIdentity{identifier: identifier, hash: fs.HashContent(data)}, nil
}

// Uninstall removes only the recorded copy. Configuration names are not ownership
// evidence: they may have changed, and a different app may now occupy the same path.
func (d *DmgInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig, installed Installation) error {
	bundle := installed.AppBundlePath
	leave := func(reason string) {
		if log := toolLogger(d.log, tool.Name); log != nil {
			log.Warn(logger.Message(fmt.Sprintf("%s is left in place: %s; remove it if it is no longer needed", bundle, reason)))
		}
	}
	if d.sysCtx.OS != "darwin" {
		if bundle != "" {
			leave("the target is not macOS")
		}
		return nil
	}
	if bundle == "" {
		if log := toolLogger(d.log, tool.Name); log != nil {
			log.Warn("No app bundle path was recorded; no application was removed")
		}
		return nil
	}
	if !isApplicationsBundle(bundle) {
		leave("it is not an app bundle directly inside /Applications")
		return nil
	}
	if installed.AppBundleIdentifier == "" || installed.AppBundleInfoPlistHash == "" {
		leave("no identity was recorded for it")
		return nil
	}
	if config.IsDryRunEnabled(ctx) {
		return nil
	}
	siblings := []string{bundleSibling(bundle, stagingBundlePrefix), bundleSibling(bundle, previousBundlePrefix)}
	pending := installed.AppBundlePendingRemoval
	if pending != "" && pending != bundle && pending != siblings[0] && pending != siblings[1] {
		return fmt.Errorf("refusing invalid pending app bundle removal %q", pending)
	}
	// A lexical /Applications path must not lead through a replaced parent link.
	if info, err := d.fsys.Lstat(applicationsDir); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return d.reconcileMissingBundle(pending, bundle)
		}
		return fmt.Errorf("inspecting %s: %w", applicationsDir, err)
	} else if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		leave("/Applications is not a real directory")
		return nil
	}
	if pending != "" {
		if _, err := d.fsys.Lstat(pending); errors.Is(err, os.ErrNotExist) {
			if err := d.fsys.RemoveAll(pending); err != nil {
				return fmt.Errorf("reconciling removal of %s: %w", pending, err)
			}
		} else if err != nil {
			return fmt.Errorf("inspecting pending removal %s: %w", pending, err)
		}
	}
	info, err := d.fsys.Lstat(bundle)
	if errors.Is(err, os.ErrNotExist) {
		// A prior delete may have succeeded while recording it failed. The injected
		// removal filesystem reconciles that missing path without touching siblings.
		return d.reconcileMissingBundle(pending, bundle)
	}
	if err != nil {
		return fmt.Errorf("inspecting %s: %w", bundle, err)
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		leave("it is no longer a real app bundle directory")
		return nil
	}
	identity, err := readAppBundleIdentity(ctx, d.fsys, d.runner, bundle)
	if err != nil {
		// Preserve the receipt on inspection failure, including a partially removed
		// bundle whose plist is gone. Retrying must never guess ownership.
		leave("its identity could not be verified: " + err.Error())
		return fmt.Errorf("verifying %s: %w; restore the recorded Info.plist or remove the remaining bundle manually before retrying", bundle, err)
	}
	if identity.identifier != installed.AppBundleIdentifier {
		leave(fmt.Sprintf("its bundle identifier is now %q, not the recorded %q", identity.identifier, installed.AppBundleIdentifier))
		return nil
	}
	if identity.hash != installed.AppBundleInfoPlistHash {
		leave("its Info.plist changed since dotfiles installed it")
		return nil
	}
	// Keep the verified main bundle intact until both siblings have been removed,
	// so a failed sibling deletion can be retried with the same identity check.
	for _, sibling := range siblings {
		if _, err := d.fsys.Lstat(sibling); errors.Is(err, os.ErrNotExist) {
			continue
		} else if err != nil {
			return fmt.Errorf("inspecting %s: %w", sibling, err)
		}
		if err := d.fsys.RemoveAll(sibling); err != nil {
			return fmt.Errorf("removing %s: %w", sibling, err)
		}
	}
	if err := d.fsys.RemoveAll(bundle); err != nil {
		return fmt.Errorf("removing %s: %w", bundle, err)
	}
	return nil
}

// reconcileMissingBundle never touches an existing sibling after the main bundle
// disappears: its identity can no longer establish ownership of those leftovers.
func (d *DmgInstaller) reconcileMissingBundle(pending, bundle string) error {
	if pending != "" && pending != bundle {
		if _, err := d.fsys.Lstat(pending); err == nil {
			return fmt.Errorf("cannot verify pending removal %s without %s; remove the leftover manually before retrying", pending, bundle)
		} else if !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("inspecting pending removal %s: %w", pending, err)
		}
		if err := d.fsys.RemoveAll(pending); err != nil {
			return err
		}
	}
	return d.fsys.RemoveAll(bundle)
}

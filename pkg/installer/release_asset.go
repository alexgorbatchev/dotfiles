package installer

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/arch"
	"github.com/alexgorbatchev/dotfiles/pkg/archive"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

// releaseAssetInstaller turns a downloaded release asset into the tool's binaries. The
// installers that pick an asset out of a release listing (github-release, gitea-release)
// share it so that "is this an archive" is answered in exactly one place, pkg/archive,
// and the two cannot drift apart again.
type releaseAssetInstaller struct {
	fsys      fs.FS
	extractor *archive.Extractor
	log       *logger.Logger // scoped to the tool; nil disables progress lines
}

// install places the asset downloaded to assetPath under destDir and returns the names of
// the binaries it provides.
//
// An archive pkg/archive can unpack is extracted in place and its binaries promoted. An
// asset with no archive suffix and no data-file suffix is the binary itself and is
// renamed to the tool and made executable. Anything else fails loudly: an archive format
// the extractor cannot open, or a file that plainly is not a program such as a checksum
// or a distro package. Quietly marking such a file executable produced installs that
// reported success and broke the first time the shim ran (issue #28).
func (r releaseAssetInstaller) install(ctx context.Context, assetPath, destDir string, tool *config.ToolConfig) ([]string, error) {
	name := filepath.Base(assetPath)
	switch {
	case archive.IsSupported(name):
		return r.extract(ctx, assetPath, destDir, tool)
	case archive.Extension(name) != "":
		_ = r.fsys.Remove(assetPath)
		return nil, fmt.Errorf("release asset %q is a %s archive, which cannot be extracted (supported: %s); set assetPattern to choose a different asset",
			name, archive.Extension(name), strings.Join(archive.SupportedExtensions(), ", "))
	case arch.IsDataAsset(name):
		_ = r.fsys.Remove(assetPath)
		return nil, fmt.Errorf("release asset %q is not a program or an archive; set assetPattern to choose a different asset", name)
	default:
		return r.installRawBinary(assetPath, destDir, tool)
	}
}

func (r releaseAssetInstaller) extract(ctx context.Context, assetPath, destDir string, tool *config.ToolConfig) ([]string, error) {
	if r.log != nil {
		r.log.Info(logger.Message(fmt.Sprintf("Extracting %s...", filepath.Base(assetPath))))
	}
	if err := r.extractor.Extract(ctx, assetPath, destDir); err != nil {
		_ = r.fsys.Remove(assetPath)
		return nil, fmt.Errorf("extracting asset archive: %w", err)
	}
	_ = r.fsys.Remove(assetPath)
	return PromoteBinaries(r.fsys, destDir, tool.Name, tool.Binaries)
}

func (r releaseAssetInstaller) installRawBinary(assetPath, destDir string, tool *config.ToolConfig) ([]string, error) {
	finalBinPath := filepath.Join(destDir, tool.Name)
	if assetPath != finalBinPath {
		if err := r.fsys.Rename(assetPath, finalBinPath); err != nil {
			return nil, fmt.Errorf("renaming release asset %q to %q: %w", filepath.Base(assetPath), tool.Name, err)
		}
	}
	if err := r.fsys.Chmod(finalBinPath, 0755); err != nil {
		return nil, fmt.Errorf("making %q executable: %w", finalBinPath, err)
	}
	return GetBinaryNames(tool.Name, tool.Binaries), nil
}

// toolLogger scopes log to a tool, or returns nil when there is no logger to scope.
func toolLogger(log *logger.Logger, toolName string) *logger.Logger {
	if log == nil {
		return nil
	}
	return log.GetSubLogger("", toolName)
}

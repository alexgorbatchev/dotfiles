package installer

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/vm"
)

// assetSelectorParam names the install parameter holding the selection callback.
// github-release and gitea-release take it at the top level; dmg and pkg keep their
// release settings inside `source`, so the callback lives one level down there.
const (
	assetSelectorParam       = "assetSelector"
	sourceAssetSelectorParam = "source.assetSelector"
)

// assetSelection describes one call of an author's assetSelector.
//
// Assets and Release are handed to the callback as they came back from the forge, so a
// selector can decide on anything the release carries -- a name, a tag, whether it is a
// prerelease -- rather than only on a filename pattern.
type assetSelection struct {
	Log          *logger.Logger
	FS           fs.FS
	Runner       exec.CommandRunner
	Tool         *config.ToolConfig
	Param        string
	Assets       any
	Release      any
	AssetPattern string
	// AssetNames is what the release offered, listed back when the selector picks
	// nothing so the author can see what there was to choose from.
	AssetNames []string
}

// selectAssetByCallback runs the author's assetSelector and returns the name of the
// asset it chose.
//
// A selector that returns nothing fails the installation rather than falling back to
// the built-in matcher, which is what v1 did (installFromGitHubRelease.ts:327-361):
// having asked for a specific asset, silently installing a different one is the outcome
// the parameter exists to prevent.
func selectAssetByCallback(ctx context.Context, sel assetSelection) (string, error) {
	selectorContext := map[string]any{
		"assets":  sel.Assets,
		"release": sel.Release,
	}
	if sel.AssetPattern != "" {
		selectorContext["assetPattern"] = sel.AssetPattern
	}

	value, err := vm.ResolveInstallParam(ctx, vm.ResolveRequest{
		Log:     sel.Log,
		FS:      sel.FS,
		Runner:  sel.Runner,
		Tool:    sel.Tool,
		ProjCfg: config.GetProjectConfig(ctx),
		Param:   sel.Param,
		Context: selectorContext,
	})
	if err != nil {
		return "", err
	}

	var chosen struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(value, &chosen); err != nil {
		return "", fmt.Errorf(
			"the assetSelector of %q returned %s; it must return one of the assets it was given, or nothing",
			sel.Tool.Name, value,
		)
	}
	if chosen.Name == "" {
		return "", fmt.Errorf("the assetSelector of %q chose no asset.%s", sel.Tool.Name, availableAssets(sel.AssetNames))
	}
	return chosen.Name, nil
}

// availableAssets lists what the release offered, for an error message.
func availableAssets(names []string) string {
	if len(names) == 0 {
		return " The release has no assets."
	}
	return " The release offers: " + strings.Join(names, ", ") + "."
}

// assetNames collects the names the selector had to choose from.
func assetNames[T any](assets []T, name func(T) string) []string {
	names := make([]string, 0, len(assets))
	for _, asset := range assets {
		names = append(names, name(asset))
	}
	return names
}

// pickNamedAsset finds the asset the selector named. A name that is not in the release
// is a mistake in the selector worth reporting, not a reason to download something else.
func pickNamedAsset[T any](toolName, chosen string, assets []T, name func(T) string, names []string) (*T, error) {
	for i := range assets {
		if name(assets[i]) == chosen {
			return &assets[i], nil
		}
	}
	return nil, fmt.Errorf(
		"the assetSelector of %q chose %q, which is not one of the release's assets.%s",
		toolName, chosen, availableAssets(names),
	)
}

// selectAsset decides which github-release asset to download.
//
// An `assetSelector` callback decides on its own: it is given every asset and the
// release they belong to, so it can choose on something a filename pattern cannot
// express -- the whole set of assets at once, or the release's tag. Without one, the
// built-in matcher narrows by `assetPattern` and then by platform and architecture.
func (g *GitHubInstaller) selectAsset(ctx context.Context, tool *config.ToolConfig, release *githubRelease, assetPattern string) (*githubAsset, error) {
	if vm.HasResolver(tool, assetSelectorParam) {
		names := assetNames(release.Assets, githubAssetName)
		chosen, err := selectAssetByCallback(ctx, assetSelection{
			Log:          g.log,
			FS:           g.fsys,
			Runner:       g.runner,
			Tool:         tool,
			Param:        assetSelectorParam,
			Assets:       release.Assets,
			Release:      release,
			AssetPattern: assetPattern,
			AssetNames:   names,
		})
		if err != nil {
			return nil, err
		}
		return pickNamedAsset(tool.Name, chosen, release.Assets, githubAssetName, names)
	}

	matched := g.matchAsset(release.Assets, assetPattern)
	if matched == nil {
		patternStr := ""
		if assetPattern != "" {
			patternStr = " and pattern " + assetPattern
		}
		return nil, fmt.Errorf(
			"no compatible asset found for release %q matching %s/%s%s",
			release.TagName, g.sysCtx.OS, g.sysCtx.Arch, patternStr,
		)
	}
	return matched, nil
}

// selectAsset decides which gitea-release asset to download, the same way
// github-release does.
func (g *GiteaInstaller) selectAsset(ctx context.Context, tool *config.ToolConfig, release *giteaRelease, assetPattern string) (*giteaAsset, error) {
	if vm.HasResolver(tool, assetSelectorParam) {
		names := assetNames(release.Assets, giteaAssetName)
		chosen, err := selectAssetByCallback(ctx, assetSelection{
			Log:          g.log,
			FS:           g.fsys,
			Runner:       g.runner,
			Tool:         tool,
			Param:        assetSelectorParam,
			Assets:       release.Assets,
			Release:      release,
			AssetPattern: assetPattern,
			AssetNames:   names,
		})
		if err != nil {
			return nil, err
		}
		return pickNamedAsset(tool.Name, chosen, release.Assets, giteaAssetName, names)
	}

	matched := matchAsset(release.Assets, g.sysCtx.OS, g.sysCtx.Arch, assetPattern)
	if matched == nil {
		return nil, fmt.Errorf("no matching release asset found for OS %s and Arch %s", g.sysCtx.OS, g.sysCtx.Arch)
	}
	return matched, nil
}

// selectAsset decides which release asset the dmg or pkg installer downloads. The
// callback lives inside `source`, next to the repository it selects from.
func (f macPackageFetcher) selectAsset(
	ctx context.Context,
	tool *config.ToolConfig,
	release *githubRelease,
	src macPackageSource,
	ext string,
) (*githubAsset, error) {
	if vm.HasResolver(tool, sourceAssetSelectorParam) {
		names := assetNames(release.Assets, githubAssetName)
		chosen, err := selectAssetByCallback(ctx, assetSelection{
			Log:          f.log,
			FS:           f.fsys,
			Runner:       f.runner,
			Tool:         tool,
			Param:        sourceAssetSelectorParam,
			Assets:       release.Assets,
			Release:      release,
			AssetPattern: src.assetPattern,
			AssetNames:   names,
		})
		if err != nil {
			return nil, err
		}
		return pickNamedAsset(tool.Name, chosen, release.Assets, githubAssetName, names)
	}

	matched := matchMacOSAsset(release.Assets, src.assetPattern, f.sysCtx.Arch, ext)
	if matched == nil {
		return nil, fmt.Errorf("no matching release asset found for OS %s and Arch %s", f.sysCtx.OS, f.sysCtx.Arch)
	}
	return matched, nil
}

func githubAssetName(a githubAsset) string { return a.Name }

func giteaAssetName(a giteaAsset) string { return a.Name }
